import type { TwinConfig } from './config.ts';
export type Gesture='idle'|'touch'|'pinch'|'hold'|'stroke'|'press';
export interface PressureFrame { values:number[]; normalized:boolean }
export function parsePressure(line:string,config:TwinConfig):PressureFrame {
  const packet:unknown=JSON.parse(line);
  if(!packet||typeof packet!=='object'||!('pressure' in packet))throw new Error('数据缺少 pressure');
  const data=packet as {pressure:unknown;normalized?:unknown};
  if(data.normalized!==undefined&&typeof data.normalized!=='boolean')throw new Error('normalized 必须为布尔值');
  const p=data.pressure;
  let values:unknown[];
  if(Array.isArray(p)){
    if(p.length!==config.zones.length)throw new Error(`需要 ${config.zones.length} 个压力值`);
    values=p;
  }else if(p&&typeof p==='object'){
    values=config.zones.map(z=>Object.hasOwn(p,z.id)?(p as Record<string,unknown>)[z.id]:undefined);
  }else throw new Error('pressure 必须是数组或按区域 id 命名的对象');
  if(!values.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e9))throw new Error('每帧必须包含所有区域的有限非负数值');
  if(data.normalized&&values.some(v=>(v as number)>1))throw new Error('归一化压力应在 0–1 之间');
  return {values:values as number[],normalized:data.normalized===true};
}
/** Bounded line framing; malformed or overlong packets cannot grow the buffer indefinitely. */
export class LineDecoder {
  private pending='';
  private dropping=false;
  push(chunk:string):string[] {
    const lines:string[]=[];
    for(const char of chunk){
      if(char==='\n'){
        if(!this.dropping&&this.pending.trim())lines.push(this.pending.trim());
        this.pending='';this.dropping=false;
      }else if(!this.dropping){
        this.pending+=char;
        if(this.pending.length>8192){this.pending='';this.dropping=true;}
      }
    }
    return lines;
  }
}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export class PressureEngine {
  config:TwinConfig;
  values:number[];
  raw:number[];
  targets:number[];
  gesture:Gesture='idle';
  peak=0;
  lastReceived=-Infinity;
  normalized=false;
  private heldFor=0;
  private path:{index:number;time:number}[]=[];
  private lastDominant=-1;
  private strokeUntil=0;
  constructor(config:TwinConfig){this.config=config;this.values=config.zones.map(()=>0);this.raw=[...this.values];this.targets=[...this.values];}
  ingest(frame:PressureFrame,now:number){
    if(frame.values.length!==this.values.length||!frame.values.every(Number.isFinite))return false;
    this.raw=[...frame.values];this.normalized=frame.normalized;this.lastReceived=now;
    this.targets=frame.values.map((v,i)=>{
      const z=this.config.zones[i],p=clamp(frame.normalized?v:(v-z.baseline)/(z.maximum-z.baseline));
      return p<.035?0:p;
    });
    return true;
  }
  fresh(now:number){return now-this.lastReceived<=this.config.staleMs;}
  clear(){this.targets.fill(0);this.values.fill(0);this.raw.fill(0);this.lastReceived=-Infinity;this.gesture='idle';this.peak=this.heldFor=this.strokeUntil=0;this.path=[];this.lastDominant=-1;}
  calibrate(now:number){
    if(!this.fresh(now)||this.normalized)throw new Error('需要当前硬件的原始压力数据，才能校零');
    if(this.raw.some((v,i)=>v>=this.config.zones[i].maximum))throw new Error('当前读数已达到 maximum，请先检查量程');
    const next=structuredClone(this.config);next.zones.forEach((z,i)=>z.baseline=this.raw[i]);
    this.config=next;this.clear();return next;
  }
  update(dt:number,now:number){
    dt=Math.max(0,Math.min(.1,dt));
    const fresh=this.fresh(now),k=1-Math.exp(-dt*18);
    for(let i=0;i<this.values.length;i++)this.values[i]+=((fresh?this.targets[i]:0)-this.values[i])*k;
    this.peak=Math.max(...this.values);
    if(!fresh||this.peak<.045){this.gesture='idle';this.heldFor=0;this.path=[];this.lastDominant=-1;this.strokeUntil=0;return;}
    const strong=this.values.filter(v=>v>.28).length;
    this.heldFor=strong>=Math.min(2,this.values.length)?this.heldFor+dt:0;
    if(this.peak>.38){
      this.gesture=this.heldFor>.55?'hold':'pinch';this.path=[];this.lastDominant=-1;this.strokeUntil=0;return;
    }
    const dominant=this.values.indexOf(this.peak);
    this.path=this.path.filter(p=>now-p.time<1400);
    if(this.peak>.07&&this.values.filter(v=>v>.12).length<=2&&dominant!==this.lastDominant){
      const previous=this.path.at(-1);
      if(previous){
        const a=this.config.zones[previous.index].position,b=this.config.zones[dominant].position;
        if(Math.hypot(a[0]-b[0],(a[1]-b[1])*2,a[2]-b[2])>1.25)this.path=[];
      }
      this.path.push({index:dominant,time:now});this.lastDominant=dominant;
      if(new Set(this.path.map(p=>p.index)).size>=3&&now-this.path[0].time>180)this.strokeUntil=now+650;
    }
    this.gesture=now<this.strokeUntil?'stroke':'touch';
  }
}
