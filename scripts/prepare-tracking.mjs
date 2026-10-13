import { cp,mkdir,access,writeFile,rename,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('../public/mediapipe/',import.meta.url);
await mkdir(root,{recursive:true});
await cp(new URL('../node_modules/@mediapipe/tasks-vision/wasm/',import.meta.url),new URL('wasm/',root),{recursive:true});
const model=new URL('hand_landmarker.task',root);
try{await access(model);}catch{
  console.log('Downloading the pinned MediaPipe hand model (first run only)…');
  const response=await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error(`Model download failed: ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1000000)throw new Error('Incomplete hand model');
  const temp=new URL('hand_landmarker.task.tmp',root);await writeFile(temp,bytes);await rename(temp,model);
}
const hash=createHash('sha256').update(await readFile(model)).digest('hex');
if(hash!=='fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1')throw new Error('Hand model checksum mismatch; remove public/mediapipe/hand_landmarker.task and retry');
console.log('Local hand model ready (SHA-256 verified).');
