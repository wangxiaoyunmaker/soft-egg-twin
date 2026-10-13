import { spawn } from 'node:child_process';
import { mkdirSync,openSync,closeSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=`${root}.diagnostics`;
try{
  const existing=await fetch('http://127.0.0.1:5174/__diagnostics/health',{signal:AbortSignal.timeout(2000)});
  if(existing.ok&&(await existing.json()).service==='soft-egg-twin'){console.log('Dev server already running at http://127.0.0.1:5174/');process.exit(0);}
}catch{/* Launch below; strictPort will reject another process on this port. */}
mkdirSync(dir,{recursive:true});
const output=openSync(`${dir}/launcher-output.log`,'w');
const child=spawn(process.execPath,['scripts/dev-server.mjs'],{cwd:root,detached:true,stdio:['ignore',output,output]});
child.on('error',error=>console.error(error));child.unref();closeSync(output);
writeFileSync(`${dir}/launcher.pid`,`${child.pid}\n`);
console.log(`Background dev launcher ${child.pid}; logs: ${dir}/server.log`);
