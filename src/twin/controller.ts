import { VisionGestures } from './vision-gestures.ts';
import { EggMotion } from './egg-tracking.ts';
import { defaultConfig,parseConfig } from './config.ts';
import { PressureEngine,parsePressure } from './pressure.ts';
import type { Gesture } from './pressure.ts';
import { SerialInput } from './serial.ts';
import { CameraInput } from './camera.ts';
import { HandPosition,TwoHandTracker } from './tracking.ts';
import type { TrackedHand } from './tracking.ts';
import { element } from '../ui/panel.ts';
import type { World } from '../scene/world.ts';
import type { Simulation } from '../physics/simulation.ts';
const labels:Record<Gesture,string>={idle:'等你碰一碰',touch:'轻轻触碰',pinch:'被捏住了',hold:'持续握紧',stroke:'像是在抚摸',press:'正在按压'};
const storageKey='soft-egg-twin-config-v1';
type TwinCamera=Pick<CameraInput,'running'|'start'|'sample'|'stop'>&Partial<Pick<CameraInput,'sampleEgg'|'pickEggColor'|'resetEggColor'>>;
export function installTwin(world:World,sim:Simulation,resetLab:()=>void,cameraOverride?:TwinCamera){
  let config=structuredClone(defaultConfig);
  try{const saved=localStorage.getItem(storageKey);if(saved)config=parseConfig(JSON.parse(saved));}catch{/* Invalid or unavailable local storage falls back to the example. */}
  let engine=new PressureEngine(config),visionEngine=new PressureEngine(config);
  const serial=new SerialInput(),camera:TwinCamera=cameraOverride??new CameraInput(element<HTMLVideoElement>('#hand-video')),hand=new HandPosition(),hands=new TwoHandTracker(),vision=new VisionGestures(),egg=new EggMotion();
  const visionToggle=element<HTMLInputElement>('#vision-enabled');
  const eggToggle=element<HTMLInputElement>('#egg-enabled'),eggScale=element<HTMLInputElement>('#egg-scale');
  let lastHolderId:number|null=null;
  let displayedValues:number[]=[],displayedGesture:Gesture='idle';
  function usingVision(){return camera.running&&visionToggle.checked&&!serialMode;}
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
    sliders.forEach(s=>s.disabled=serialMode||usingVision());
    element<HTMLButtonElement>('#hand-swap').disabled=!camera.running||!hands.actor;
    element('#hand-swap').textContent=hands.holder?'交换托蛋手':'用可见手托蛋';
    element<HTMLButtonElement>('#gesture-calibrate').disabled=!camera.running||!hands.holder;
    visionToggle.disabled=!camera.running;
    eggToggle.disabled=!camera.running;eggScale.disabled=!camera.running||!eggToggle.checked;
    element<HTMLButtonElement>('#egg-color-reset').disabled=!camera.running;
    element<HTMLInputElement>('#gesture-sensitivity').disabled=!camera.running;
    document.querySelectorAll<HTMLButtonElement>('[data-demo]').forEach(b=>b.disabled=serialMode);
  }
  function buildSliders(){
    const parent=element('#zone-sliders');parent.replaceChildren();sliders=[];outputs=[];
    config.zones.forEach((zone,i)=>{
      const label=document.createElement('label');label.className='zone-slider';
      const row=document.createElement('span'),name=document.createElement('span'),out=document.createElement('output');name.textContent=zone.label;out.textContent='0%';row.append(name,out);
      const input=document.createElement('input');input.type='range';input.min='0';input.max='100';input.value='0';input.id=`zone-${zone.id}`;input.setAttribute('aria-label',`${zone.label}模拟压力`);
      input.addEventListener('input',()=>{if(!serialMode){demo=null;visionToggle.checked=false;manual[i]=Number(input.value)/100;}},opts);
      label.append(row,input);parent.append(label);sliders.push(input);outputs.push(out);
    });
    world.configurePressure(config.zones);syncAvailability();
  }
  function release(){demo=null;manual.fill(0);engine.clear();visionEngine.clear();vision.release();sliders.forEach(s=>s.value='0');world.setTwinInput(active,0,0,engine.values,'idle');}
  async function disconnect(){
    serialMode=false;await serial.disconnect();engine.clear();manual.fill(0);demo=null;
    element('#serial-connect').textContent='连接 USB 串口';element('#input-source').textContent='模拟输入';
    pressureStatus.textContent='模拟压力，可直接试玩';element('#pressure-hint').textContent='滑块模拟各区域压力；也可以点上方动作体验。';syncAvailability();
  }
  function stopCamera(){camera.stop();hand.reset();hands.reset();egg.reset();world.setTwinPose(0,1);vision.reset();visionEngine.clear();lastHolderId=null;element('#egg-status').textContent='开启摄像头后，让黄色蛋露出轮廓。';element('#hand-count').textContent='0 / 2 只手';element('#vision-status').textContent='摄像头未开启';element('#camera-preview').hidden=true;element('#camera-connect').textContent='开启摄像头';cameraStatus.textContent='摄像头未开启';syncAvailability();}
  function setMode(twin:boolean){
    active=twin;
    resetLab();release();hand.reset();hands.reset();egg.reset();world.setTwinPose(0,1);vision.reset();lastHolderId=null;
    element('#twin-controls').hidden=!twin;element('#twin-controls').scrollTop=0;element('#lab-controls').hidden=twin;
    element('#scene').setAttribute('aria-label',twin?'数字蛋：摄像头追踪黄色蛋的位置与倾斜，双手动作或多区域压力控制局部形变与表情。':'拖动软蛋以拉伸，或切换勺子挖取。');
    element('#mode-twin').setAttribute('aria-pressed',String(twin));element('#mode-lab').setAttribute('aria-pressed',String(!twin));
    element('#scene').classList.toggle('twin',twin);
    element('.caption>p').textContent=twin?'握在手里，回应在眼前。':'Squish. Stretch. Make a face.';
    element('.caption>span').textContent=twin?'移动 · 摇摆 · 捏握 · 轻轻抚摸':'A little squeeze, a little smile.';
    element('.intro>p').innerHTML=twin?'一点触碰。<br>一点回应。<br>陪在手心里的小家伙。':'A little softness.<br>A little gravity.<br>A very happy wobble.';
    element('.readings').hidden=twin;
    if(twin)sim.tool='twin';else {stopCamera();void disconnect();}
    world.setTwinInput(twin,0,0,engine.values,'idle');
  }
  element('#mode-twin').addEventListener('click',()=>setMode(true),opts);
  element('#mode-lab').addEventListener('click',()=>setMode(false),opts);
  function recenter(){hand.recenter();egg.recenter(performance.now());}
  element('#twin-reset').addEventListener('click',()=>{resetLab();sim.tool='twin';release();recenter();},opts);
  element('#pressure-release').addEventListener('click',()=>{release();if(serialMode)pressureStatus.textContent='反馈已清除；持续施压会随下一帧恢复';},opts);
  element('#camera-connect').addEventListener('click',async()=>{
    if(camera.running){stopCamera();return;}
    cameraBusy=true;release();syncAvailability();cameraStatus.textContent='正在打开摄像头与手部模型…';
    try{
      await camera.start();
      if(disposed||!active){stopCamera();return;}
      element('#camera-preview').hidden=false;element('#camera-connect').textContent='关闭摄像头';cameraStatus.textContent='可识别两只手，请先把托蛋手放入画面';visionToggle.checked=true;
    }catch(error){cameraStatus.textContent=`无法开启：${error instanceof Error?error.message:String(error)}`;}
    finally{cameraBusy=false;syncAvailability();}
  },opts);
  element('#camera-center').addEventListener('click',recenter,opts);
  element('#hand-swap').addEventListener('click',()=>{if(hands.swap()){hand.reset();egg.reset();vision.reset();visionEngine.clear();lastHolderId=null;}},opts);
  eggToggle.addEventListener('change',()=>{egg.reset();hand.recenter();syncAvailability();},opts);
  element('#hand-overlay').addEventListener('click',event=>{
    if(!camera.running||!eggToggle.checked)return;
    const bounds=(event.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const ok=camera.pickEggColor?.(1-(event.clientX-bounds.left)/bounds.width,(event.clientY-bounds.top)/bounds.height);
    if(ok)egg.reset();
    element('#egg-color-status').textContent=ok?'已采样蛋的黄色，请保持片刻，等待金框锁定。':'请点击蛋上清楚的黄色部分，避开高光、手指和阴影。';
  },opts);
  element('#egg-color-reset').addEventListener('click',()=>{camera.resetEggColor?.();egg.reset();element('#egg-color-status').textContent='已恢复默认黄色范围。';},opts);
  element('#gesture-calibrate').addEventListener('click',()=>{if(hands.holder){vision.calibrate();visionEngine.clear();element('#vision-status').textContent='已记录自然握姿，再收紧或用另一只手触碰';}},opts);
  visionToggle.addEventListener('change',()=>{release();syncAvailability();},opts);
  element('#gesture-sensitivity').addEventListener('input',()=>{vision.sensitivity=Number(element<HTMLInputElement>('#gesture-sensitivity').value)/100;element('#gesture-sensitivity-value').textContent=`${vision.sensitivity.toFixed(1)}×`;},opts);
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
  document.querySelectorAll<HTMLButtonElement>('[data-demo]').forEach(b=>b.addEventListener('click',()=>{if(!serialMode){visionToggle.checked=false;visionEngine.clear();manual.fill(0);syncAvailability();demo={kind:b.dataset.demo as Gesture,start:performance.now()};}},opts));
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
      config=next;engine=new PressureEngine(config);visionEngine=new PressureEngine(config);vision.reset();manual=config.zones.map(()=>0);demo=null;buildSliders();save();element('#config-status').textContent=`已载入 ${config.zones.length} 个测点`;
    }catch(error){element('#config-status').textContent=error instanceof Error?error.message:String(error);}finally{input.value='';}
  },opts);
  function drawHands(tracked:TrackedHand[],now:number){
    const canvas=element<HTMLCanvasElement>('#hand-overlay');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d')!;
    for(const track of tracked){
      const points=track.landmarks,holding=track.id===hands.holderId;
      ctx.strokeStyle=holding?'#bfe8ad':'#ffbd9d';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=3;
      for(const ids of [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[17,0]]){
        ctx.beginPath();ids.forEach((id,i)=>{const p=points[id];if(p){if(i===0)ctx.moveTo((1-p.x)*640,p.y*480);else ctx.lineTo((1-p.x)*640,p.y*480);}});ctx.stroke();
      }
      for(const p of points){ctx.beginPath();ctx.arc((1-p.x)*640,p.y*480,4,0,Math.PI*2);ctx.fill();}
      ctx.font='22px sans-serif';ctx.fillText(holding?'托蛋手':'触碰手',Math.max(4,Math.min(550,(1-track.center.x)*640)),Math.max(25,track.center.y*480-40));
    }
    const contact=vision.feedback(now,config.zones.length).contact;
    if(contact){ctx.strokeStyle='#ffe3a5';ctx.lineWidth=3;ctx.beginPath();ctx.arc((1-contact.x)*640,contact.y*480,16,0,Math.PI*2);ctx.stroke();}
    const trackedEgg=egg.observation;
    if(eggToggle.checked&&trackedEgg&&now-egg.lastSeen<400){
      const b=trackedEgg.bounds;ctx.strokeStyle='#ffdb55';ctx.lineWidth=3;
      ctx.strokeRect((1-b.x-b.width)*640,b.y*480,b.width*640,b.height*480);
      if(trackedEgg.angleReliable){
        // Correct aspect ratio: major is normalized by video width, not height.
        const aspect=element<HTMLVideoElement>('#hand-video').videoWidth/element<HTMLVideoElement>('#hand-video').videoHeight||4/3;
        const dx=Math.cos(trackedEgg.angle)*trackedEgg.major*.5,dy=Math.sin(trackedEgg.angle)*trackedEgg.major*.5*aspect;
        ctx.beginPath();ctx.moveTo((1-trackedEgg.x+dx)*640,(trackedEgg.y-dy)*480);ctx.lineTo((1-trackedEgg.x-dx)*640,(trackedEgg.y+dy)*480);ctx.stroke();
      }
      ctx.font='20px sans-serif';ctx.fillStyle='#ffdb55';ctx.fillText('黄色蛋',Math.max(4,(1-b.x-b.width)*640),Math.max(22,b.y*480-8));
    }
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
    try{
      const detections=camera.sample(now);
      if(detections){
        hands.update(detections,now);
        const holder=hands.holder;
        if(holder){if(lastHolderId!==holder.id){hand.reset();lastHolderId=holder.id;}hand.receive(holder.landmarks,now);}
        if(eggToggle.checked)egg.receive(camera.sampleEgg?.(holder,now)??null,now);
        vision.sample(holder,hands.actor,config.zones,now);drawHands(hands.hands,now);
      }
    }catch(error){stopCamera();cameraStatus.textContent=`追踪已停止：${error instanceof Error?error.message:String(error)}`;}
    hand.update(dt,now);
    egg.update(dt,now);
    const visual=usingVision(),feedback=vision.feedback(now,config.zones.length);
    if(!serialMode&&!visual)engine.ingest({values:demoValues(now),normalized:true},now);
    engine.update(dt,now);
    visionEngine.ingest({values:visual?feedback.values:config.zones.map(()=>0),normalized:true},now);visionEngine.update(dt,now);
    displayedValues=visual?visionEngine.values:engine.values;displayedGesture=visual?feedback.gesture:engine.gesture;
    const peak=visual?visionEngine.peak:engine.peak;
    const eggActive=camera.running&&eggToggle.checked&&egg.acquired;
    world.setTwinInput(true,eggActive?egg.x:hand.x,eggActive?egg.y:hand.y,displayedValues,displayedGesture);
    world.setTwinPose(eggActive?egg.roll:0,eggActive&&eggScale.checked?egg.scale:1);
    if(now-lastRead>80){
      element('#gesture-label').textContent=labels[displayedGesture];element('#pressure-peak').textContent=`${Math.round(peak*100)}%`;
      element('#pressure-peak').setAttribute('aria-label',visual?'视觉反馈强度，非实测压力':'归一化压力');
      element('#input-source').textContent=serialMode?'USB 硬件':visual?'手势估计':'模拟输入';
      outputs.forEach((o,i)=>{o.textContent=`${Math.round(displayedValues[i]*100)}%`;sliders[i].value=String(Math.round((serialMode||demo||visual?displayedValues[i]:manual[i])*100));});
      if(camera.running){
        const count=now-visionTime()<400?hands.hands.length:0;
        element('#hand-count').textContent=`${count} / 2 只手`;
        cameraStatus.textContent=now-hand.lastSeen<400?`正在跟随托蛋手 · ${count} 只手可见`:'托蛋手暂时不可见 · 位置保持';
        if(eggActive)cameraStatus.textContent=`黄色蛋追踪 · ${count} 只手可见`;
        element('#egg-status').textContent=!eggToggle.checked?'已关闭蛋体追踪 · 跟随托蛋手位置':!egg.acquired?'寻找手边的黄色蛋 · 暂由托蛋手控制位置':now-egg.lastSeen>400?'轮廓暂时丢失 · 保持最后位置与倾斜':`黄色蛋已锁定 · 倾斜 ${Math.round(egg.roll*180/Math.PI)}° · ${eggScale.checked?`大小 ${egg.scale.toFixed(2)}×`:'大小固定'}${egg.observation?.angleReliable?'':' · 轮廓接近圆形，倾斜保持'}`;
        element('#vision-status').textContent=feedback.message;
      }
      if(serialMode){
        if(serial.connected)pressureStatus.textContent=lastError?`忽略无效帧：${lastError}`:engine.fresh(now)?`压力实时接收${badPackets?` · 已忽略 ${badPackets} 帧`:''}`:'数据已超时 · 等待完整压力帧';
        element('#pressure-hint').textContent='USB 优先：形变以传感器为准。摄像头仍追踪双手、蛋的位置与倾斜。';
      }else if(visual){pressureStatus.textContent='手势驱动 · 非实测压力';element('#pressure-hint').textContent='区域读数表示视觉反馈强度。点下方示例可切回模拟，勾选上方开关恢复手势。';}
      else{pressureStatus.textContent=SerialInput.supported()?'模拟压力，可直接试玩':'串口需桌面 Chrome / Edge；当前可模拟体验';element('#pressure-hint').textContent='滑块模拟各区域压力；也可以点上方动作体验。';}
      syncAvailability();lastRead=now;
    }
  }
  function visionTime(){return Math.max(-Infinity,...hands.hands.map(h=>h.lastSeen));}
  buildSliders();setMode(true);syncAvailability();
  if(!SerialInput.supported())pressureStatus.textContent='串口需桌面 Chrome / Edge；当前可模拟体验';
  return {update,snapshot:()=>({active,source:serialMode?'serial':usingVision()?'vision':'simulation',values:[...displayedValues],gesture:displayedGesture,visibleHands:hands.hands.length,holderId:hands.holderId,camera:camera.running,hand:{x:hand.x,y:hand.y},egg:{acquired:egg.acquired,x:egg.x,y:egg.y,roll:egg.roll,scale:egg.scale,lastSeen:egg.lastSeen}}),dispose(){disposed=true;abort.abort();stopCamera();void serial.disconnect();engine.clear();}};
}
