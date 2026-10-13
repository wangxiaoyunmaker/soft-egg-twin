export interface Landmark {x:number;y:number;z?:number}
export function palmCenter(points:Landmark[]):{x:number;y:number}|null {
  const ids=[0,5,9,13,17];
  if(ids.some(i=>!points[i]||!Number.isFinite(points[i].x)||!Number.isFinite(points[i].y)))return null;
  return {x:ids.reduce((sum,i)=>sum+points[i].x,0)/ids.length,y:ids.reduce((sum,i)=>sum+points[i].y,0)/ids.length};
}
export class HandPosition {
  x=0;y=0;lastSeen=-Infinity;
  private center:{x:number;y:number}|null=null;
  private current:{x:number;y:number}|null=null;
  private target={x:0,y:0};
  receive(points:Landmark[],now:number){
    const p=palmCenter(points);if(!p)return;
    this.current=p;this.center??=p;this.lastSeen=now;
    this.target={x:Math.max(-1,Math.min(1,(this.center.x-p.x)*4)),y:Math.max(-1,Math.min(1,(this.center.y-p.y)*4))};
  }
  recenter(){if(this.current)this.center={...this.current};this.target={x:0,y:0};}
  reset(){this.x=this.y=0;this.lastSeen=-Infinity;this.center=this.current=null;this.target={x:0,y:0};}
  update(dt:number,now:number){
    // Hold the last known position through occlusion; do not invent movement.
    if(now-this.lastSeen>400)return;
    const k=1-Math.exp(-Math.max(0,Math.min(dt,.1))*10);
    this.x+=(this.target.x-this.x)*k;this.y+=(this.target.y-this.y)*k;
  }
}

export interface DetectedHand {landmarks:Landmark[];handedness:string}
export interface TrackedHand extends DetectedHand {id:number;center:{x:number;y:number};lastSeen:number}
/** Match geometry globally for two hands. Model output ordering is not an identity. */
export class TwoHandTracker {
  hands:TrackedHand[]=[];
  holderId:number|null=null;
  private tracks:TrackedHand[]=[];
  private nextId=1;
  get holder(){return this.hands.find(h=>h.id===this.holderId);}
  get actor(){return this.hands.find(h=>h.id!==this.holderId);}
  reset(){this.hands=[];this.tracks=[];this.holderId=null;this.nextId=1;}
  swap(){const other=this.actor;if(!other)return false;this.holderId=other.id;return true;}
  update(detections:DetectedHand[],now:number){
    const candidates=detections.slice(0,2).flatMap(d=>{const center=palmCenter(d.landmarks);return center?[{...d,center}]:[];});
    this.tracks=this.tracks.filter(t=>t.id===this.holderId||now-t.lastSeen<1800);
    // Enumerate assignments: unmatched has a cost, but a distant hand cannot steal a track.
    let best:number[]=[],bestCost=Infinity;
    const visit=(i:number,used:Set<number>,assignment:number[],cost:number)=>{
      if(i===candidates.length){if(cost<bestCost){bestCost=cost;best=[...assignment];}return;}
      visit(i+1,used,[...assignment,-1],cost+.32);
      this.tracks.forEach((t,j)=>{
        if(used.has(j))return;
        const c=candidates[i],distance=Math.hypot(t.center.x-c.center.x,t.center.y-c.center.y);
        if(t.handedness&&c.handedness&&t.handedness!==c.handedness)return;
        const returning=t.id===this.holderId&&now-t.lastSeen>400&&!!t.handedness&&t.handedness===c.handedness;
        if(distance>.3&&!returning)return;
        visit(i+1,new Set([...used,j]),[...assignment,j],cost+(returning?Math.min(distance,.25):distance));
      });
    };
    visit(0,new Set(),[],0);
    this.hands=candidates.map((d,i)=>({...d,id:best[i]>=0?this.tracks[best[i]].id:this.nextId++,lastSeen:now}));
    const seen=new Set(this.hands.map(h=>h.id));
    this.tracks=[...this.tracks.filter(t=>!seen.has(t.id)),...this.hands];
    if(this.holderId===null){
      // A lower palm is a useful default for supporting an object; the user can swap roles.
      this.holderId=[...this.hands].sort((a,b)=>b.center.y-a.center.y)[0]?.id??null;
    }
  }
}
