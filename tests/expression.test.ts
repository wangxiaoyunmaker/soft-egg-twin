import test from 'node:test';
import assert from 'node:assert/strict';
import { Expression } from '../src/scene/expression.ts';

const idle={held:false,pressing:false,displacement:0,lift:0,serving:false};
test('contact, upward stretching, and release produce distinct, smoothly changing expressions',()=>{
  const face=new Expression();
  face.update(1/60,{...idle,held:true,displacement:.15,lift:-.15});
  assert.equal(face.name,'squished');assert.ok(face.squeeze>0&&face.squeeze<1);
  for(let i=0;i<20;i++)face.update(1/60,{...idle,held:true,displacement:.3,lift:.3});
  assert.equal(face.name,'surprised');assert.ok(face.surprise>.8&&face.squeeze<.01);
  face.update(1/60,idle);assert.equal(face.name,'relieved');
  for(let i=0;i<90;i++)face.update(1/60,idle);
  assert.equal(face.name,'happy');assert.ok(face.squeeze<.001&&face.surprise<.001);
});
test('spoon presses react, and reset cancels the release reaction',()=>{
  const face=new Expression();face.update(.1,{...idle,pressing:true});
  assert.equal(face.name,'squished');face.reset();face.update(1/60,idle);
  assert.equal(face.name,'happy');assert.equal(face.relief,0);
  face.update(.1,{...idle,serving:true});assert.equal(face.name,'surprised');
});
