import type { VolumeMesh } from '../physics/mesh.ts';
import type { PuddingSurface } from './surface.ts';

/**
 * Per-vertex material masks. `glaze` is a continuous ivory-to-cream tint over the egg;
 * `cut` is the convex share of interior nodes, distinguishing bites from the outer skin.
 */
export function surfaceAttributes(skin:PuddingSurface,mesh:VolumeMesh):{glaze:Float32Array;cut:Float32Array} {
  const glaze=new Float32Array(skin.count),cut=new Float32Array(skin.count);
  for(let i=0;i<skin.count;i++) {
    const y=skin.rest[i*3+1];
    const t=Math.min(1,Math.max(0,y/mesh.height));
    let interior=0;
    for(let k=skin.offsets[i];k<skin.offsets[i+1];k++)if(!mesh.outer[skin.nodes[k]])interior+=skin.weights[k];
    cut[i]=Math.min(1,Math.max(0,interior));
    glaze[i]=t*t*(3-2*t)*(1-cut[i]);
  }
  return {glaze,cut};
}
