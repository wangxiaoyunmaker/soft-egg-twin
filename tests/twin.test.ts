import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig,parseConfig } from '../src/twin/config.ts';
import { LineDecoder,PressureEngine,parsePressure } from '../src/twin/pressure.ts';
import { HandPosition,palmCenter } from '../src/twin/tracking.ts';
import { PressureSkin } from '../src/twin/deformation.ts';
import { makeVolumeMesh } from '../src/physics/mesh.ts';
import { PuddingSurface } from '../src/pudding/surface.ts';
import { Expression } from '../src/scene/expression.ts';
const config=()=>structuredClone(defaultConfig);
function run(engine:PressureEngine,values:number[],seconds:number,start=0){
  for(let t=start;t<start+seconds*1000;t+=20){engine.ingest({values,normalized:true},t);engine.update(.02,t);}
}
test('USB packets require every configured channel; malformed and nonfinite values never enter the model',()=>{
  const c=config();
  assert.deepEqual(parsePressure('{"pressure":[0,1,2,3,4,5]}',c).values,[0,1,2,3,4,5]);
  assert.equal(parsePressure('{"pressure":{"top":0,"left":0.1,"front":0,"right":0,"back":0,"base":0},"normalized":true}',c).values[1],.1);
  for(const packet of ['{}','{"pressure":[1]}','{"pressure":[0,0,null,0,0,0]}','{"pressure":[0,0,1e999,0,0,0]}','{"pressure":[0,0,-1,0,0,0]}','{"pressure":[0,0,2,0,0,0],"normalized":true}','{"pressure":{"top":0}}'])assert.throws(()=>parsePressure(packet,c));
});
test('line framing survives chunks, CRLF, and an oversized frame before the next valid packet',()=>{
  const decoder=new LineDecoder();
  assert.deepEqual(decoder.push('{"press'),[]);
  assert.deepEqual(decoder.push('ure":[1]}\r\n\n'),['{"pressure":[1]}']);
  assert.deepEqual(decoder.push('x'.repeat(10000)+'\n{"pressure":[2]}\n'),['{"pressure":[2]}']);
});
test('raw calibration is per region, explicit, and stale hardware cannot be calibrated',()=>{
  const e=new PressureEngine(config());e.ingest({values:[100,200,300,400,500,600],normalized:false},0);
  const next=e.calibrate(50);assert.equal(next.zones[1].baseline,200);
  e.ingest({values:[100,200,300,400,500,600],normalized:false},60);e.update(.05,60);assert.equal(e.peak,0);
  e.ingest({values:[4095,200,300,400,500,600],normalized:false},80);e.update(.05,80);assert.ok(e.values[0]>.5);assert.equal(e.values[1],0);
  assert.throws(()=>e.calibrate(900));
  e.ingest({values:[0,0,0,0,0,0],normalized:true},1000);assert.throws(()=>e.calibrate(1000));
});
test('squeeze, sustained broad grip, release, and stale input have distinct behavior',()=>{
  const e=new PressureEngine(config());run(e,[0,0,.85,0,0,0],.2);assert.equal(e.gesture,'pinch');
  run(e,[.7,.7,.7,.7,0,0],1,200);assert.equal(e.gesture,'hold');
  e.update(.05,2200);assert.equal(e.gesture,'idle');
  for(let i=0;i<60;i++)e.update(.02,2200+i*20);assert.ok(e.peak<.001);
  e.clear();assert.equal(e.peak,0);assert.equal(e.fresh(0),false);
});
test('stroke needs a sequence of three neighboring low-pressure regions; one region and strong grip are not strokes',()=>{
  const e=new PressureEngine(config());run(e,[0,.22,0,0,0,0],.3,0);assert.equal(e.gesture,'touch');
  run(e,[0,0,.22,0,0,0],.3,300);assert.notEqual(e.gesture,'stroke');
  run(e,[0,0,0,.22,0,0],.3,600);assert.equal(e.gesture,'stroke');
  run(e,[.7,.7,.7,0,0,0],.25,900);assert.notEqual(e.gesture,'stroke');
  const still=new PressureEngine(config());run(still,[0,.2,0,0,0,0],3);assert.equal(still.gesture,'touch');
});
test('config rejects collisions, unsafe keys, invalid positions and reversed calibration',()=>{
  assert.equal(parseConfig(config()).zones.length,6);
  for(const mutate of [(c:ReturnType<typeof config>)=>c.zones[1].id=c.zones[0].id,(c:ReturnType<typeof config>)=>c.zones[0].position[1]=4,(c:ReturnType<typeof config>)=>c.zones[0].maximum=0,(c:ReturnType<typeof config>)=>c.zones[0].id='__proto__']){const c=config();mutate(c);assert.throws(()=>parseConfig(c));}
});
test('hand mapping mirrors horizontal movement, holds on loss, and recenters without rotation or depth estimates',()=>{
  const points=Array.from({length:21},()=>({x:.5,y:.5}));const h=new HandPosition();assert.ok(palmCenter(points));assert.equal(palmCenter([]),null);
  h.receive(points,0);h.receive(points.map(p=>({...p,x:.4,y:.4})),100);h.update(.1,100);
  assert.ok(h.x>0&&h.y>0);const x=h.x;h.update(.1,1000);assert.equal(h.x,x);
  h.recenter();h.receive(points.map(p=>({...p,x:.4,y:.4})),1010);h.update(.1,1010);assert.ok(h.x<x);
  h.reset();assert.equal(h.x,0);assert.equal(h.lastSeen,-Infinity);
});
test('pressure deforms the matching skin region and remains bounded with all channels at maximum',()=>{
  const mesh=makeVolumeMesh(),skin=new PuddingSurface(mesh),deform=new PressureSkin(skin.rest,mesh.height,config().zones);
  const positions=skin.rest.slice(),touch=new Float32Array(skin.count);
  deform.apply(positions,touch,[0,0,0,0,0,0]);assert.deepEqual(positions,skin.rest);
  deform.apply(positions,touch,[0,0,1,0,0,0]);assert.ok(Math.max(...touch)>.9);
  let front=0,back=0;
  for(let i=0;i<skin.count;i++){const j=i*3,d=Math.hypot(positions[j]-skin.rest[j],positions[j+1]-skin.rest[j+1],positions[j+2]-skin.rest[j+2]);if(skin.rest[j+2]>.5)front+=d;if(skin.rest[j+2]<-.5)back+=d;}
  assert.ok(front>back*10);
  positions.set(skin.rest);deform.apply(positions,touch,[1,1,1,1,1,1]);
  for(let i=0;i<skin.count;i++){const j=i*3;assert.ok(Math.hypot(positions[j]-skin.rest[j],positions[j+1]-skin.rest[j+1],positions[j+2]-skin.rest[j+2])<=.16001);}
  assert.ok(positions.every(Number.isFinite));
});
test('pressure affects face and stroke gives a separate comfort expression',()=>{
  const face=new Expression(),input={held:false,pressing:false,displacement:0,lift:0,serving:false};
  face.update(.1,{...input,pressure:.8});assert.equal(face.name,'squished');
  face.update(.1,{...input,pressure:.2,stroke:true});assert.equal(face.name,'soothed');assert.ok(face.comfort>0);
  face.reset();assert.equal(face.comfort,0);assert.equal(face.name,'happy');
});

