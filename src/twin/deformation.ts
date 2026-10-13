import type { Zone } from './config.ts';
/** Artistic pressure-to-shape mapping, bounded and recomputed from the physics skin each frame. */
export class PressureSkin {
  private influences:Float32Array[];
  private directions:[number,number,number][];
  constructor(rest:Float32Array,height:number,zones:Zone[]){
    this.influences=[];this.directions=[];
    for(const zone of zones){
      const desired=[zone.position[0]*.95,zone.position[1]*height,zone.position[2]*.95];
      let nearest=0,best=Infinity;
      for(let j=0;j<rest.length;j+=3){const d=Math.hypot(rest[j]-desired[0],rest[j+1]-desired[1],rest[j+2]-desired[2]);if(d<best){best=d;nearest=j;}}
      const anchor=[rest[nearest],rest[nearest+1],rest[nearest+2]];
      const direction:[number,number,number]=[-anchor[0],height*.5-anchor[1],-anchor[2]],length=Math.hypot(...direction)||1;
      this.directions.push(direction.map(v=>v/length) as [number,number,number]);
      this.influences.push(Float32Array.from({length:rest.length/3},(_,i)=>Math.exp(-((rest[i*3]-anchor[0])**2+(rest[i*3+1]-anchor[1])**2+(rest[i*3+2]-anchor[2])**2)/.22)));
    }
  }
  apply(positions:Float32Array,touch:Float32Array,values:number[]){
    touch.fill(0);
    for(let i=0;i<touch.length;i++){
      let dx=0,dy=0,dz=0,sum=0;
      for(let z=0;z<this.influences.length;z++){
        const a=this.influences[z][i]*Math.max(0,Math.min(1,values[z]??0)),d=this.directions[z];
        sum+=a;dx+=d[0]*a;dy+=d[1]*a;dz+=d[2]*a;
      }
      // More channels never make the displacement unbounded.
      const strength=.16/Math.max(1,sum);
      positions[i*3]+=dx*strength;positions[i*3+1]+=dy*strength;positions[i*3+2]+=dz*strength;
      touch[i]=Math.min(1,sum*1.8);
    }
  }
}
