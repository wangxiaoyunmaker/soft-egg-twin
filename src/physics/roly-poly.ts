import type { VolumeMesh } from './mesh.ts';

/**
 * Virtual ballast: a damped restoring torque, rather than a position reset.
 * Estimate the body's up axis from its mass-weighted rest-height covariance.
 * This ignores translation and keeps local squeezing free to deform the skin.
 */
export function rightEgg(mesh:VolumeMesh,p:Float64Array,v:Float64Array,dt:number,held:boolean) {
  const {mass,rest}=mesh;
  let total=0,cx=0,cy=0,cz=0,ry=0;
  for(let i=0;i<mass.length;i++) {
    const j=i*3,m=mass[i];total+=m;cx+=m*p[j];cy+=m*p[j+1];cz+=m*p[j+2];ry+=m*rest[j+1];
  }
  if(total<=0)return 0;
  cx/=total;cy/=total;cz/=total;ry/=total;
  let ax=0,ay=0,az=0,dx=0,dy=0,dz=0;
  for(let i=0;i<mass.length;i++) {
    const j=i*3,w=mass[i]*(rest[j+1]-ry);
    ax+=w*(p[j]-cx);ay+=w*(p[j+1]-cy);az+=w*(p[j+2]-cz);
    dx+=w*v[j];dy+=w*v[j+1];dz+=w*v[j+2];
  }
  const length=Math.hypot(ax,ay,az);
  if(length<1e-8)return 0;
  ax/=length;ay/=length;az/=length;
  // a × da is the angular rate that changes the up axis (yaw stays free).
  const wx=(ay*dz-az*dy)/length,wz=(ax*dy-ay*dx)/length;
  const horizontal=Math.hypot(ax,az),angle=Math.atan2(horizontal,ay);
  const strength=held?.18:1;
  let tx=0,tz=0;
  if(horizontal>1e-7){tx=-az/horizontal*angle*14;tz=ax/horizontal*angle*14;}
  else if(ay<0)tx=14*Math.PI; // A fully upside-down egg still has a way back.
  tx=(tx-4.5*wx)*strength;tz=(tz-4.5*wz)*strength;
  const acceleration=Math.hypot(tx,tz),limit=Math.min(1,12/(acceleration||1));
  tx*=limit*dt;tz*=limit*dt;
  for(let i=0;i<mass.length;i++) {
    const j=i*3,x=p[j]-cx,y=p[j+1]-cy,z=p[j+2]-cz;
    // A shared angular impulse conserves the centre's linear momentum.
    v[j]-=tz*y;v[j+1]+=tz*x-tx*z;v[j+2]+=tx*y;
  }
  return angle*180/Math.PI;
}
