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
test('motion waits for stable acquisition; mirrors translation and follows absolute image tilt',()=>{
  const m=new EggMotion();m.receive(observe(),0);m.receive(observe(),70);assert.equal(m.acquired,false);m.receive(observe(),140);assert.equal(m.acquired,true);
  m.receive(observe({x:.56,y:.42,angle:Math.PI/2+.35,scale:1.2}),210);settle(m,210);
  near(m.x,-.24);near(m.y,.16);near(m.roll,.35);near(m.scale,1.2,.04);
});
test('roll unwraps the ellipse boundary without a 180 degree flip',()=>{
  const m=new EggMotion();acquire(m);
  m.receive(observe({angle:Math.PI/2+.1}),210);settle(m,210);near(m.roll,.1);
  m.receive(observe({angle:Math.PI/2-.1}),280);settle(m,280);near(m.roll,-.1);
});
test('lost contour freezes pose; reacquisition resumes from the image vertical reference',()=>{
  const m=new EggMotion();acquire(m);m.receive(observe({angle:Math.PI/2+.3}),210);settle(m,210);
  const last=m.roll;m.receive(null,300);m.update(.1,900);near(m.roll,last,.001);
  for(const t of [1000,1070,1140])m.receive(observe({angle:Math.PI/2-.3}),t);
  settle(m,1140);near(m.roll,-.3);assert.equal(m.lastSeen,1140);
  m.receive(observe({angle:Math.PI/2-.2}),1210);settle(m,1210);near(m.roll,-.2);
});
test('round silhouettes hold roll; recenter and reset clear relative pose safely',()=>{
  const m=new EggMotion();acquire(m);m.receive(observe({angle:Math.PI/2+.3,x:.55,scale:1.1}),210);settle(m,210);
  const circle=observe({circle:true});assert.equal(circle.angleReliable,false);m.receive(circle,280);settle(m,280);near(m.roll,.3);
  assert.equal(m.recenter(300),true);settle(m,300);near(m.roll,.3);near(m.x,0);near(m.scale,1);
  assert.equal(m.recenter(1000),false);m.reset();assert.equal(m.acquired,false);assert.equal(m.roll,0);assert.equal(m.scale,1);
});
test('interrupted acquisition does not count nonconsecutive detections',()=>{
  const m=new EggMotion();m.receive(observe(),0);m.receive(null,70);m.receive(observe(),140);m.receive(observe(),210);assert.equal(m.acquired,false);m.receive(observe(),280);assert.equal(m.acquired,true);
});

test('egg search covers both hands even when the chosen positioning hand is above the real egg',()=>{
  const above=translateHand(supportHand(),0,-.7);
  assert.equal(detectEgg(eggFrame(),above,null),null);
  const observation=detectEgg(eggFrame(),[above,supportHand()],null)!;assert.ok(observation);near(observation.x,.5);near(observation.y,.46);
});


test('initially tilted acquisition does not redefine upright and a later upright pose returns to zero',()=>{
  const m=new EggMotion();for(const t of [0,70,140])m.receive(observe({angle:Math.PI/2+.6}),t);settle(m,140);near(m.roll,.6);
  m.receive(observe({angle:Math.PI/2}),210);settle(m,210);near(m.roll,0);
});
test('acquisition from a round contour does not use the first later tilted axis as upright',()=>{
  const m=new EggMotion();for(const t of [0,70,140])m.receive(observe({circle:true}),t);
  m.receive(observe({angle:Math.PI/2-.4}),210);settle(m,210);near(m.roll,-.4);
});
test('centering changes translation and scale but never introduces a persistent angular offset',()=>{
  const m=new EggMotion();acquire(m);m.receive(observe({angle:Math.PI/2+.5,x:.55}),210);settle(m,210);assert.ok(m.recenter(220));settle(m,220);near(m.roll,.5);near(m.x,0);
  m.receive(observe(),290);settle(m,290);near(m.roll,0);
});
test('returning to a vertical undirected axis removes accumulated rotation',()=>{
  const m=new EggMotion();acquire(m);let t=210;for(const angle of [1.9,2.5,3.0,-.4,0,.4,1.1,Math.PI/2]){m.receive(observe({angle}),t);settle(m,t);t+=70;}assert.equal(m.poseDiagnostics.targetRoll,0);settle(m,t-70);near(m.roll,0);
});

test('a shortened horizontal cap cannot replace the upright whole-egg orientation',()=>{
  const m=new EggMotion();acquire(m);
  const cap={...observe(),angle:0,major:observe().major*.65};
  for(const t of [210,280,350]){m.receive(cap,t);settle(m,t);near(m.roll,0);assert.equal(m.poseDiagnostics.reason,'partial-contour');}
});
test('a single abrupt axis outlier is ignored but a full rotated egg is accepted after confirmation',()=>{
  const m=new EggMotion();acquire(m);m.receive(observe({angle:0}),210);settle(m,210);near(m.roll,0);
  m.receive(observe(),280);settle(m,280);near(m.roll,0);
  for(const t of [350,420,490])m.receive(observe({angle:Math.PI/2+.9}),t);settle(m,490);near(m.roll,.9);
});
test('missing or round contours cannot freeze a wrong angle indefinitely; position stays held during neutral fallback',()=>{
  const m=new EggMotion();acquire(m);m.receive(observe({angle:Math.PI/2+.3,x:.55}),210);settle(m,210);const x=m.x;
  m.receive(null,300);for(let i=0;i<80;i++)m.update(.016,1500+i*16);near(m.roll,0,.012);near(m.x,x,.001);assert.equal(m.poseDiagnostics.reason,'neutral-fallback');
  for(const t of [3000,3070,3140])m.receive(observe(),t);settle(m,3140);near(m.roll,0);assert.equal(m.poseDiagnostics.reason,'measured');
});
test('segmentation reports candidate rejection reasons without capturing frames or landmarks',()=>{
  const debug:Record<string,unknown>={};detectEgg(eggFrame({x:.75}),translateHand(supportHand(),.25,0),observe(),undefined,debug);
  assert.ok((debug.rejected as Record<string,number>).association>0);assert.equal(debug.selected,null);assert.equal(debug.width,192);
});
