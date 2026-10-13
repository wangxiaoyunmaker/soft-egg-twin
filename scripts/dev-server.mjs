import { spawn } from 'node:child_process';
import { mkdirSync,appendFileSync,existsSync,statSync,renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=`${root}.diagnostics`,logPath=`${dir}/server.log`;
mkdirSync(dir,{recursive:true});
function log(event,data={}){
  try{
    if(existsSync(logPath)&&statSync(logPath).size>2*1024*1024)renameSync(logPath,`${logPath}.previous`);
    appendFileSync(logPath,JSON.stringify({time:new Date().toISOString(),event,...data})+'\n');
  }catch(error){process.stderr.write(`Cannot write diagnostic log: ${error.message}\n`);}
}
log('launcher.start',{pid:process.pid,node:process.version});
const prep=spawn(process.execPath,['scripts/prepare-tracking.mjs'],{cwd:root,stdio:'inherit'});
prep.on('error',error=>{log('prepare.error',{message:error.message});process.exitCode=1;});
prep.on('exit',code=>{
  if(code!==0){log('prepare.exit',{code});process.exitCode=code??1;return;}
  const child=spawn(process.execPath,['node_modules/vite/bin/vite.js',...process.argv.slice(2)],{cwd:root,stdio:['ignore','pipe','pipe']});
  log('vite.start',{pid:child.pid});
  for(const [name,stream,target] of [['stdout',child.stdout,process.stdout],['stderr',child.stderr,process.stderr]])stream.on('data',chunk=>{target.write(chunk);log(`vite.${name}`,{message:chunk.toString().slice(0,8000)});});
  child.on('error',error=>{log('vite.error',{message:error.message});process.exitCode=1;});
  const health=setInterval(async()=>{
    const m=process.memoryUsage();log('launcher.health',{rssMB:Math.round(m.rss/1048576),uptimeSeconds:Math.round(process.uptime())});
    try{const response=await fetch('http://127.0.0.1:5174/__diagnostics/health',{signal:AbortSignal.timeout(3000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);log('vite.health',await response.json());}
    catch(error){log('vite.unreachable',{message:error.message});}
  },15000);
  for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>{log('launcher.signal',{signal});child.kill(signal);});
  child.on('exit',(code,signal)=>{clearInterval(health);log('vite.exit',{code,signal});process.exitCode=code??1;});
});
