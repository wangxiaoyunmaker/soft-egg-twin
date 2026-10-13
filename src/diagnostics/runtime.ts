import { DiagnosticBuffer } from './buffer.ts';
const storageKey='soft-egg-diagnostics-v1';
const errorText=(error:unknown)=>error instanceof Error?`${error.name}: ${error.message}\n${error.stack??''}`.slice(0,2000):String(error).slice(0,2000);
export class RuntimeDiagnostics {
  readonly buffer=new DiagnosticBuffer();
  private session=crypto.randomUUID();
  private abort=new AbortController();
  private timer:ReturnType<typeof setInterval>;
  private observer:PerformanceObserver|undefined;
  private lastFrame=performance.now();
  private lastSummary=performance.now();
  private lastSave=0;
  private frames=0;
  private maxGap=0;
  private totals:Record<string,{sum:number;max:number;count:number}>={};
  private lastSlow=0;
  private stalled=false;
  private fps=0;
  private longTasks=0;
  private longTaskMax=0;
  private state:()=>unknown=()=>({});
  private pendingStage='启动';
  private healthBusy=false;
  private lastHealth=0;
  private health='等待检测';
  private storageAvailable=true;
  private onUpdate=()=>this.event('dev.update',{});
  private onDisconnect=()=>this.event('dev.disconnected',{});
  private onConnect=()=>this.event('dev.connected',{});
  constructor(){
    try{const old=localStorage.getItem(storageKey);if(old&&old.length<750000)this.buffer.restore(JSON.parse(old));}catch{this.storageAvailable=false;}
    const parent=document.querySelector('#twin-controls')!;
    parent.insertAdjacentHTML('beforeend',`<details class="runtime-log"><summary>运行诊断与日志 <span>+</span></summary><output id="runtime-status" role="status">正在启动…</output><p id="runtime-detail"></p><button id="diagnostics-export">导出诊断日志</button><p>日志保留最近 240 条性能和状态，刷新后仍可导出。不记录摄像头图像、手部关键点或录音。</p></details>`);
    const opts={signal:this.abort.signal};
    document.querySelector('#diagnostics-export')!.addEventListener('click',()=>this.export(),opts);
    window.addEventListener('error',e=>this.event('window.error',{message:e.message,file:e.filename.split('/').at(-1),line:e.lineno,error:errorText(e.error)}),opts);
    window.addEventListener('unhandledrejection',e=>this.event('unhandledrejection',errorText(e.reason)),opts);
    document.addEventListener('visibilitychange',()=>{this.lastFrame=performance.now();this.stalled=false;this.event('visibility',{hidden:document.hidden});},opts);
    window.addEventListener('pagehide',()=>this.event('pagehide',{}),opts);
    if(import.meta.hot){
      import.meta.hot.on('vite:beforeUpdate',this.onUpdate);
      import.meta.hot.on('vite:ws:disconnect',this.onDisconnect);
      import.meta.hot.on('vite:ws:connect',this.onConnect);
    }
    try{
      this.observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){this.longTasks++;this.longTaskMax=Math.max(this.longTaskMax,entry.duration);}});
      this.observer.observe({type:'longtask',buffered:true});
    }catch{/* Some browsers do not expose long tasks. */}
    this.event('session.start',{userAgent:navigator.userAgent,path:location.pathname,viewport:{width:innerWidth,height:innerHeight},hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGB:(navigator as Navigator&{deviceMemory?:number}).deviceMemory??null});
    this.timer=setInterval(()=>this.tick(),1000);
  }
  event(type:string,data:unknown){this.buffer.add({time:new Date().toISOString(),session:this.session,type,data});this.save();}
  stage(name:string){this.pendingStage=name;}
  setState(read:()=>unknown){this.state=read;}
  measure<T>(name:string,fn:()=>T):T {
    this.pendingStage=name;
    const start=performance.now();try{return fn();}finally{
      const ms=performance.now()-start,bucket=this.totals[name]??={sum:0,max:0,count:0};bucket.sum+=ms;bucket.max=Math.max(bucket.max,ms);bucket.count++;
      if(ms>150&&start-this.lastSlow>5000){this.lastSlow=start;this.event('slow.stage',{stage:name,ms:Math.round(ms)});}
    }
  }
  recordMeasurement(name:string,ms:number){
    const bucket=this.totals[name]??={sum:0,max:0,count:0};bucket.sum+=ms;bucket.max=Math.max(bucket.max,ms);bucket.count++;
  }
  frame(gapMs:number){
    const now=performance.now();this.lastFrame=now;this.frames++;this.maxGap=Math.max(this.maxGap,gapMs);this.pendingStage='等待下一帧';
    if(gapMs>1500&&!document.hidden)this.event('frame.gap',{ms:Math.round(gapMs)});
  }
  private memory(){
    const memory=(performance as Performance&{memory?:{usedJSHeapSize:number;totalJSHeapSize:number;jsHeapSizeLimit:number}}).memory;
    return memory?{usedMB:Math.round(memory.usedJSHeapSize/1048576),allocatedMB:Math.round(memory.totalJSHeapSize/1048576),limitMB:Math.round(memory.jsHeapSizeLimit/1048576)}:null;
  }
  private tick(){
    const now=performance.now(),gap=now-this.lastFrame;
    if(!document.hidden&&gap>3000&&!this.stalled){this.stalled=true;this.event('render.stalled',{gapMs:Math.round(gap),lastStage:this.pendingStage});}
    if(gap<1000)this.stalled=false;
    if(now-this.lastSummary>=5000){
      this.fps=Math.round(this.frames*1000/(now-this.lastSummary));
      const stages=Object.fromEntries(Object.entries(this.totals).map(([name,v])=>[name,{meanMs:+(v.sum/v.count).toFixed(1),maxMs:+v.max.toFixed(1),calls:v.count}]));
      this.event('performance',{fps:this.fps,maxFrameGapMs:Math.round(this.maxGap),stages,longTasks:this.longTasks,longTaskMaxMs:Math.round(this.longTaskMax),jsHeap:this.memory(),hidden:document.hidden,state:this.state()});
      this.lastSummary=now;this.frames=0;this.maxGap=0;this.totals={};this.longTasks=0;this.longTaskMax=0;
    }
    if(import.meta.env.DEV&&now-this.lastHealth>15000&&!this.healthBusy)void this.checkHealth(now);
    const memory=this.memory();
    document.querySelector('#runtime-status')!.textContent=document.hidden?'页面在后台':this.stalled?`画面超过 3 秒未更新 · ${this.pendingStage}`:`${this.fps} FPS · ${memory?`JS 堆 ${memory.usedMB} MB`:'浏览器未提供 JS 内存读数'}`;
    document.querySelector('#runtime-detail')!.textContent=`本地服务：${import.meta.env.DEV?this.health:'生产页面'}。${this.storageAvailable?'最近日志已保存在本机浏览器。':'浏览器不允许持久保存，当前会话仍可导出。'}JS 堆不包含全部 WASM、视频与 GPU 内存。`;
    if(now-this.lastSave>5000)this.save();
  }
  private async checkHealth(now:number){
    this.healthBusy=true;this.lastHealth=now;const start=performance.now();
    try{
      const response=await fetch(`${import.meta.env.BASE_URL}__diagnostics/health`,{cache:'no-store',signal:AbortSignal.timeout(3000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const server=await response.json();this.health='可连接';this.event('server.health',{ms:Math.round(performance.now()-start),server});
    }catch(error){this.health='连接失败';this.event('server.unreachable',errorText(error));}
    finally{this.healthBusy=false;}
  }
  private save(){
    try{localStorage.setItem(storageKey,JSON.stringify(this.buffer.records));this.storageAvailable=true;}catch{this.storageAvailable=false;}
    this.lastSave=performance.now();
  }
  private export(){
    this.event('export',{});
    const blob=new Blob([JSON.stringify({schema:'soft-egg-diagnostics/1',exportedAt:new Date().toISOString(),session:this.session,records:this.buffer.records},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`egg-diagnostics-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  dispose(){this.event('session.end',{});clearInterval(this.timer);this.observer?.disconnect();this.abort.abort();import.meta.hot?.off('vite:beforeUpdate',this.onUpdate);import.meta.hot?.off('vite:ws:disconnect',this.onDisconnect);import.meta.hot?.off('vite:ws:connect',this.onConnect);}
}
/** Optional so standalone replay fixtures can use the same camera/controller. */
export let diagnostics:RuntimeDiagnostics|undefined;
export function startDiagnostics(){return diagnostics=new RuntimeDiagnostics();}
