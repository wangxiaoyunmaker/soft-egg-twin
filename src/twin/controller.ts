import { defaultConfig,parseConfig } from './config.ts';
import { PressureEngine,parsePressure } from './pressure.ts';
import type { Gesture } from './pressure.ts';
import { SerialInput } from './serial.ts';
import { CameraInput } from './camera.ts';
import { HandPosition } from './tracking.ts';
import type { Landmark } from './tracking.ts';
import { element } from '../ui/panel.ts';
import type { World } from '../scene/world.ts';
import type { Simulation } from '../physics/simulation.ts';
const labels:Record<Gesture,string>={idle:'等你碰一碰',touch:'轻轻触碰',pinch:'被捏住了',hold:'持续握紧',stroke:'像是在抚摸'};
const storageKey='soft-egg-twin-config-v1';
export function installTwin(world:World,sim:Simulation,resetLab:()=>void){
  let config=structuredClone(defaultConfig);
  try{const saved=localStorage.getItem(storageKey);if(saved)config=parseConfig(JSON.parse(saved));}catch{/* Invalid or unavailable local storage falls back to the example. */}
  let engine=new PressureEngine(config);
  const serial=new SerialInput(),camera=new CameraInput(element<HTMLVideoElement>('#hand-video')),hand=new HandPosition();
  const abort=new AbortController(),opts={signal:abort.signal};
  let active=true,disposed=false,cameraBusy=false,serialBusy=false,serialMode=false;
  let demo:{kind:Gesture;start:number}|null=null,manual=config.zones.map(()=>0),lastRead=0,badPackets=0,lastError='';
  const pressureStatus=element('#pressure-status'),cameraStatus=element('#camera-status');
  let sliders:HTMLInputElement[]=[],outputs:HTMLOutputElement[]=[];
  function save(){try{localStorage.setItem(storageKey,JSON.stringify(config));}catch{element('#config-status').textContent='配置已生效，但浏览器没有保存权限';}}
  function syncAvailability(){
    element<HTMLButtonElement>('#serial-connect').disabled=serialBusy||!SerialInput.supported();
    element<HTMLButtonElement>('#camera-connect').disabled=cameraBusy;
    element<HTMLButtonElement>('#camera-center').disabled=!camera.running;
    element<HTMLButtonElement>('#pressure-zero').disabled=!serial.connected;
    element<HTMLInputElement>('#config-import').disabled=serialMode||serialBusy;
    sliders.forEach(s=>s.disabled=serialMode);
    document.querySelectorAll<HTMLButtonElement>('[data-demo]').forEach(b=>b.disabled=serialMode);
  }
  function buildSliders(){
    const parent=element('#zone-sliders');parent.replaceChildren();sliders=[];outputs=[];
    config.zones.forEach((zone,i)=>{
      const label=document.createElement('label');label.className='zone-slider';
      const row=document.createElement('span'),name=document.createElement('span'),out=document.createElement('output');name.textContent=zone.label;out.textContent='0%';row.append(name,out);
      const input=document.createElement('input');input.type='range';input.min='0';input.max='100';input.value='0';input.id=`zone-${zone.id}`;input.setAttribute('aria-label',`${zone.label}模拟压力`);
      input.addEventListener('input',()=>{if(!serialMode){demo=null;manual[i]=Number(input.value)/100;}},opts);
      label.append(row,input);parent.append(label);sliders.push(input);outputs.push(out);
    });
    world.configurePressure(config.zones);syncAvailability();
  }
  function release(){demo=null;manual.fill(0);engine.clear();sliders.forEach(s=>s.value='0');world.setTwinInput(active,0,0,engine.values,'idle');}
  async function disconnect(){
    serialMode=false;await serial.disconnect();engine.clear();manual.fill(0);demo=null;
    element('#serial-connect').textContent='连接 USB 串口';element('#input-source').textContent='模拟输入';
    pressureStatus.textContent='模拟压力，可直接试玩';element('#pressure-hint').textContent='滑块模拟各区域压力；也可以点上方动作体验。';syncAvailability();
  }
  function stopCamera(){camera.stop();hand.reset();element('#camera-preview').hidden=true;element('#camera-connect').textContent='开启摄像头';cameraStatus.textContent='摄像头未开启';syncAvailability();}
  function setMode(twin:boolean){
    active=twin;
    resetLab();release();hand.reset();
    element('#twin-controls').hidden=!twin;element('#twin-controls').scrollTop=0;element('#lab-controls').hidden=twin;
    element('#scene').setAttribute('aria-label',twin?'数字蛋：摄像头控制位置，多区域压力控制局部形变与表情。可使用右侧滑块模拟。':'拖动软蛋以拉伸，或切换勺子挖取。');
    element('#mode-twin').setAttribute('aria-pressed',String(twin));element('#mode-lab').setAttribute('aria-pressed',String(!twin));
    element('#scene').classList.toggle('twin',twin);
    element('.caption>p').textContent=twin?'握在手里，回应在眼前。':'Squish. Stretch. Make a face.';
    element('.caption>span').textContent=twin?'移动 · 捏握 · 轻轻抚摸':'A little squeeze, a little smile.';
    element('.intro>p').innerHTML=twin?'一点触碰。<br>一点回应。<br>陪在手心里的小家伙。':'A little softness.<br>A little gravity.<br>A very happy wobble.';
    element('.readings').hidden=twin;
    if(twin)sim.tool='twin';else {stopCamera();void disconnect();}
    world.setTwinInput(twin,0,0,engine.values,'idle');
  }
  element('#mode-twin').addEventListener('click',()=>setMode(true),opts);
  element('#mode-lab').addEventListener('click',()=>setMode(false),opts);
  element('#twin-reset').addEventListener('click',()=>{resetLab();sim.tool='twin';release();hand.recenter();},opts);
  element('#pressure-release').addEventListener('click',()=>{release();if(serialMode)pressureStatus.textContent='反馈已清除；持续施压会随下一帧恢复';},opts);
  element('#camera-connect').addEventListener('click',async()=>{
    if(camera.running){stopCamera();return;}
    cameraBusy=true;syncAvailability();cameraStatus.textContent='正在打开摄像头与手部模型…';
    try{
      await camera.start();
      if(disposed||!active){stopCamera();return;}
      element('#camera-preview').hidden=false;element('#camera-connect').textContent='关闭摄像头';cameraStatus.textContent='请把握蛋的手放入画面';
    }catch(error){cameraStatus.textContent=`无法开启：${error instanceof Error?error.message:String(error)}`;}
    finally{cameraBusy=false;syncAvailability();}
  },opts);
  element('#camera-center').addEventListener('click',()=>hand.recenter(),opts);
  element('#serial-connect').addEventListener('click',async()=>{
    serialBusy=true;syncAvailability();
    try{
      if(serial.connected){await disconnect();return;}
      release();badPackets=0;lastError='';serialMode=true;pressureStatus.textContent='请选择传感器串口…';
      await serial.connect(config.baudRate,line=>{
        try{engine.ingest(parsePressure(line,config),performance.now());lastError='';}
        catch(error){badPackets++;lastError=error instanceof Error?error.message:String(error);}
      },message=>{engine.clear();serialMode=false;pressureStatus.textContent=message;element('#input-source').textContent='模拟输入';element('#serial-connect').textContent='连接 USB 串口';syncAvailability();});
      if(disposed||!active){await disconnect();return;}
      if(serial.connected){element('#serial-connect').textContent='断开 USB';element('#input-source').textContent='USB 硬件';pressureStatus.textContent='已连接，等待压力数据';element('#pressure-hint').textContent='硬件输入中，滑块显示实际读数。断开 USB 后可继续模拟。';}
    }catch(error){serialMode=false;pressureStatus.textContent=`连接未完成：${error instanceof Error?error.message:String(error)}`;}
    finally{serialBusy=false;syncAvailability();}
  },opts);
  document.querySelectorAll<HTMLButtonElement>('[data-demo]').forEach(b=>b.addEventListener('click',()=>{if(!serialMode){manual.fill(0);demo={kind:b.dataset.demo as Gesture,start:performance.now()};}},opts));
  element('#pressure-zero').addEventListener('click',()=>{
    try{config=engine.calibrate(performance.now());save();element('#config-status').textContent='已记录当前握持基线。更用力捏握时触发反馈。';}
    catch(error){element('#config-status').textContent=error instanceof Error?error.message:String(error);}
  },opts);
  element('#config-export').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(config,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='egg-sensors.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  },opts);
  element('#config-import').addEventListener('change',async event=>{
    const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;
    try{
      if(file.size>32768)throw new Error('配置文件过大');
      const next=parseConfig(JSON.parse(await file.text()));
      if(serialMode||serialBusy)throw new Error('请先断开串口再更换测点');
      config=next;engine=new PressureEngine(config);manual=config.zones.map(()=>0);demo=null;buildSliders();save();element('#config-status').textContent=`已载入 ${config.zones.length} 个测点`;
    }catch(error){element('#config-status').textContent=error instanceof Error?error.message:String(error);}finally{input.value='';}
  },opts);
  function drawHand(points:Landmark[]){
    const canvas=element<HTMLCanvasElement>('#hand-overlay');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d')!;
    ctx.strokeStyle='#c4e6b6';ctx.fillStyle='#e4f6da';ctx.lineWidth=2;
    for(const ids of [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[17,0]]){
      ctx.beginPath();ids.forEach((id,i)=>{const p=points[id];if(p){if(i===0)ctx.moveTo((1-p.x)*320,p.y*240);else ctx.lineTo((1-p.x)*320,p.y*240);}});ctx.stroke();
    }
    for(const p of points){ctx.beginPath();ctx.arc((1-p.x)*320,p.y*240,2.5,0,Math.PI*2);ctx.fill();}
  }
  function demoValues(now:number){
    if(!demo)return manual;
    const t=(now-demo.start)/1000,values=config.zones.map(()=>0);
    if(demo.kind==='pinch'){
      if(t>1){demo=null;return values;}values[Math.min(2,values.length-1)]=Math.sin(Math.PI*t)*.88;
    }else if(demo.kind==='hold'){
      if(t>3){demo=null;return values;}
      const amount=Math.min(1,t*4,(3-t)*4)*.76;values.fill(amount);
    }else{
      if(t>2.4){demo=null;return values;}
      const preferred=['left','front','right'].map(id=>config.zones.findIndex(z=>z.id===id));
      const path=preferred.every(i=>i>=0)?preferred:config.zones.map((_,i)=>i).slice(0,3);
      const step=t/.65;
      path.forEach((id,i)=>values[id]=Math.max(0,1-Math.abs(step-i))*.25);
    }
    return values;
  }
  function update(dt:number,now:number){
    if(!active||disposed)return;
    if(!serialMode)engine.ingest({values:demoValues(now),normalized:true},now);
    engine.update(dt,now);
    try{const points=camera.sample(now);if(points){if(points.length)hand.receive(points,now);drawHand(points);}}
    catch(error){stopCamera();cameraStatus.textContent=`追踪已停止：${error instanceof Error?error.message:String(error)}`;}
    hand.update(dt,now);
    world.setTwinInput(true,hand.x,hand.y,engine.values,engine.gesture);
    if(now-lastRead>80){
      element('#gesture-label').textContent=labels[engine.gesture];element('#pressure-peak').textContent=`${Math.round(engine.peak*100)}%`;
      outputs.forEach((o,i)=>{o.textContent=`${Math.round(engine.values[i]*100)}%`;sliders[i].value=String(Math.round((serialMode||demo?engine.values[i]:manual[i])*100));});
      if(camera.running)cameraStatus.textContent=now-hand.lastSeen<400?'正在跟随你的手':'未看到手 · 位置保持';
      if(serialMode&&serial.connected)pressureStatus.textContent=lastError?`忽略无效帧：${lastError}`:engine.fresh(now)?`压力实时接收${badPackets?` · 已忽略 ${badPackets} 帧`:''}`:'数据已超时 · 等待完整压力帧';
      lastRead=now;
    }
  }
  buildSliders();setMode(true);syncAvailability();
  if(!SerialInput.supported())pressureStatus.textContent='串口需桌面 Chrome / Edge；当前可模拟体验';
  return {update,snapshot:()=>({active,source:serialMode?'serial':'simulation',values:[...engine.values],gesture:engine.gesture,camera:camera.running,hand:{x:hand.x,y:hand.y}}),dispose(){disposed=true;abort.abort();stopCamera();void serial.disconnect();engine.clear();}};
}
