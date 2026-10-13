import type { Zone } from './config.ts';
import type { Gesture } from './pressure.ts';
import type { TrackedHand } from './tracking.ts';
import type { EggObservation } from './egg-tracking.ts';
export type EggInteraction='none'|'head-pat'|'head-stroke'|'cradle';
export interface InteractionFeedback {values:number[];gesture:Gesture;message:string;contact:{x:number;y:number}|null}
interface Point {u:number;v:number;time:number}
interface HandHistory {pointId:number;previous:Point|null;path:Point[];approach:Point|null;armed:boolean;patUntil:number;lastSeen:number}
/** Temporal contact-zone heuristics, not a trained action model or force measurement. */
export class EggInteractions {
  sensitivity=1;
  private lastSample=-Infinity;
  private gap=70;
  private histories=new Map<number,HandHistory>();
  private supportSince:number|null=null;
  private supportPair='';
  private supportLast=-Infinity;
  private reasons:Record<string,number>={};
  private details:Record<string,unknown>={reason:'waiting'};
  private result:InteractionFeedback={values:[],gesture:'idle',message:'等待黄色蛋和手进入画面',contact:null};
  get debug(){return {rulesVersion:3,sampleGapMs:Math.round(this.gap),...this.details,support:this.details.support,reason:String(this.details.reason??'waiting'),reasons:{...this.reasons}};}
  reset(){this.lastSample=-Infinity;this.histories.clear();this.supportSince=null;this.supportPair='';this.supportLast=-Infinity;this.reasons={};this.details={reason:'reset'};this.result={values:[],gesture:'idle',message:'动作识别已重置',contact:null};}
  release(){this.reset();}
  calibrate(){this.reset();}
  feedback(now:number,count:number):InteractionFeedback {
    const stale=Math.min(900,Math.max(400,this.gap*2.5));
    if(now-this.lastSample>stale)return {values:Array(count).fill(0),gesture:'idle',message:'画面未更新 · 动作已释放',contact:null};
    return this.result;
  }
  sample(hands:TrackedHand[],egg:EggObservation|null,zones:Zone[],now:number,aspect=4/3){
    const empty=(message:string):InteractionFeedback=>({values:zones.map(()=>0),gesture:'idle',message,contact:null});
    const finish=(reason:string,result:InteractionFeedback,details:Record<string,unknown>={})=>{this.reasons[reason]=(this.reasons[reason]??0)+1;this.details={reason,handCount:hands.length,...details};this.result=result;};
    this.gap=Number.isFinite(this.lastSample)?now-this.lastSample:70;
    if(this.gap>900){this.histories.clear();this.supportSince=null;this.supportPair='';}
    this.lastSample=now;
    if(!egg||!Number.isFinite(aspect)||aspect<=0||!hands.length){this.histories.clear();this.supportSince=null;this.supportPair='';finish(!egg?'no-head':'no-hands',empty(egg?'请把手放进画面':'蛋头未定位：露出黄色蛋，或点「标记蛋头」'));return;}
    const major=Math.max(.025,egg.major/2),minor=Math.max(.018,egg.minor/2);
    let ax=Math.cos(egg.angle),ay=Math.sin(egg.angle);if(ay>0){ax=-ax;ay=-ay;}if(!egg.angleReliable){ax=0;ay=-1;}
    const relative=(p:{x:number;y:number})=>{const dx=p.x-egg.x,dy=(p.y-egg.y)/aspect;return {u:(dx*ax+dy*ay)/major,v:(-dx*ay+dy*ax)/minor};};
    const valid=hands.filter(h=>h.landmarks.length>=21&&h.landmarks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    const palms=valid.map(h=>({id:h.id,...relative(h.center)}));
    const supporters=palms.filter(p=>p.u<.55&&p.u>-3.2&&Math.abs(p.v)<3.2);
    const a=supporters[0],b=supporters[1];
    const separated=!!a&&!!b&&Math.abs(a.v-b.v)>.5/this.sensitivity;
    const balanced=!!a&&!!b&&Math.abs(a.u-b.u)<1.8&&(a.u+b.u)/2<-.05;
    const pair=separated&&balanced?[a.id,b.id].sort((x,y)=>x-y).join(':'):'';
    if(pair){
      if(pair!==this.supportPair){this.supportPair=pair;this.supportSince=now;}
      this.supportLast=now;
    }else if(now-this.supportLast>220){this.supportPair='';this.supportSince=null;}
    const cradleWait=Math.max(160,260/this.sensitivity);
    const cradle=!!pair&&this.supportSince!==null&&now-this.supportSince>=cradleWait;
    const supportReason=valid.length<2?'need-two-hands':supporters.length<2?'palms-outside-support':!separated?'palms-too-close':!balanced?'palms-too-high-or-unbalanced':cradle?'ready':'waiting';
    for(const [id,h] of this.histories)if(now-h.lastSeen>900)this.histories.delete(id);
    const candidates=[];
    for(const hand of valid){
      let history=this.histories.get(hand.id);
      const points=[8,12,16,20,4,9].map(id=>({id,point:hand.landmarks[id],...relative(hand.landmarks[id])})).filter(p=>p.u>.25&&p.u<3.5&&Math.abs(p.v)<2.4);
      // Keeping a point prevents finger-switching from creating an artificial hit, but a static holding hand does not monopolize all histories.
      const chosen=points.find(p=>p.id===history?.pointId)??points.sort((p,q)=>Math.hypot(p.u-1,p.v)-Math.hypot(q.u-1,q.v))[0];
      if(!chosen){this.histories.delete(hand.id);continue;}
      if(!history||history.pointId!==chosen.id){history={pointId:chosen.id,previous:null,path:[],approach:null,armed:true,patUntil:0,lastSeen:now};this.histories.set(hand.id,history);}
      const prior=history.previous,p={u:chosen.u,v:chosen.v,time:now};history.previous=p;history.lastSeen=now;
      if(prior&&Math.hypot(p.u-prior.u,p.v-prior.v)>1.8){history.path=[];history.approach=null;history.patUntil=0;continue;}
      const near=p.u<=1.65&&Math.abs(p.v)<=1.7;
      if(p.u>1.5){history.armed=true;history.approach=p;}
      const approach=history.approach,dt=approach?(now-approach.time)/1000:0,drop=approach?approach.u-p.u:0;
      const pat=near&&p.u<=1.5&&history.armed&&approach&&dt>=.025&&dt<=.6&&drop>.22/this.sensitivity&&drop/dt>.8/this.sensitivity&&Math.abs(p.v-approach.v)<1.25;
      if(pat){history.patUntil=now+650;history.armed=false;history.approach=null;history.path=[];}
      if(near){history.path.push(p);history.path=history.path.filter(p=>now-p.time<=1200).slice(-32);}else history.path=[];
      const duration=history.path.length?(now-history.path[0].time)/1000:0;
      let travel=0;for(let i=1;i<history.path.length;i++)travel+=Math.hypot(history.path[i].u-history.path[i-1].u,history.path[i].v-history.path[i-1].v);
      const us=history.path.map(p=>p.u),vs=history.path.map(p=>p.v),span=history.path.length?Math.hypot(Math.max(...us)-Math.min(...us),Math.max(...vs)-Math.min(...vs)):0;
      const stroke=near&&history.path.length>=3&&duration>=.24&&span>.35/this.sensitivity&&travel>.55/this.sensitivity;
      candidates.push({handId:hand.id,point:chosen.point,u:p.u,v:p.v,near,gesture:now<history.patUntil?'pat':stroke?'headStroke':'idle',duration,travel,span,approach:!!history.approach,pointId:chosen.id,drop:+drop.toFixed(2),descentMs:Math.round(dt*1000),speed:dt?+(drop/dt).toFixed(2):0,patGate:!approach?'no-raised-history':!near||p.u>1.5?'outside-contact':!history.armed?'needs-lift':dt>.6?'descent-too-slow':drop<=.22/this.sensitivity?'descent-too-small':drop/dt<=.8/this.sensitivity?'speed-too-low':Math.abs(p.v-approach.v)>=1.25?'too-much-sideways':'ready'});
    }
    const chosen=candidates.find(c=>c.gesture==='pat')??candidates.find(c=>c.gesture==='headStroke')??candidates.sort((a,b)=>Math.hypot(a.u-1,a.v)-Math.hypot(b.u-1,b.v))[0];
    const gesture:Gesture=chosen?.gesture==='pat'?'pat':cradle?'cradle':chosen?.gesture==='headStroke'?'headStroke':'idle';
    const strength=gesture==='pat'?.3:gesture==='headStroke'?.14:0;
    const distances=zones.map(z=>Math.hypot(z.position[0],(z.position[1]-.98)*2,z.position[2]));const minimum=distances.length?Math.min(...distances):0;
    const values=distances.map(d=>strength*Math.exp(-(d*d-minimum*minimum)/.18));
    const reason=gesture!=='idle'?gesture:!chosen?'outside-head':chosen.near?'insufficient-motion':'approaching';
    const message=gesture==='pat'?'短促拍头 · 视觉估计':gesture==='headStroke'?'头部连续轻扫 · 视觉估计':gesture==='cradle'?'双手从下方或两侧托抱 · 视觉估计':chosen?.near?'手已进入头部范围，等待短拍或连续轻扫':'动作手还没进入头部范围，参考预览里的蓝色圈';
    finish(reason,{values,gesture,message,contact:chosen?.near?chosen.point:null},{candidates:candidates.map(c=>({id:c.handId,u:+c.u.toFixed(2),v:+c.v.toFixed(2),near:c.near,pointId:c.pointId,drop:c.drop,descentMs:c.descentMs,speed:c.speed,patGate:c.patGate})),pathMs:chosen?Math.round(chosen.duration*1000):0,span:chosen?+chosen.span.toFixed(2):0,travel:chosen?+chosen.travel.toFixed(2):0,approach:chosen?.approach??false,supportPair:pair,support:{reason:supportReason,palms:palms.map(p=>({id:p.id,u:+p.u.toFixed(2),v:+p.v.toFixed(2)})),elapsedMs:this.supportSince===null?0:Math.round(now-this.supportSince),requiredMs:Math.round(cradleWait)}});
  }
}
