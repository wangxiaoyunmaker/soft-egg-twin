import * as THREE from 'three/webgpu';
import type { Simulation } from '../physics/simulation.ts';
import { Expression } from './expression.ts';

/** A transparent face decal sampled in the skin's rest coordinates, so it stretches with the egg. */
export function createFace(sim:Simulation) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=320;
  const ctx=canvas.getContext('2d')!;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
  const expression=new Expression();let previous='',elapsed=0;
  const ink='#302921';
  function draw() {
    const {squeeze:s,surprise:o,relief:r,blink:b,comfort:c}=expression;
    ctx.clearRect(0,0,512,320);ctx.lineCap='round';ctx.lineJoin='round';
    for(const x of [151,361]) {
      const blush=ctx.createRadialGradient(x,198,2,x,198,35);
      blush.addColorStop(0,'rgba(234,145,133,.65)');blush.addColorStop(1,'rgba(234,145,133,0)');
      ctx.fillStyle=blush;ctx.beginPath();ctx.ellipse(x,198,35,24,0,0,Math.PI*2);ctx.fill();
    }
    for(const [x,side] of [[185,-1],[327,1]]) {
      const openness=Math.max(.035,(1-b)*(1-s*.94)*(1-c*.8));
      const height=(25+o*12-(r+c)*4)*openness;
      ctx.fillStyle=ink;ctx.globalAlpha=1-s;
      ctx.beginPath();ctx.ellipse(x,139,15+o*3,height,side*o*.08,0,Math.PI*2);ctx.fill();
      if(openness>.25) {
        ctx.fillStyle='#fffdf4';ctx.beginPath();ctx.ellipse(x-5,130,5,6*openness,0,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=(1-s)*.65;ctx.beginPath();ctx.arc(x+5,148,2.3,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=s;ctx.strokeStyle=ink;ctx.lineWidth=7;
      ctx.beginPath();ctx.moveTo(x-17,132);ctx.quadraticCurveTo(x,117-s*3,x+17,132);ctx.stroke();
      ctx.globalAlpha=o*.7;ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(x-13,95-o*8);ctx.quadraticCurveTo(x,89-o*8,x+12,96-o*8);ctx.stroke();
    }
    // Crossfade a tiny cat smile, a scrunched mouth, and a surprised "o".
    ctx.globalAlpha=Math.max(0,1-s-o);ctx.strokeStyle=ink;ctx.lineWidth=6;
    ctx.beginPath();ctx.moveTo(232,209);ctx.bezierCurveTo(237,227+(r+c)*4,251,225+(r+c)*4,256,215);
    ctx.bezierCurveTo(261,225+(r+c)*4,275,227+(r+c)*4,280,209);ctx.stroke();
    ctx.globalAlpha=s;ctx.beginPath();ctx.moveTo(231,216);
    ctx.bezierCurveTo(240,207,244,230,254,217);ctx.bezierCurveTo(264,204,272,228,282,215);ctx.stroke();
    ctx.globalAlpha=o;ctx.fillStyle=ink;ctx.beginPath();ctx.ellipse(256,216,13,17+o*4,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#eeaaa2';ctx.beginPath();ctx.ellipse(256,228,7,4,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;texture.needsUpdate=true;
  }
  function update(dt:number,serving:boolean,pressure=0,stroke=false) {
    const grab=sim.body.grab;
    const lift=grab?grab.cursor[1]-grab.anchor[1]:0;
    const displacement=grab?Math.hypot(...grab.cursor.map((v,k)=>v-grab.anchor[k])):0;
    expression.update(sim.paused?0:dt,{held:!!grab,pressing:!!sim.body.spoon,displacement,lift,serving,pressure,stroke});
    elapsed+=dt;
    const key=[expression.squeeze,expression.surprise,expression.relief,expression.blink,expression.comfort].map(v=>Math.round(v*40)).join(',');
    if(key!==previous&&elapsed>=1/30){draw();previous=key;elapsed=0;}
  }
  draw();
  return {texture,update,get name(){return expression.name;},reset(){expression.reset();previous='';draw();},dispose(){texture.dispose();}};
}
