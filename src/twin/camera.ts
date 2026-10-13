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
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
    this.stream=stream;this.video.srcObject=stream;
    try{
      await this.video.play();
      const {FilesetResolver,HandLandmarker}=await import('@mediapipe/tasks-vision');
      const vision=await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`);
      const model=await HandLandmarker.createFromOptions(vision,{
        baseOptions:{modelAssetPath:`${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`,delegate:'CPU'},
        runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55,
      });
      if(generation!==this.generation){model.close();return;}
      this.model=model;this.running=true;this.lastFrame=-1;this.lastInference=0;
    }catch(error){if(generation===this.generation)this.stop();throw error;}
  }
  sample(now:number):DetectedHand[]|null {
    if(!this.running||!this.model||this.video.readyState<2||this.video.currentTime===this.lastFrame||now-this.lastInference<65)return null;
    this.lastFrame=this.video.currentTime;this.lastInference=now;
    const result=this.model.detectForVideo(this.video,now);
    return result.landmarks.map((landmarks,i)=>({landmarks,handedness:result.handedness[i]?.[0]?.categoryName??''}));
  }
  sampleEgg(holder:TrackedHand|undefined,now:number):EggObservation|null {
    if(!this.running||this.video.readyState<2)return null;
    const width=192,height=Math.max(8,Math.round(width*this.video.videoHeight/this.video.videoWidth));
    if(this.pixels.width!==width||this.pixels.height!==height){this.pixels.width=width;this.pixels.height=height;}
    this.context.drawImage(this.video,0,0,width,height);
    const result=detectEgg(this.context.getImageData(0,0,width,height),holder,now-this.eggSeen<800?this.egg:null,this.color);
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
    ++this.generation;this.running=false;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    this.video.pause();this.video.srcObject=null;this.model?.close();this.model=null;
    this.egg=null;this.eggSeen=-Infinity;
  }
}
