import type { EggObservation } from './egg-tracking.ts';
import type { TrackedHand } from './tracking.ts';
export class HeadAnchor {
  private pose:EggObservation|null=null;
  private seen=-Infinity;
  private support:{id:number;x:number;y:number}|null=null;
  private manual=false;
  source='none';
  reset(){this.pose=null;this.seen=-Infinity;this.support=null;this.manual=false;this.source='none';}
  private rememberSupport(hands:TrackedHand[],pose:EggObservation){
    const holder=hands.filter(h=>h.center.y>pose.y&&Math.hypot(h.center.x-pose.x,h.center.y-pose.y)<.35).sort((a,b)=>Math.hypot(a.center.x-pose.x,a.center.y-pose.y)-Math.hypot(b.center.x-pose.x,b.center.y-pose.y))[0];
    this.support=holder?{id:holder.id,...holder.center}:null;
  }
  observe(pose:EggObservation,hands:TrackedHand[],now:number){
    if(this.manual)return;
    this.pose={...pose};this.seen=now;this.rememberSupport(hands,pose);
  }
  markHead(point:{x:number;y:number},shape:EggObservation|null,hands:TrackedHand[],now:number,aspect:number){
    const major=shape?.major??.18,minor=shape?.minor??.11;
    let ax=shape?.angleReliable?Math.cos(shape.angle):0,ay=shape?.angleReliable?Math.sin(shape.angle):-1;if(ay>0){ax=-ax;ay=-ay;}
    this.pose={x:point.x-ax*major/2,y:point.y-ay*major/2*aspect,angle:Math.atan2(ay,ax),angleReliable:true,major,minor,bounds:{x:point.x-minor/2,y:point.y,width:minor,height:major*aspect}};
    this.manual=true;this.seen=now;this.rememberSupport(hands,this.pose);
  }
  read(hands:TrackedHand[],now:number):EggObservation|null {
    if(!this.pose){this.source='none';return null;}
    const age=now-this.seen;
    if(!this.manual&&age>1200){this.source='expired';return null;}
    if(age<150&&!this.manual){this.source='measured';return this.pose;}
    const hand=this.support?hands.find(h=>h.id===this.support!.id):null;
    if(hand&&this.support){
      const dx=hand.center.x-this.support.x,dy=hand.center.y-this.support.y;
      if(Math.hypot(dx,dy)>.3){this.source='moved-too-far';return null;}
      this.source=this.manual?'manual-follow':'short-occlusion';return {...this.pose,x:this.pose.x+dx,y:this.pose.y+dy};
    }
    this.source=this.manual?'manual-fixed':'short-occlusion';return this.pose;
  }
}
