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
