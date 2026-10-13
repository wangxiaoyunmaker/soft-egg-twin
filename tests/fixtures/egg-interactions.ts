import type { EggObservation } from '../../src/twin/egg-tracking.ts';
import type { TrackedHand } from '../../src/twin/tracking.ts';
import { supportHand,translateHand } from './hands.ts';
import { palmCenter } from '../../src/twin/tracking.ts';
/** Synthetic test geometry, not captured users. */
export const egg:EggObservation={x:.5,y:.46,angle:Math.PI/2,angleReliable:true,major:.19,minor:.115,bounds:{x:.44,y:.33,width:.12,height:.26}};
export function headHand(u:number,v=0):TrackedHand {
  const h=translateHand(supportHand(),0,-.35);
  for(const id of [4,8,12,16,9])h.landmarks[id]={x:egg.x+v*egg.minor/2,y:egg.y-u*egg.major/2*4/3};
  h.center=palmCenter(h.landmarks)!;return {...h,id:2,handedness:'Right'};
}
