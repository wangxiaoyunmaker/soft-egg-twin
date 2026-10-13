import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticBuffer } from '../src/diagnostics/buffer.ts';
import { withDeadline } from '../src/diagnostics/deadline.ts';
test('diagnostic history remains bounded and retains only the newest records across reloads',()=>{
  const buffer=new DiagnosticBuffer(3);
  for(let i=0;i<10;i++)buffer.add({time:String(i),session:'test',type:'performance',data:{fps:60}});
  assert.deepEqual(buffer.records.map(r=>r.time),['7','8','9']);
  const restored=new DiagnosticBuffer(2);restored.restore(JSON.parse(JSON.stringify(buffer.records)));assert.deepEqual(restored.records.map(r=>r.time),['8','9']);
  restored.restore([null,{},'bad',{time:'10',session:'test',type:'error',data:'x'}]);assert.equal(restored.records.length,1);
});
test('late camera resources are cleaned after a timeout and cannot resolve the failed attempt',async()=>{
  let resolve!:(resource:{closed:boolean})=>void;
  const pending=new Promise<{closed:boolean}>(r=>resolve=r),resource={closed:false};
  await assert.rejects(withDeadline(pending,5,'测试摄像头',r=>r.closed=true),/超过/);
  resolve(resource);await Promise.resolve();assert.equal(resource.closed,true);
});
test('successful initialization clears its deadline; rejected initialization retains its original error',async()=>{
  assert.equal(await withDeadline(Promise.resolve(42),100,'model'),42);
  await assert.rejects(withDeadline(Promise.reject(new Error('permission denied')),100,'camera'),/permission denied/);
});
