import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EggInteractions } from '../src/twin/egg-interactions.ts';
import { defaultConfig } from '../src/twin/config.ts';
import { supportHand,translateHand } from './fixtures/hands.ts';
import { egg,headHand } from './fixtures/egg-interactions.ts';
import { Expression } from '../src/scene/expression.ts';
const zones=defaultConfig.zones;
const read=(engine:EggInteractions,now:number)=>engine.feedback(now,zones.length);
test('a downward entry at the crown creates a short pat, stationary contact does not repeat it',()=>{
  const v=new EggInteractions();v.sample([supportHand(),headHand(2)],egg,zones,0);v.sample([supportHand(),headHand(1.2)],egg,zones,70);
  assert.equal(read(v,70).gesture,'pat');assert.ok(read(v,70).values[0]>.2);
  for(let t=140;t<=770;t+=70)v.sample([supportHand(),headHand(1.2)],egg,zones,t);
  assert.equal(read(v,770).gesture,'idle');
  v.sample([supportHand(),headHand(2)],egg,zones,840);v.sample([supportHand(),headHand(1.1)],egg,zones,910);assert.equal(read(v,910).gesture,'pat');
});
test('slow continuous sweeping across the crown gives head stroke; stationary hand and side contact do not',()=>{
  const v=new EggInteractions();let stroked=false;
  for(let i=0;i<9;i++){v.sample([supportHand(),headHand(1.05,-.7+i*.18)],egg,zones,i*70);stroked||=read(v,i*70).gesture==='headStroke';}
  assert.ok(stroked);
  const still=new EggInteractions();for(let i=0;i<15;i++){still.sample([headHand(1.05)],egg,zones,i*70);assert.equal(read(still,i*70).gesture,'idle');}
  const side=new EggInteractions();for(let i=0;i<10;i++){side.sample([headHand(.1,-.7+i*.18)],egg,zones,i*70);assert.equal(read(side,i*70).gesture,'idle');}
});
test('two separated palms below the egg create cradle only after stable support; two visible hands alone do not',()=>{
  const v=new EggInteractions(),a=translateHand(supportHand(),-.05,0),b={...translateHand(supportHand(),.05,0),id:2};
  for(let t=0;t<=420;t+=70)v.sample([a,b],egg,zones,t);
  assert.equal(read(v,420).gesture,'cradle');assert.ok(read(v,420).values.every(x=>x===0));
  v.sample([a],egg,zones,490);assert.equal(read(v,490).gesture,'idle');
  const far=new EggInteractions();for(let t=0;t<=420;t+=70)far.sample([a,translateHand(b,.5,0)],egg,zones,t);assert.equal(read(far,420).gesture,'idle');
});
test('moving the egg and both hands together cannot trigger a pat or stroke',()=>{
  const v=new EggInteractions();for(let i=0;i<12;i++){const dx=i*.01,dy=-i*.005;v.sample([translateHand(supportHand(),dx,dy),translateHand(headHand(1.1),dx,dy)],{...egg,x:egg.x+dx,y:egg.y+dy},zones,i*70);assert.equal(read(v,i*70).gesture,'idle');}
});
test('occlusion, sparse frames and hand identity changes cannot bridge a pat',()=>{
  const v=new EggInteractions();v.sample([headHand(2)],egg,zones,0);v.sample([headHand(1.1)],null,zones,70);assert.equal(read(v,70).gesture,'idle');
  v.sample([headHand(1.1)],egg,zones,140);assert.equal(read(v,140).gesture,'idle');
  v.sample([headHand(2)],egg,zones,210);v.sample([headHand(1.1)],egg,zones,1000);assert.equal(read(v,1000).gesture,'idle');
  v.sample([headHand(2)],egg,zones,1070);v.sample([{...headHand(1.1),id:3}],egg,zones,1140);assert.equal(read(v,1140).gesture,'idle');
  assert.equal(read(v,1500).gesture,'idle');
});
test('each of the three interactions selects a distinct expression, including hardware pressure during cradle',()=>{
  for(const [interaction,name] of [['head-pat','surprised'],['head-stroke','soothed'],['cradle','cherished']] as const){
    const e=new Expression();for(let i=0;i<40;i++)e.update(1/60,{held:false,pressing:false,displacement:0,lift:0,serving:false,pressure:.9,interaction});assert.equal(e.name,name);
    if(interaction==='head-pat')assert.ok(e.surprise>.9);
    if(interaction==='head-stroke')assert.ok(e.comfort>.9);
    if(interaction==='cradle')assert.ok(e.warmth>.9);
    e.reset();assert.equal(e.warmth,0);
  }
});

test('a single visible acting hand can pat and stroke without requiring a second supporting hand',()=>{
  const v=new EggInteractions();v.sample([headHand(2)],egg,zones,0);v.sample([headHand(1.2)],egg,zones,70);assert.equal(read(v,70).gesture,'pat');
  v.reset();let stroke=false;for(let i=0;i<9;i++){v.sample([headHand(1.05,-.7+i*.18)],egg,zones,i*70);stroke||=read(v,i*70).gesture==='headStroke';}assert.ok(stroke);
});

