import { palmCenter } from '../../src/twin/tracking.ts';
import type { Landmark,TrackedHand } from '../../src/twin/tracking.ts';
/** Synthetic landmarks for logic/replay tests, never presented as captured hands. */
export function supportHand():TrackedHand {
  const p:Landmark[]=Array.from({length:21},()=>({x:.5,y:.6,z:0}));
  p[0]={x:.5,y:.70,z:0};
  const bases=[[.43,.57],[.49,.55],[.55,.57],[.6,.61]],tips=[[.40,.39],[.49,.34],[.57,.40],[.64,.47]];
  bases.forEach((base,f)=>{const i=5+f*4;p[i]={x:base[0],y:base[1],z:0};for(let n=1;n<=3;n++)p[i+n]={x:base[0]+(tips[f][0]-base[0])*n/3,y:base[1]+(tips[f][1]-base[1])*n/3,z:0};});
  p[1]={x:.45,y:.66};p[2]={x:.4,y:.62};p[3]={x:.36,y:.58};p[4]={x:.33,y:.55};
  return {id:1,landmarks:p,handedness:'Left',center:palmCenter(p)!,lastSeen:0};
}
export function translateHand(hand:TrackedHand,dx:number,dy:number):TrackedHand {
  const landmarks=hand.landmarks.map(p=>({...p,x:p.x+dx,y:p.y+dy}));return {...hand,landmarks,center:palmCenter(landmarks)!};
}
export function gripHand(amount:number):TrackedHand {
  const h=supportHand();
  for(const i of [5,9,13,17])for(let j=1;j<=3;j++){h.landmarks[i+j].x+=(h.landmarks[i].x-h.landmarks[i+j].x)*amount;h.landmarks[i+j].y+=(h.landmarks[i].y-h.landmarks[i+j].y)*amount;}
  return h;
}
export function actorAt(x:number,y:number):TrackedHand {
  const h=supportHand(),p=h.landmarks,scale=Math.max(Math.hypot(p[5].x-p[17].x,p[5].y-p[17].y),Math.hypot(p[0].x-p[9].x,p[0].y-p[9].y));
  const center={x:h.center.x+(p[9].x-p[0].x)*.2,y:h.center.y+(p[9].y-p[0].y)*.2};
  // A downward-pointing index finger on the other hand.
  const a=supportHand();a.landmarks=a.landmarks.map(v=>({...v,y:1-v.y}));a.center=palmCenter(a.landmarks)!;
  const shifted=translateHand(a,center.x+x*scale-a.landmarks[8].x,center.y+y*scale-a.landmarks[8].y);
  return {...shifted,id:2,handedness:'Right'};
}
