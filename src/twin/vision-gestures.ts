import type { Zone } from './config.ts';
import type { Gesture } from './pressure.ts';
import type { Landmark,TrackedHand } from './tracking.ts';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const distance=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y);
function features(hand:TrackedHand){
  const p=hand.landmarks;
  if(p.length<21||p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)))return null;
  const scale=Math.max(distance(p[5],p[17]),distance(p[0],p[9]),.025);
  const curls=[5,9,13,17].map(i=>clamp(1-distance(p[i],p[i+3])/(scale*1.5)));
  return {scale,curl:curls.reduce((a,b)=>a+b,0)/4,indexCurl:curls[0],tip:p[8],center:{x:hand.center.x+(p[9].x-p[0].x)*.2,y:hand.center.y+(p[9].y-p[0].y)*.2}};
}
export interface VisionFeedback {values:number[];gesture:Gesture;message:string;contact:{x:number;y:number}|null}
/** Heuristics over image-space motion; no claim of measured force, depth, or actual contact. */
export class VisionGestures {
  sensitivity=1;
  private holderId:number|null=null;
  private actorId:number|null=null;
  private baseline:number|null=null;
  private lastCurl=0;
  private gripSince:number|null=null;
  private lastSample=-Infinity;
  private readyAt=0;
  private contactStart:{r:number;curl:number}|null=null;
  private path:{x:number;y:number;time:number}[]=[];
  private result:VisionFeedback={values:[],gesture:'idle',message:'等待手部画面',contact:null};
  reset(){this.holderId=this.actorId=null;this.baseline=null;this.gripSince=null;this.lastSample=-Infinity;this.contactStart=null;this.path=[];this.result={values:[],gesture:'idle',message:'等待手部画面',contact:null};}
  release(){this.gripSince=null;this.contactStart=null;this.path=[];this.result={values:[],gesture:'idle',message:'触碰已释放',contact:null};}
  calibrate(){this.baseline=this.lastCurl;this.release();this.result.message='已记录自然握持姿态';}
  feedback(now:number,count:number):VisionFeedback {
    if(now-this.lastSample>300)return {values:Array(count).fill(0),gesture:'idle',message:'手部丢失 · 触碰已释放',contact:null};
    return this.result;
  }
  sample(holder:TrackedHand|undefined,actor:TrackedHand|undefined,zones:Zone[],now:number){
    const empty=(message:string):VisionFeedback=>({values:zones.map(()=>0),gesture:'idle',message,contact:null});
    const prior=this.lastSample;this.lastSample=now;
    const h=holder?features(holder):null;
    if(!holder||!h){this.contactStart=null;this.path=[];this.gripSince=null;this.result=empty('请让托蛋手回到画面');return;}
    if(this.holderId!==holder.id){this.holderId=holder.id;this.baseline=h.curl;this.readyAt=now+400;this.gripSince=null;this.contactStart=null;this.path=[];}
    if(now-prior>350){this.contactStart=null;this.path=[];this.gripSince=null;}
    this.lastCurl=h.curl;
    if(now<this.readyAt){this.result=empty('保持自然握姿，正在建立基线');return;}
    const squeeze=clamp((h.curl-(this.baseline??h.curl)-.07/this.sensitivity)*3.8*this.sensitivity);
    if(squeeze>.18){
      this.gripSince??=now;
      const values=zones.map(z=>squeeze*(.5+.5*(1-Math.abs(z.position[1]-.5))));
      this.result={values,gesture:now-this.gripSince>550?'hold':'pinch',message:'托蛋手收紧 · 视觉估计',contact:null};
      this.contactStart=null;this.path=[];return;
    }
    this.gripSince=null;
    const a=actor?features(actor):null;
    if(!actor||!a){this.actorId=null;this.contactStart=null;this.path=[];this.result=empty('可收紧托蛋手，或用另一只手按压、抚摸');return;}
    if(actor.id!==this.actorId){this.actorId=actor.id;this.contactStart=null;this.path=[];}
    // Relative to the supporting hand: translating both hands together is not a stroke.
    const x=(a.tip.x-h.center.x)/h.scale,y=(a.tip.y-h.center.y)/h.scale,r=Math.hypot(x,y);
    if(r>1.35){this.contactStart=null;this.path=[];this.result=empty('触碰手靠近托蛋手中的蛋，再按压或划动');return;}
    this.contactStart??={r,curl:a.indexCurl};
    this.path.push({x,y,time:now});this.path=this.path.filter(p=>now-p.time<=700);
    let travel=0,tangent=0;
    for(let i=1;i<this.path.length;i++){
      const p=this.path[i-1],q=this.path[i],dx=q.x-p.x,dy=q.y-p.y;
      travel+=Math.hypot(dx,dy);const radius=Math.max(.25,Math.hypot(p.x,p.y));tangent+=Math.abs((-p.y*dx+p.x*dy)/radius);
    }
    const first=this.path[0],span=Math.hypot(x-first.x,y-first.y),duration=(now-first.time)/1000;
    // A jump, an out-of-region hand or a gap cannot bridge into a new stroke.
    const previous=this.path.at(-2);
    if(previous&&Math.hypot(x-previous.x,y-previous.y)>.65){this.path=[{x,y,time:now}];this.contactStart={r,curl:a.indexCurl};this.result=empty('动作过快，等待稳定接触');return;}
    const fingerPress=Math.max(0,a.indexCurl-this.contactStart.curl);
    const inward=Math.max(0,this.contactStart.r-r);
    const stroke=duration>=.2&&duration<=.7&&span>.28/this.sensitivity&&travel>.36/this.sensitivity&&tangent>.18/this.sensitivity&&fingerPress<.14;
    const press=clamp(Math.max(fingerPress*2.8,(inward-.08)*1.4)*this.sensitivity);
    const gesture:Gesture=stroke?'stroke':press>.18?'press':'touch';
    const strength=stroke?.24:gesture==='press'?Math.min(.85,.4+press*.5):.07;
    const local={x:Math.max(-1,Math.min(1,-x)),y:Math.max(.1,Math.min(.95,.52-y*.38)),z:.85};
    const distances=zones.map(z=>Math.hypot(z.position[0]-local.x,(z.position[1]-local.y)*2,z.position[2]-local.z));
    const minimum=Math.min(...distances);
    const values=distances.map(d=>strength*Math.exp(-(d*d-minimum*minimum)/.4));
    this.result={values,gesture,message:stroke?'触碰手连续划动 · 抚摸候选':gesture==='press'?'触碰手向内按压 · 视觉估计':'触碰手接近蛋 · 轻触候选',contact:{x:a.tip.x,y:a.tip.y}};
  }
}
