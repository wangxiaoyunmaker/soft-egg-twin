import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HeadAnchor} from '../src/twin/head-anchor.ts';
import {egg} from './fixtures/egg-interactions.ts';
import {supportHand,translateHand} from './fixtures/hands.ts';
test('short head occlusion follows the supporting hand and expires after 1.2 seconds',()=>{
  const a=new HeadAnchor(),h=supportHand();a.observe(egg,[h],0);
  assert.equal(a.read([h],70)?.x,egg.x);assert.equal(a.source,'measured');
  const pose=a.read([translateHand(h,.02,.01)],500)!;assert.ok(Math.abs(pose.x-egg.x-.02)<1e-6);assert.equal(a.source,'short-occlusion');
  assert.equal(a.read([h],1300),null);assert.equal(a.source,'expired');
});
test('explicit manual head reference follows a supporting hand until reset',()=>{
  const a=new HeadAnchor(),h=supportHand();a.markHead({x:.5,y:.33},null,[h],0,4/3);
  const first=a.read([h],0)!;a.observe({...egg,x:.8},[h],100);
  assert.ok(Math.abs(a.read([translateHand(h,.02,0)],5000)!.x-first.x-.02)<1e-6);assert.equal(a.source,'manual-follow');
  a.reset();assert.equal(a.read([h],5100),null);
});
