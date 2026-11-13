// Static locker placement and collision on the source-geometry navigation.
// Footprint modestly widens/deepens the approved GLB to make hiding plausible.
import {createSourceWorldNavigation} from './source-world-navigation.js';

const WIDTH = .64, DEPTH = .64, HEIGHT = 1.895;
const HALF_WIDTH = WIDTH / 2, HALF_DEPTH = DEPTH / 2;
// Unit back vectors point toward the supporting wall. The model door is local +Z.
// Rotating that door toward -back keeps it and the slit camera facing outward.
const sites = [
  ['west', -55.15, 4.515, 0, 1],
  ['central', -34.501, 6.923, 1, 0],
  ['far-west', -79.85, 4.515, 0, 1],
  ['vr', -34.00, -31.582, 0, -1],
  ['southwest', -87.564, 32.504, -1, 0],
  // 2026-11-13: the same two authored wall positions (north face of the lower
  // block, west face of the long partition) in the eastern and southern rooms.
  // Rooms placed at 180 degrees use the mirrored coordinates and back vector.
  ['east', -4.75, -3.585, 0, 1],
  ['southeast', 4.75, 12.585, 0, -1],
  ['far-southeast', -4.75, 46.815, 0, 1],
  ['south', -34.501, 57.323, 1, 0],
  ['south-southwest', -45.65, 45.885, 0, -1],
  ['far-south-southwest', -80.35, 54.915, 0, 1],
];

function placement([id,x,z,bx,bz]) {
  const front=[x-bx*HALF_DEPTH,z-bz*HALF_DEPTH];
  return {
    id, position:[x,0,z], yaw:Math.atan2(-bx,-bz), scale:[1.6,1,.64/.474],
    body:{min:[x-HALF_WIDTH,0,z-HALF_DEPTH],max:[x+HALF_WIDTH,HEIGHT,z+HALF_DEPTH]},
    front, approach:[x-bx*1.1,z-bz*1.1], exit:[x-bx*1.1,z-bz*1.1],
    camera:[x-bx*.13511,1.6105,z-bz*.13511], facingYaw:Math.atan2(-bx,bz),
  };
}

/** Build a fresh source navigation with immutable collision bodies for the lockers.
 * Construct before any routes are cached; do not retrofit these volumes onto an existing nav.
 * Returns {nav, lockers}. The only mutable gate remains the authored exit.
 */
export function createLockerNavigation(data, layout = {}) {
  const lockers=sites.map(placement);
  const gateIds=new Set(lockers.map(l=>'locker:'+l.id));
  const authored=data.gates ?? layout.gates ?? [];
  if (authored.some(g=>gateIds.has(g.id))) throw new TypeError('Locker collision id conflicts with authored gate');
  const gates=[...authored,...lockers.map(l=>({id:'locker:'+l.id,barrier:l.body,initiallyOpen:false}))];
  const nav=createSourceWorldNavigation({...data,gates},layout);
  const setGateOpen=nav.setGateOpen;
  nav.setGateOpen=(id,value)=>gateIds.has(id) ? false : setGateOpen(id,value);
  return {nav,lockers};
}

