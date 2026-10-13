import type { PixelFrame } from '../../src/twin/egg-tracking.ts';
/** Generated test pixels, never presented as an actual camera capture. */
export function eggFrame(options:{x?:number;y?:number;angle?:number;scale?:number;color?:number[];hidden?:boolean;circle?:boolean;distractor?:boolean;width?:number;height?:number}={}):PixelFrame {
  const width=options.width??192,height=options.height??144,data=new Uint8ClampedArray(width*height*4);
  const cx=(options.x??.5)*width,cy=(options.y??.46)*height,angle=options.angle??Math.PI/2;
  const major=18*(options.scale??1),minor=(options.circle?18:11)*(options.scale??1),color=options.color??[241,202,30];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const dx=x-cx,dy=y-cy,u=dx*Math.cos(angle)+dy*Math.sin(angle),v=-dx*Math.sin(angle)+dy*Math.cos(angle);
    const inside=!options.hidden&&u*u/(major*major)+v*v/(minor*minor)<=1;
    const distractor=options.distractor&&(x-25)**2/225+(y-30)**2/400<1;
    const c=inside||distractor?color:[70,83,75],i=(y*width+x)*4;
    data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=255;
  }
  return {width,height,data};
}
