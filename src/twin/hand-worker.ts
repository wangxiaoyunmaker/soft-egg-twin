/// <reference lib="webworker" />
import { FilesetResolver,HandLandmarker } from '@mediapipe/tasks-vision';
const scope=globalThis as unknown as DedicatedWorkerGlobalScope;
let model:HandLandmarker|null=null,delegate:'GPU'|'CPU'='GPU';
scope.onmessage=async(event:MessageEvent)=>{
  const data=event.data;
  try{
    if(data.type==='init'){
      const files=await FilesetResolver.forVisionTasks(`${data.assets}wasm`,true);
      const create=(kind:'GPU'|'CPU')=>HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:`${data.assets}hand_landmarker.task`,delegate:kind},canvas:new OffscreenCanvas(384,288),runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5});
      try{model=await create('GPU');}catch(error){delegate='CPU';scope.postMessage({type:'fallback',message:String(error)});model=await create('CPU');}
      scope.postMessage({type:'ready',delegate});
    }else if(data.type==='frame'){
      const bitmap:ImageBitmap=data.bitmap,start=performance.now();
      try{
        if(!model)throw new Error('手部模型尚未就绪');
        const result=model.detectForVideo(bitmap,data.time);
        scope.postMessage({type:'result',time:data.time,ms:performance.now()-start,delegate,hands:result.landmarks.map((landmarks,i)=>({landmarks,handedness:result.handedness[i]?.[0]?.categoryName??''}))});
      }finally{bitmap.close();}
    }
  }catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};
