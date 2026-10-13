import type { Zone } from './config.ts';
import type { Gesture } from './pressure.ts';
import type { TrackedHand } from './tracking.ts';
import type { EggObservation } from './egg-tracking.ts';
export type EggInteraction='none'|'head-pat'|'head-stroke'|'cradle';
export interface InteractionFeedback {values:number[];gesture:Gesture;message:string;contact:{x:number;y:number}|null}
/** Relative image-space cues around the visible crown. Contact is a visual estimate. */
export class EggInteractions {
  sensitivity=1;
  private lastSample=-Infinity;
  private actorId:number|null=null;
  private pointId=8;
  private previous:{u:number;v:number;time:number}|null=null;
  private path:{u:number;v:number;time:number}[]=[];
  private patUntil=0;
  private patArmed=true;
  private supportSince:number|null=null;
  private supportPair='';
  private result:InteractionFeedback={values:[],gesture:'idle',message:'等待黄色蛋和手进入画面',contact:null};
  reset(){this.lastSample=-Infinity;this.actorId=null;this.previous=null;this.path=[];this.patUntil=0;this.patArmed=true;this.supportSince=null;this.supportPair='';this.result={values:[],gesture:'idle',message:'动作识别已重置',contact:null};}
  release(){this.reset();}
  calibrate(){this.reset();}
  feedback(now:number,count:number):InteractionFeedback {
    if(now-this.lastSample>300)return {values:Array(count).fill(0),gesture:'idle',message:'画面未更新 · 动作已释放',contact:null};
    return this.result;
  }
  sample(hands:TrackedHand[],egg:EggObservation|null,zones:Zone[],now:number,aspect=4/3){
    const empty=(message:string):InteractionFeedback=>({values:zones.map(()=>0),gesture:'idle',message,contact:null});
    if(now-this.lastSample>350){this.previous=null;this.path=[];this.patUntil=0;this.supportSince=null;this.patArmed=true;}
    this.lastSample=now;
    if(!egg||!Number.isFinite(aspect)||aspect<=0||!hands.length){this.previous=null;this.path=[];this.patUntil=0;this.supportSince=null;this.actorId=null;this.result=empty(egg?'请把手放进画面':'先露出黄色蛋，让金框锁定');return;}
    const major=Math.max(.025,egg.major/2),minor=Math.max(.018,egg.minor/2);
    let ax=Math.cos(egg.angle),ay=Math.sin(egg.angle);
    // The upper end of the visible long axis is the crown. A textureless 180° flip remains ambiguous.
    if(ay>0){ax=-ax;ay=-ay;}
    if(!egg.angleReliable){ax=0;ay=-1;}
    const relative=(p:{x:number;y:number})=>{
      const dx=p.x-egg.x,dy=(p.y-egg.y)/aspect;
      return {u:(dx*ax+dy*ay)/major,v:(-dx*ay+dy*ax)/minor};
    };
    const valid=hands.filter(h=>h.landmarks.length>=21&&h.landmarks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    // Both palms must remain below the egg, near it and separated. Two visible hands alone are insufficient.
    const supporters=valid.filter(h=>{const p=relative(h.center);return p.u<-.1&&p.u>-2.7&&Math.abs(p.v)<3.2;});
    const a=supporters[0],b=supporters[1],ra=a?relative(a.center):null,rb=b?relative(b.center):null;
    const pair=a&&b&&ra&&rb&&Math.abs(ra.v-rb.v)>.65&&Math.abs(ra.u-rb.u)<1.5?[a.id,b.id].sort((x,y)=>x-y).join(':'):'';
    if(pair&&pair===this.supportPair)this.supportSince??=now;else {this.supportPair=pair;this.supportSince=pair?now:null;}
    const cradle=!!pair&&this.supportSince!==null&&now-this.supportSince>=350;
    // Track a consistent fingertip (or palm knuckle) approaching the crown from above.
    const candidates=valid.flatMap(hand=>{
      const palm=relative(hand.center);
      if(palm.u<.15)return [];
      const ids=hand.id===this.actorId?[this.pointId]:[8,12,16,4,9];
      return ids.flatMap(id=>{const point=hand.landmarks[id],r=relative(point);
        return r.u>.45&&r.u<3&&Math.abs(r.v)<1.8?[{hand,id,point,...r,score:Math.hypot(r.u-1,r.v)+(hand.id===this.actorId?-.35:0)}]:[];
      });
    }).sort((x,y)=>x.score-y.score);
    const contact=candidates[0];
    if(!contact){this.actorId=null;this.previous=null;this.path=[];this.patUntil=0;this.patArmed=true;this.result=cradle?{values:zones.map(()=>0),gesture:'cradle',message:'两只手在蛋下方持续托举 · 视觉估计',contact:null}:empty('一只手从上方拍或摸蛋头，或两只手从下方托住');return;}
    if(this.actorId!==contact.hand.id||this.pointId!==contact.id){this.previous=null;this.path=[];this.patUntil=0;this.patArmed=true;this.actorId=contact.hand.id;this.pointId=contact.id;}
    const {u,v}=contact,prior=this.previous;
    this.previous={u,v,time:now};
    if(prior&&Math.hypot(u-prior.u,v-prior.v)>1.5){this.path=[];this.patUntil=0;this.result=empty('动作跳变 · 等待稳定画面');return;}
    const near=u<=1.45&&Math.abs(v)<=1.35;
    if(u>1.65)this.patArmed=true;
    const dt=prior?(now-prior.time)/1000:0;
    const descending=prior&&dt>=.025&&dt<=.25&&(prior.u-u)/dt>1.1/this.sensitivity;
    const entered=prior&&prior.u>1.45&&u<=1.35&&prior.u-u>.18/this.sensitivity;
    if(near&&entered&&descending&&Math.abs(v-prior!.v)<.65&&this.patArmed){this.patUntil=now+550;this.patArmed=false;this.path=[];}
    if(near){this.path.push({u,v,time:now});this.path=this.path.filter(p=>now-p.time<=800);}else this.path=[];
    const duration=this.path.length?(now-this.path[0].time)/1000:0;
    let travel=0;for(let i=1;i<this.path.length;i++)travel+=Math.abs(this.path[i].v-this.path[i-1].v);
    const span=this.path.length?Math.max(...this.path.map(p=>p.v))-Math.min(...this.path.map(p=>p.v)):0;
    const vertical=this.path.length?Math.max(...this.path.map(p=>p.u))-Math.min(...this.path.map(p=>p.u)):0;
    const stroke=near&&duration>=.25&&span>.45/this.sensitivity&&travel>.65/this.sensitivity&&vertical<.65;
    const gesture:Gesture=now<this.patUntil?'pat':stroke?'headStroke':cradle?'cradle':'idle';
    const strength=gesture==='pat'?.3:gesture==='headStroke'?.14:0;
    const distances=zones.map(z=>Math.hypot(z.position[0],(z.position[1]-.98)*2,z.position[2]));
    const minimum=distances.length?Math.min(...distances):0;
    const values=distances.map(d=>strength*Math.exp(-(d*d-minimum*minimum)/.18));
    const message=gesture==='pat'?'从上方短促拍头 · 视觉估计':gesture==='headStroke'?'沿蛋头连续轻扫 · 视觉估计':gesture==='cradle'?'两只手在蛋下方持续托举 · 视觉估计':near?'手在蛋头附近，等待拍下或轻扫':'拍头手靠近蛋的上端';
    this.result={values,gesture,message,contact:near?contact.point:null};
  }
}
