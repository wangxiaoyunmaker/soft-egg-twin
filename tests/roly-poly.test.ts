import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/physics/simulation.ts';

function axisHeight(s:Simulation) {
  const {rest,mass}=s.body.mesh,p=s.body.position;
  const low=[0,0,0],high=[0,0,0];let lm=0,hm=0;
  for(let i=0;i<mass.length;i++) {
    if(rest[i*3+1]<.4){lm+=mass[i];for(let k=0;k<3;k++)low[k]+=p[i*3+k]*mass[i];}
    if(rest[i*3+1]>1.5){hm+=mass[i];for(let k=0;k<3;k++)high[k]+=p[i*3+k]*mass[i];}
  }
  const a=high.map((v,k)=>v/hm-low[k]/lm);return a[1]/Math.hypot(...a);
}
test('a sideways or upside-down egg rocks back upright without resetting its mesh',()=>{
  for(const [degrees,axis] of [[70,'z'],[110,'x'],[180,'z']] as const) {
    const s=new Simulation(),p=s.body.position,angle=degrees*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle);
    let lowest=Infinity;
    for(let j=0;j<p.length;j+=3) {
      const a=p[j+(axis==='z'?0:2)],y=p[j+1]-1;
      p[j+(axis==='z'?0:2)]=c*a-sn*y;p[j+1]=sn*a+c*y+1;lowest=Math.min(lowest,p[j+1]);
    }
    for(let j=1;j<p.length;j+=3)p[j]-=lowest;s.body.previous.set(p);
    assert.ok(axisHeight(s)<.4,'the fixture starts tipped over');
    const tipped=p.slice(),mesh=s.body.mesh;
    s.advance(1/60);
    assert.ok(axisHeight(s)<.5,'recovery must be gradual');
    assert.ok(s.body.position.some((v,i)=>Math.abs(v-tipped[i])>1e-5),'recovery actually begins');
    for(let i=0;i<239;i++) {
      s.advance(1/60);const m=s.body.metrics();assert.ok(m.finite&&m.minTetRatio>0&&m.minY>=0,JSON.stringify({degrees,...m}));
    }
    assert.equal(s.body.mesh,mesh);assert.equal(s.body.eaten.size,0);
    assert.ok(axisHeight(s)>.99,`${degrees} degrees did not recover`);
    assert.ok(Math.abs(s.body.metrics().volumeRatio-1)<.03);
  }
});
