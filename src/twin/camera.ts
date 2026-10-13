import { diagnostics } from '../diagnostics/runtime.ts';
import { withDeadline } from '../diagnostics/deadline.ts';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { DetectedHand,TrackedHand } from './tracking.ts';
import { detectEgg,hsv,yellowEgg } from './egg-tracking.ts';
import type { EggObservation } from './egg-tracking.ts';
export class CameraInput {
  private stream:MediaStream|null=null;
  private model:HandLandmarker|null=null;
  private generation=0;
  private lastFrame=-1;
  private lastInference=0;
  private successfulSamples=0;
  private pixels=document.createElement('canvas');
  private context=this.pixels.getContext('2d',{willReadFrequently:true})!;
  private color={...yellowEgg};
  private egg:EggObservation|null=null;
  private eggSeen=-Infinity;
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
      const {FilesetResolver,HandLandmarker}=await import('@mediapipe/tasks-vision');
      const vision=await withDeadline(FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`),20000,'加载 WASM');
      const model=await withDeadline(HandLandmarker.createFromOptions(vision,{
        baseOptions:{modelAssetPath:`${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`,delegate:'CPU'},
        runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55,
      }),30000,'加载手部模型',late=>late.close());
      if(generation!==this.generation){model.close();return;}
      this.model=model;this.running=true;this.lastFrame=-1;this.lastInference=0;this.successfulSamples=0;diagnostics?.event('camera.ready',{});
    }catch(error){diagnostics?.event('camera.error',error instanceof Error?error.message:String(error));if(generation===this.generation)this.stop();throw error;}
  }
  sample(now:number):DetectedHand[]|null {
    if(!this.running||!this.model||this.video.readyState<2||this.video.currentTime===this.lastFrame||now-this.lastInference<65)return null;
    this.lastFrame=this.video.currentTime;this.lastInference=now;
    const infer=()=>this.model!.detectForVideo(this.video,now);
    const result=diagnostics?diagnostics.measure('hand.inference',infer):infer();
    this.successfulSamples++;
    return result.landmarks.map((landmarks,i)=>({landmarks,handedness:result.handedness[i]?.[0]?.categoryName??''}));
  }
  get stats(){return {videoReadyState:this.video.readyState,videoTimeSec:+this.video.currentTime.toFixed(3),videoPaused:this.video.paused,successfulSamples:this.successfulSamples,inferenceAgeMs:this.running&&this.lastInference?Math.round(performance.now()-this.lastInference):null};}
  sampleEgg(holder:TrackedHand|undefined,now:number):EggObservation|null {
    if(!this.running||this.video.readyState<2)return null;
    const width=192,height=Math.max(8,Math.round(width*this.video.videoHeight/this.video.videoWidth));
    if(this.pixels.width!==width||this.pixels.height!==height){this.pixels.width=width;this.pixels.height=height;}
    this.context.drawImage(this.video,0,0,width,height);
    const detect=()=>detectEgg(this.context.getImageData(0,0,width,height),holder,now-this.eggSeen<800?this.egg:null,this.color);
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
    this.video.pause();this.video.srcObject=null;this.model?.close();this.model=null;
    this.egg=null;this.eggSeen=-Infinity;
  }
}
