import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectEgg,EggMotion } from '../src/twin/egg-tracking.ts';
import { eggFrame } from './fixtures/egg.ts';
import { supportHand,translateHand } from './fixtures/hands.ts';
const observe=(options:Parameters<typeof eggFrame>[0]={})=>detectEgg(eggFrame(options),supportHand(),null)!;
const near=(a:number,b:number,tolerance=.025)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function acquire(m:EggMotion){for(const t of [0,70,140])m.receive(observe(),t);}
function settle(m:EggMotion,now:number){for(let i=0;i<20;i++)m.update(.016,now);}

test('yellow egg pixels yield centroid and long axis with pixel aspect correction',()=>{
  const egg=observe({angle:.6});assert.ok(egg);near(egg.x,.5);near(egg.y,.46);near(egg.angle,.6);assert.ok(egg.angleReliable);near(egg.major,36/192);
});
test('yellow segmentation rejects skin, white, blue and a full yellow background',()=>{
  for(const color of [[201,139,97],[240,235,225],[20,40,210]])assert.equal(detectEgg(eggFrame({color}),supportHand(),null),null);
  const frame=eggFrame();for(let i=0;i<frame.data.length;i+=4){frame.data[i]=241;frame.data[i+1]=202;frame.data[i+2]=30;}
  assert.equal(detectEgg(frame,supportHand(),null),null);
});
test('hand proximity selects the egg instead of a distant yellow distractor',()=>{
  const egg=observe({distractor:true});near(egg.x,.5);near(egg.y,.46);
  assert.equal(detectEgg(eggFrame(),undefined,null),null);
  assert.ok(detectEgg(eggFrame(),undefined,egg));
});
test('component association rejects a distant jump and major size change',()=>{
  const initial=observe();
  assert.equal(detectEgg(eggFrame({x:.75}),translateHand(supportHand(),.25,0),initial),null);
  assert.equal(detectEgg(eggFrame({scale:1.8}),supportHand(),initial),null);
});
test('motion waits for stable acquisition; mirrors translation and follows relative roll',()=>{
  const m=new EggMotion();m.receive(observe(),0);m.receive(observe(),70);assert.equal(m.acquired,false);m.receive(observe(),140);assert.equal(m.acquired,true);
  m.receive(observe({x:.56,y:.42,angle:Math.PI/2+.35,scale:1.2}),210);settle(m,210);
  near(m.x,-.24);near(m.y,.16);near(m.roll,.35);near(m.scale,1.2,.04);
});
test('roll unwraps the ellipse boundary without a 180 degree flip',()=>{
  const m=new EggMotion();acquire(m);
  m.receive(observe({angle:Math.PI/2+.1}),210);settle(m,210);near(m.roll,.1);
  m.receive(observe({angle:Math.PI/2-.1}),280);settle(m,280);near(m.roll,-.1);
});
test('lost contour freezes pose; reacquisition resumes from the closest visible long axis',()=>{
  const m=new EggMotion();acquire(m);m.receive(observe({angle:Math.PI/2+.3}),210);settle(m,210);
  const last=m.roll;m.receive(null,300);m.update(.1,900);near(m.roll,last,.001);
  for(const t of [1000,1070,1140])m.receive(observe({angle:Math.PI/2-.3}),t);
  settle(m,1140);near(m.roll,-.3);assert.equal(m.lastSeen,1140);
  m.receive(observe({angle:Math.PI/2-.2}),1210);settle(m,1210);near(m.roll,-.2);
});
test('round silhouettes hold roll; recenter and reset clear relative pose safely',()=>{
  const m=new EggMotion();acquire(m);m.receive(observe({angle:Math.PI/2+.3,x:.55,scale:1.1}),210);settle(m,210);
  const circle=observe({circle:true});assert.equal(circle.angleReliable,false);m.receive(circle,280);settle(m,280);near(m.roll,.3);
  assert.equal(m.recenter(300),true);settle(m,300);near(m.roll,0);near(m.x,0);near(m.scale,1);
  assert.equal(m.recenter(1000),false);m.reset();assert.equal(m.acquired,false);assert.equal(m.roll,0);assert.equal(m.scale,1);
});
test('interrupted acquisition does not count nonconsecutive detections',()=>{
  const m=new EggMotion();m.receive(observe(),0);m.receive(null,70);m.receive(observe(),140);m.receive(observe(),210);assert.equal(m.acquired,false);m.receive(observe(),280);assert.equal(m.acquired,true);
});