import { SerialInput } from '../src/twin/serial.ts';
test('serial lifecycle assembles split packets, closes on EOF, and reports disconnection',async()=>{
  let controller!:ReadableStreamDefaultController<Uint8Array>,closed=0,ended='';
  const stream=new ReadableStream<Uint8Array>({start(c){controller=c;}});
  const port={readable:stream,async open(){},async close(){closed++;}};
  const input=new SerialInput({async requestPort(){return port;}}),lines:string[]=[];
  await input.connect(115200,line=>lines.push(line),message=>ended=message);
  assert.equal(input.connected,true);
  controller.enqueue(new TextEncoder().encode('{"pressure":['));
  controller.enqueue(new TextEncoder().encode('1,2]}\n'));controller.close();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(lines,['{"pressure":[1,2]}']);assert.equal(input.connected,false);assert.equal(closed,1);assert.ok(ended);
});
test('manual serial disconnect cancels its reader and never leaves a locked port',async()=>{
  let cancelled=false,closed=false;
  const stream=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}});
  const input=new SerialInput({async requestPort(){return {readable:stream,async open(){},async close(){closed=true;}};}});
  await input.connect(115200,()=>{},()=>assert.fail('manual stop should not report an unexpected disconnect'));
  await input.disconnect();assert.ok(cancelled&&closed);assert.equal(stream.locked,false);assert.equal(input.connected,false);
});
test('disconnect during a pending port picker cannot later open the selected port',async()=>{
  let finish!:(port:{readable:null;open:()=>Promise<void>;close:()=>Promise<void>})=>void,opened=false;
  const input=new SerialInput({requestPort:()=>new Promise(resolve=>finish=resolve)});
  const pending=input.connect(115200,()=>{},()=>{});await input.disconnect();
  finish({readable:null,async open(){opened=true;},async close(){}});await pending;
  assert.equal(opened,false);assert.equal(input.connected,false);
});
