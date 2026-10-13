import type { TrackedHand } from './tracking.ts';

export interface EggObservation {
  x:number;y:number;
  /** Image-pixel long-axis angle, modulo PI. Not a full 3D orientation. */
  angle:number;angleReliable:boolean;
  /** Long and short diameters, divided by image width. */
  major:number;minor:number;
  bounds:{x:number;y:number;width:number;height:number};
}
export interface PixelFrame {width:number;height:number;data:Uint8ClampedArray}
export interface EggColor {hue:number;tolerance:number;minSaturation:number}
export const yellowEgg:EggColor={hue:53,tolerance:17,minSaturation:.34};
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
export function hsv(r:number,g:number,b:number){
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let hue=d===0?0:max===r?60*((g-b)/d%6):max===g?60*((b-r)/d+2):60*((r-g)/d+4);
  if(hue<0)hue+=360;
  return {hue,saturation:max?d/max:0,value:max/255};
}
const hueDistance=(a:number,b:number)=>Math.min(Math.abs(a-b),360-Math.abs(a-b));

/** Color-connected components near the supporting hand, with temporal association.
 * Pixel coordinates (not normalized x/y) keep PCA correct on non-square video. */
export function detectEgg(frame:PixelFrame,holder:TrackedHand|TrackedHand[]|undefined,previous:EggObservation|null,color:EggColor=yellowEgg):EggObservation|null {
  const {width:w,height:h,data}=frame;
  const holders=Array.isArray(holder)?holder:holder?[holder]:[];
  if(w<8||h<8||data.length<w*h*4||(!holders.length&&!previous))return null;
  const mask=new Uint8Array(w*h),queue=new Int32Array(w*h);
  for(let i=0;i<mask.length;i++){
    const c=hsv(data[i*4],data[i*4+1],data[i*4+2]);
    if(c.value>.16&&c.saturation>=color.minSaturation&&hueDistance(c.hue,color.hue)<=color.tolerance)mask[i]=1;
  }
  const regions=holders.map(hand=>{const p=hand.landmarks;return {x:hand.center.x*w,y:hand.center.y*h,palm:Math.max(Math.hypot((p[5].x-p[17].x)*w,(p[5].y-p[17].y)*h),Math.hypot((p[0].x-p[9].x)*w,(p[0].y-p[9].y)*h),w*.025)};});
  if(!regions.length&&previous)regions.push({x:previous.x*w,y:previous.y*h,palm:w*.12});
  let best:EggObservation|null=null,bestScore=-Infinity;
  for(let seed=0;seed<mask.length;seed++){
    if(!mask[seed])continue;
    let head=0,tail=1,sx=0,sy=0,sxx=0,syy=0,sxy=0,minX=w,minY=h,maxX=0,maxY=0;
    queue[0]=seed;mask[seed]=0;
    while(head<tail){
      const i=queue[head++],x=i%w,y=Math.floor(i/w);
      sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const n of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(n>=0&&mask[n]){mask[n]=0;queue[tail++]=n;}
    }
    if(tail<40||tail>w*h*.19||minX===0||minY===0||maxX===w-1||maxY===h-1)continue;
    const x=sx/tail,y=sy/tail,a=sxx/tail-x*x,b=syy/tail-y*y,c=sxy/tail-x*y;
    const spread=Math.sqrt((a-b)**2+4*c*c),large=(a+b+spread)/2,small=(a+b-spread)/2;
    if(small<=0)continue;
    const major=4*Math.sqrt(large),minor=4*Math.sqrt(small),ratio=major/minor;
    const fill=tail/((maxX-minX+1)*(maxY-minY+1));
    if(ratio>2.7||fill<.45||fill>.93||minor<6||major>w*.58)continue;
    const eligible=regions.filter(r=>!holders.length||major>=r.palm*.3&&major<=r.palm*2.8);
    const nearHand=Math.min(...eligible.map(r=>Math.hypot(x-r.x,y-r.y)/r.palm));
    if(nearHand>2)continue;
    const continuity=previous?Math.hypot(x-previous.x*w,y-previous.y*h)/w:0;
    if(previous&&(continuity>.16||major/(previous.major*w)<.65||major/(previous.major*w)>1.5))continue;
    const score=Math.log(tail)-nearHand*1.5-continuity*30;
    if(score<=bestScore)continue;
    bestScore=score;
    best={x:x/w,y:y/h,angle:.5*Math.atan2(2*c,a-b),angleReliable:ratio>=1.18,major:major/w,minor:minor/w,bounds:{x:minX/w,y:minY/h,width:(maxX-minX+1)/w,height:(maxY-minY+1)/h}};
  }
  return best;
}

/** Follow measured image translation/roll. No invented spin or post-loss wobble. */
export class EggMotion {
  x=0;y=0;roll=0;scale=1;lastSeen=-Infinity;
  observation:EggObservation|null=null;
  private origin:EggObservation|null=null;
  private lastAngle:number|null=null;
  private target={x:0,y:0,roll:0,scale:1};
  private candidate:EggObservation|null=null;
  private candidateAt=-Infinity;
  private stable=0;
  get acquired(){return this.origin!==null;}
  reset(){this.x=this.y=this.roll=0;this.scale=1;this.lastSeen=this.candidateAt=-Infinity;this.origin=this.observation=this.candidate=null;this.lastAngle=null;this.stable=0;this.target={x:0,y:0,roll:0,scale:1};}
  receive(value:EggObservation|null,now:number){
    if(!value){this.stable=0;this.candidate=null;return;}
    // Require three nearby detections before acquiring/reacquiring, avoiding isolated yellow noise.
    const gap=now-this.lastSeen;
    if(!this.acquired||gap>400){
      const close=this.candidate&&now-this.candidateAt<400&&Math.hypot(value.x-this.candidate.x,value.y-this.candidate.y)<.07;
      this.stable=close?this.stable+1:1;this.candidate=value;this.candidateAt=now;
      if(this.stable<3)return;
    }
    this.origin??={...value};
    this.target.x=clamp((this.origin.x-value.x)*4,-1,1);
    this.target.y=clamp((this.origin.y-value.y)*4,-1,1);
    if(value.angleReliable){
      if(this.lastAngle!==null){
        // An ellipse has no directed tip: unwrap across ±90°, never assert a 180° flip.
        let delta=value.angle-this.lastAngle;
        while(delta>Math.PI/2)delta-=Math.PI;
        while(delta<-Math.PI/2)delta+=Math.PI;
        // Reacquisition chooses the closest equivalent long axis, not an unseen turn count.
        this.target.roll+=delta;
      }
      this.lastAngle=value.angle;
    }
    // Long axis changes less than visible colored area when fingers partly cover the egg.
    this.target.scale=clamp(value.major/this.origin.major,.7,1.4);
    this.observation=value;this.lastSeen=now;
  }
  recenter(now:number){
    if(!this.observation||now-this.lastSeen>400)return false;
    this.origin={...this.observation};this.target={x:0,y:0,roll:0,scale:1};
    return true;
  }
  update(dt:number,now:number){
    if(now-this.lastSeen>400)return;
    const k=1-Math.exp(-clamp(dt,0,.1)*12);
    this.x+=(this.target.x-this.x)*k;this.y+=(this.target.y-this.y)*k;
    this.roll+=(this.target.roll-this.roll)*k;this.scale+=(this.target.scale-this.scale)*k;
  }
}