test('gradual descent across several frames triggers pat rather than requiring a single boundary jump',()=>{
  const v=new EggInteractions();for(const [i,u] of [2.3,2,1.8,1.6,1.35].entries())v.sample([headHand(u)],egg,zones,i*80);
  assert.equal(read(v,320).gesture,'pat');
});
test('a static fingertip of the holding hand cannot monopolize the moving hand history',()=>{
  const v=new EggInteractions(),holder={...headHand(1.0),id:1};let stroke=false;
  for(let i=0;i<9;i++){v.sample([holder,headHand(1.05,-.7+i*.18)],egg,zones,i*90);stroke||=read(v,i*90).gesture==='headStroke';}
  assert.ok(stroke);assert.equal(v.debug.reason,'headStroke');
});
test('a curved stroke does not require the palm to stay above the egg',()=>{
  const v=new EggInteractions();let stroke=false;
  for(let i=0;i<9;i++){const h=headHand(.85+i*.04,-.7+i*.18);h.center={x:.5,y:.55};v.sample([h],egg,zones,i*90);stroke||=read(v,i*90).gesture==='headStroke';}assert.ok(stroke);
});
test('cradling can resume after a long sample gap',()=>{
  const v=new EggInteractions(),a=translateHand(supportHand(),-.05,0),b={...translateHand(supportHand(),.05,0),id:2};
  for(const t of [0,420,1500,1920])v.sample([a,b],egg,zones,t);
  assert.equal(read(v,1920).gesture,'cradle');
});

test('a short lift and small quick descent can trigger a light pat without a high raise',()=>{
  const v=new EggInteractions();v.sample([headHand(1.65)],egg,zones,0);v.sample([headHand(1.38)],egg,zones,150);assert.equal(read(v,150).gesture,'pat');
  for(let t=300;t<=1050;t+=150)v.sample([headHand(1.38)],egg,zones,t);assert.equal(read(v,1050).gesture,'idle');
});
test('a tiny crown jitter does not count as a pat',()=>{
  const v=new EggInteractions();for(let i=0;i<14;i++){v.sample([headHand(1.55+(i%2?-.06:0))],egg,zones,i*150);assert.equal(read(v,i*150).gesture,'idle');}
});
test('two hands wrapping the lower sides of the egg can cradle with a palm slightly above centre',()=>{
  const v=new EggInteractions(),a=translateHand(supportHand(),-.05,-.15),b={...translateHand(supportHand(),.05,-.08),id:2};
  v.sample([a,b],egg,zones,0);assert.equal(read(v,0).gesture,'idle');v.sample([a,b],egg,zones,280);assert.equal(read(v,280).gesture,'cradle');
});
test('two palms above the egg do not count as hugging',()=>{
  const v=new EggInteractions(),a=translateHand(supportHand(),-.05,-.3),b={...translateHand(supportHand(),.05,-.3),id:2};
  for(const t of [0,150,300,450])v.sample([a,b],egg,zones,t);assert.notEqual(read(v,450).gesture,'cradle');
});
test('brief boundary noise does not restart the entire cradling dwell, but one hand cannot sustain it',()=>{
  const v=new EggInteractions(),a=translateHand(supportHand(),-.05,0),b={...translateHand(supportHand(),.05,0),id:2};
  v.sample([a,b],egg,zones,0);v.sample([a,translateHand(b,0,-.4)],egg,zones,140);v.sample([a,b],egg,zones,280);assert.equal(read(v,280).gesture,'cradle');v.sample([a],egg,zones,350);assert.notEqual(read(v,350).gesture,'cradle');
});

test('stable two-hand support keeps the hug expression when holding fingertips sweep along the crown',()=>{
  const v=new EggInteractions(),a=translateHand(supportHand(),-.05,0),base={...translateHand(supportHand(),.05,0),id:2};
  for(let i=0;i<9;i++){
    const b={...base,landmarks:base.landmarks.map(p=>({...p}))},moving=headHand(1.05,-.7+i*.18);
    for(const id of [4,8,12,16,20])b.landmarks[id]=moving.landmarks[id];
    v.sample([a,b],egg,zones,i*70);
  }
  assert.equal(read(v,560).gesture,'cradle');
});
test('the sensitivity control also changes the hugging dwell threshold',()=>{
  const a=translateHand(supportHand(),-.05,0),b={...translateHand(supportHand(),.05,0),id:2},fast=new EggInteractions(),slow=new EggInteractions();fast.sensitivity=1.8;slow.sensitivity=.6;
  for(const v of [fast,slow])for(const t of [0,200])v.sample([a,b],egg,zones,t);
  assert.equal(read(fast,200).gesture,'cradle');assert.equal(read(slow,200).gesture,'idle');
});
