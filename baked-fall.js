import {BAKED_PITS} from './baked-pits-data.js';

// The original Baked mesh has 35 rectangular recesses, each with a solid
// bottom. Its runtime bottom-only cut creates the abyss; these exact bounds
// were extracted from the original bottom triangles, not the navigation grid.
// The AI graph remains conservative: only a player deliberately moving toward
// a visible edge can enter the fall, and no ordinary collision is relaxed.
export function bakedFallTarget({position, intent, inBaked, floorHeight}) {
  if (!inBaked || !Number.isFinite(floorHeight) || floorHeight < -.2 ||
      !Array.isArray(position) || !Array.isArray(intent) ||
      ![...position, ...intent].every(Number.isFinite)) return null;
  const length=Math.hypot(...intent);
  if (length < 1e-7) return null;
  let best=null,dist=Infinity;
  for (const [xmin,xmax,zmin,zmax] of BAKED_PITS) {
    const x=Math.max(xmin+.12,Math.min(xmax-.12,position[0]));
    const z=Math.max(zmin+.12,Math.min(zmax-.12,position[1]));
    const dx=x-position[0],dz=z-position[1],distance=Math.hypot(dx,dz);
    if (distance > .43 || distance < .001 || distance >= dist) continue;
    if ((dx*intent[0]+dz*intent[1])/(distance*length)<.72) continue;
    best=[Math.max(xmin+.32,Math.min(xmax-.32,x)),Math.max(zmin+.32,Math.min(zmax-.32,z))];dist=distance;
  }
  return best;
}

export const FALL_DURATION=2.8;
export function fallFrame({time,startEye,target,yaw,pitch}) {
  const t=Math.max(0,Math.min(FALL_DURATION,Number.isFinite(time)?time:0));
  const horizontal=Math.min(1,t/.32), drop=1.8*t*t;
  return {eye:[startEye[0]+(target[0]-startEye[0])*horizontal,startEye[1]-drop,startEye[2]+(target[1]-startEye[2])*horizontal],
    yaw,pitch:pitch+(-.38-pitch)*Math.min(1,t/.6),blackout:Math.max(0,Math.min(1,(t-1.5)/.85)),done:t>=FALL_DURATION};
}
