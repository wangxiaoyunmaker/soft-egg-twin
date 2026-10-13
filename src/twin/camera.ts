import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from './tracking.ts';
export class CameraInput {
  private stream:MediaStream|null=null;
  private model:HandLandmarker|null=null;
  private generation=0;
  private lastFrame=-1;
  private lastInference=0;
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
        runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55,
      });
      if(generation!==this.generation){model.close();return;}
      this.model=model;this.running=true;this.lastFrame=-1;this.lastInference=0;
    }catch(error){if(generation===this.generation)this.stop();throw error;}
  }
  sample(now:number):Landmark[]|null {
    if(!this.running||!this.model||this.video.readyState<2||this.video.currentTime===this.lastFrame||now-this.lastInference<65)return null;
    this.lastFrame=this.video.currentTime;this.lastInference=now;
    return this.model.detectForVideo(this.video,now).landmarks[0]??[];
  }
  stop(){
    ++this.generation;this.running=false;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    this.video.pause();this.video.srcObject=null;this.model?.close();this.model=null;
  }
}
