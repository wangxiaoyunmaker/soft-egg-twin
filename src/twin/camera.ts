import { diagnostics } from '../diagnostics/runtime.ts';
import { withDeadline } from '../diagnostics/deadline.ts';
import type { DetectedHand,TrackedHand } from './tracking.ts';
import { detectEgg,hsv,yellowEgg } from './egg-tracking.ts';
import type { EggObservation } from './egg-tracking.ts';
export class CameraInput {
  private stream:MediaStream|null=null;
  private worker:Worker|null=null;
  private latest:DetectedHand[]|null=null;
  private inFlight=false;
  private inferenceMs=0;
  private jobStarted=0;
  private delegate='pending';
  private workerError:string|null=null;
  private initReject:((error:Error)=>void)|null=null;
  private frameCanvas=document.createElement('canvas');
  private frameContext=this.frameCanvas.getContext('2d')!;
  private readyPixels:ImageData|null=null;
  private pendingPixels:ImageData|null=null;
  private resultAt=0;

  private generation=0;
  private lastFrame=-1;
  private lastInference=0;
  private successfulSamples=0;
  private pixels=document.createElement('canvas');
  private context=this.pixels.getContext('2d',{willReadFrequently:true})!;
  private color={...yellowEgg};
  private egg:EggObservation|null=null;
  private eggSeen=-Infinity;
  private eggDetection:Record<string,unknown>={};
  running=false;
  constructor(private video:HTMLVideoElement){}
  async start(){
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('摄像头需要 localhost 或 HTTPS，以及浏览器权限');
    const generation=++this.generation;
    diagnostics?.stage('摄像头权限/设备');diagnostics?.event('camera.request',{});
    try{
      const stream=await withDeadline(navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false}),15000,'打开摄像头',late=>late.getTracks().forEach(t=>t.stop()));
      if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.video.srcObject=stream;
      diagnostics?.event('camera.stream',{tracks:stream.getVideoTracks().map(t=>{const s=t.getSettings();return {width:s.width,height:s.height,frameRate:s.frameRate};})});
      for(const track of stream.getVideoTracks())for(const name of ['ended','mute','unmute'])track.addEventListener(name,()=>diagnostics?.event(`camera.track.${name}`,{}));
      diagnostics?.stage('摄像头视频播放');
      await withDeadline(this.video.play(),10000,'启动视频');
      if(generation!==this.generation)return;
      diagnostics?.stage('手部模型加载');diagnostics?.event('model.loading',{});
      const worker=new Worker(new URL('./hand-worker.ts',import.meta.url),{type:'module'});this.worker=worker;
      const ready=new Promise<void>((resolve,reject)=>{
        this.initReject=reject;
        worker.onmessage=event=>{
          if(generation!==this.generation)return;
          const data=event.data;
          if(data.type==='ready'){this.delegate=data.delegate;this.initReject=null;resolve();}
          else if(data.type==='fallback')diagnostics?.event('hand.worker.cpuFallback',{message:data.message});
          else if(data.type==='error'){this.workerError=data.message;this.inFlight=false;this.initReject=null;reject(new Error(data.message));diagnostics?.event('hand.worker.error',data.message);}
          else if(data.type==='result'){
            this.inFlight=false;this.latest=data.hands;this.readyPixels=this.pendingPixels;this.pendingPixels=null;
            this.inferenceMs=data.ms;this.delegate=data.delegate;this.resultAt=performance.now();this.successfulSamples++;
            diagnostics?.recordMeasurement('hand.worker',data.ms);
          }
        };
        worker.onerror=event=>{this.workerError=event.message;this.inFlight=false;reject(new Error(event.message));diagnostics?.event('hand.worker.error',event.message);};
        worker.postMessage({type:'init',assets:new URL(`${import.meta.env.BASE_URL}mediapipe/`,location.href).href});
      });
      await withDeadline(ready,45000,'启动后台手部模型');
      if(generation!==this.generation){worker.terminate();return;}
      this.running=true;this.lastFrame=-1;this.lastInference=0;this.successfulSamples=0;diagnostics?.event('camera.ready',{backend:'worker',delegate:this.delegate});
    }catch(error){diagnostics?.event('camera.error',error instanceof Error?error.message:String(error));if(generation===this.generation)this.stop();throw error;}
  }
  sample(now:number):DetectedHand[]|null {
    if(this.workerError)throw new Error(this.workerError);
    if(this.inFlight&&now-this.jobStarted>10000)throw new Error('后台手部计算超过 10 秒，已停止追踪，请重新开启摄像头');
    const result=this.latest;this.latest=null;
    if(this.running&&this.worker&&!this.inFlight&&this.video.readyState>=2&&this.video.currentTime!==this.lastFrame&&now-this.lastInference>=55){
      this.lastFrame=this.video.currentTime;this.lastInference=now;this.inFlight=true;this.jobStarted=now;
      const worker=this.worker,generation=this.generation;
      const height=Math.round(384*this.video.videoHeight/this.video.videoWidth);
      if(this.frameCanvas.width!==384||this.frameCanvas.height!==height){this.frameCanvas.width=384;this.frameCanvas.height=height;}
      this.frameContext.drawImage(this.video,0,0,this.frameCanvas.width,this.frameCanvas.height);
      const smallHeight=Math.round(320*this.video.videoHeight/this.video.videoWidth);
      if(this.pixels.width!==320||this.pixels.height!==smallHeight){this.pixels.width=320;this.pixels.height=smallHeight;}
      this.context.drawImage(this.frameCanvas,0,0,this.pixels.width,this.pixels.height);
      this.pendingPixels=this.context.getImageData(0,0,this.pixels.width,this.pixels.height);
      void createImageBitmap(this.frameCanvas).then(bitmap=>{
        if(generation!==this.generation){bitmap.close();return;}
        worker.postMessage({type:'frame',time:now,bitmap},[bitmap]);
      }).catch(error=>{if(generation===this.generation){this.inFlight=false;this.workerError=String(error);}});
    }
    return result;
  }
  get stats(){return {eggDetection:this.eggDetection,backend:'worker',delegate:this.delegate,inferenceMs:Math.round(this.inferenceMs),inFlight:this.inFlight,videoReadyState:this.video.readyState,videoTimeSec:+this.video.currentTime.toFixed(3),videoPaused:this.video.paused,successfulSamples:this.successfulSamples,inferenceAgeMs:this.running&&this.resultAt?Math.round(performance.now()-this.resultAt):null};}
  sampleEgg(holder:TrackedHand|undefined,now:number,allHands?:TrackedHand[]):EggObservation|null {
    if(!this.running||this.video.readyState<2)return null;
    const width=320,height=Math.max(8,Math.round(width*this.video.videoHeight/this.video.videoWidth));
    if(this.pixels.width!==width||this.pixels.height!==height){this.pixels.width=width;this.pixels.height=height;}
    if(!this.worker)this.context.drawImage(this.video,0,0,width,height);
    this.eggDetection={};
    const detect=()=>detectEgg(this.readyPixels??this.context.getImageData(0,0,width,height),allHands?.length?allHands:holder,now-this.eggSeen<400?this.egg:null,this.color,this.eggDetection);
    const result=diagnostics?diagnostics.measure('egg.detect',detect):detect();
    if(result){this.egg=result;this.eggSeen=now;}
    return result;
  }
  /** Preview coordinates are unmirrored by the controller before color sampling. */
  pickEggColor(x:number,y:number){
    if(!this.running||!Number.isFinite(x)||!Number.isFinite(y))return false;
    const px=Math.max(1,Math.min(this.pixels.width-2,Math.round(x*this.pixels.width))),py=Math.max(1,Math.min(this.pixels.height-2,Math.round(y*this.pixels.height)));
    const data=this.context.getImageData(px-1,py-1,3,3).data;
    let r=0,g=0,b=0;for(let i=0;i<data.length;i+=4){r+=data[i];g+=data[i+1];b+=data[i+2];}
    const color=hsv(r/9,g/9,b/9);
    if(color.saturation<.25||color.value<.2||color.hue<25||color.hue>85)return false;
    this.color={hue:color.hue,tolerance:14,minSaturation:Math.max(.25,color.saturation*.55)};
    this.egg=null;this.eggSeen=-Infinity;return true;
  }
  resetEggColor(){this.color={...yellowEgg};this.egg=null;this.eggSeen=-Infinity;}
  stop(){
    diagnostics?.event('camera.stop',{wasRunning:this.running});
    ++this.generation;this.running=false;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    this.video.pause();this.video.srcObject=null;this.initReject?.(new Error('摄像头已取消'));this.initReject=null;this.worker?.terminate();this.worker=null;this.latest=null;this.inFlight=false;this.workerError=null;this.readyPixels=this.pendingPixels=null;
    this.egg=null;this.eggSeen=-Infinity;
  }
}
