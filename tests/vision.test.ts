import test from 'node:test';
import assert from 'node:assert/strict';
import { TwoHandTracker } from '../src/twin/tracking.ts';
import { VisionGestures } from '../src/twin/vision-gestures.ts';
import { defaultConfig } from '../src/twin/config.ts';
import { supportHand,translateHand,gripHand,actorAt } from './fixtures/hands.ts';
const zones=defaultConfig.zones;
const readHolder=(tracker:TwoHandTracker)=>tracker.holder;
const result=(v:VisionGestures,now:number)=>v.feedback(now,zones.length);
function ready(v:VisionGestures){v.sample(supportHand(),undefined,zones,0);v.sample(supportHand(),undefined,zones,500);}
test('two-hand identity and support role survive detection array reorder and missing support hand',()=>{
  const tracker=new TwoHandTracker(),holder=supportHand(),actor=actorAt(.8,-.5);
  tracker.update([holder,actor],0);const id=tracker.holderId;
  assert.equal(readHolder(tracker)?.handedness,'Left');assert.equal(tracker.hands.length,2);
  tracker.update([translateHand(actor,.01,0),translateHand(holder,.01,0)],70);assert.equal(tracker.holderId,id);assert.equal(readHolder(tracker)?.handedness,'Left');
  tracker.update([actor],140);assert.equal(tracker.holderId,id);assert.equal(readHolder(tracker),undefined);assert.equal(tracker.actor?.handedness,'Right');
  tracker.update([actor,holder],210);assert.equal(readHolder(tracker)?.id,id);
  assert.ok(tracker.swap());assert.equal(readHolder(tracker)?.handedness,'Right');
});
test('hands crossing cannot swap roles just because the other hand is closer to the old palm position',()=>{
  const tracker=new TwoHandTracker(),a=supportHand(),b={...translateHand(a,.2,0),id:2,handedness:'Right'};
  tracker.update([a,b],0);const id=tracker.holderId;
  tracker.update([translateHand(b,-.18,0),translateHand(a,.18,0)],70);assert.equal(tracker.holderId,id);assert.equal(readHolder(tracker)?.handedness,'Left');
});
test('natural holding is calibrated; closing fingers gives pinch then hold, and reopening releases',()=>{
  const v=new VisionGestures();ready(v);assert.equal(result(v,500).gesture,'idle');
  v.sample(gripHand(.6),undefined,zones,570);assert.equal(result(v,570).gesture,'pinch');
  for(let t=640;t<=1200;t+=70)v.sample(gripHand(.6),undefined,zones,t);
  assert.equal(result(v,1200).gesture,'hold');assert.ok(Math.max(...result(v,1200).values)>.4);
  v.sample(supportHand(),undefined,zones,1270);assert.equal(result(v,1270).gesture,'idle');
});
test('second hand approaches and presses inward, while a distant hand gives no feedback',()=>{
  const v=new VisionGestures();ready(v);
  v.sample(supportHand(),actorAt(2,0),zones,570);assert.equal(result(v,570).gesture,'idle');
  v.sample(supportHand(),actorAt(1.2,0),zones,640);assert.equal(result(v,640).gesture,'touch');
  v.sample(supportHand(),actorAt(.95,0),zones,710);v.sample(supportHand(),actorAt(.7,0),zones,780);
  assert.equal(result(v,780).gesture,'press');assert.ok(Math.max(...result(v,780).values)>.4);
});
test('second hand sweeping tangentially creates a stroke; stationary touching does not',()=>{
  const v=new VisionGestures();ready(v);let stroke=false;
  for(let i=0;i<9;i++){const now=570+i*70;v.sample(supportHand(),actorAt(-.7+i*.15,-.6),zones,now);stroke||=result(v,now).gesture==='stroke';}
  assert.ok(stroke);
  const still=new VisionGestures();ready(still);
  for(let i=0;i<15;i++){const now=570+i*70;still.sample(supportHand(),actorAt(0,-.6),zones,now);assert.notEqual(result(still,now).gesture,'stroke');assert.notEqual(result(still,now).gesture,'press');}
});
test('moving both hands together is not pressing or stroking',()=>{
  const v=new VisionGestures();ready(v);
  for(let i=0;i<12;i++){const now=570+i*70;v.sample(translateHand(supportHand(),i*.01,-i*.005),translateHand(actorAt(0,-.6),i*.01,-i*.005),zones,now);assert.equal(result(v,now).gesture,'touch');}
});
test('tracking loss clears touch, does not bridge stroke history, and stale output expires',()=>{
  const v=new VisionGestures();ready(v);
  v.sample(supportHand(),actorAt(-.5,-.6),zones,570);v.sample(supportHand(),actorAt(-.3,-.6),zones,640);
  v.sample(undefined,actorAt(0,-.6),zones,710);assert.equal(result(v,710).gesture,'idle');assert.ok(result(v,710).values.every(p=>p===0));
  v.sample(supportHand(),actorAt(.5,-.6),zones,780);assert.notEqual(result(v,780).gesture,'stroke');
  assert.equal(result(v,1200).gesture,'idle');assert.ok(result(v,1200).values.every(p=>p===0));
});
test('calibration cancels an already clenched resting grip; fast jumps are rejected',()=>{
  const v=new VisionGestures();ready(v);v.sample(gripHand(.6),undefined,zones,570);v.calibrate();
  v.sample(gripHand(.6),undefined,zones,640);assert.equal(result(v,640).gesture,'idle');
  v.reset();ready(v);v.sample(supportHand(),actorAt(-.8,0),zones,570);v.sample(supportHand(),actorAt(.8,0),zones,640);
  assert.equal(result(v,640).gesture,'idle');
});
test('prolonged support-hand occlusion never silently promotes the touching hand',()=>{
  const tracker=new TwoHandTracker(),holder=supportHand(),actor=actorAt(.8,-.5);
  tracker.update([holder,actor],0);const id=tracker.holderId;
  tracker.update([actor],2500);assert.equal(tracker.holderId,id);assert.equal(readHolder(tracker),undefined);
  tracker.update([actor,translateHand(holder,-.35,0)],2600);assert.equal(readHolder(tracker)?.id,id);
});
test('releasing feedback does not silently recalibrate a clenched hand',()=>{
  const v=new VisionGestures();ready(v);v.sample(gripHand(.6),undefined,zones,570);assert.equal(result(v,570).gesture,'pinch');
  v.release();v.sample(gripHand(.6),undefined,zones,640);assert.equal(result(v,640).gesture,'pinch');
  v.calibrate();v.sample(gripHand(.6),undefined,zones,710);assert.equal(result(v,710).gesture,'idle');
});
