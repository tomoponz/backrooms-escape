// Places the owner's four downloaded props in the approved rooms: office chairs
// (several turned to face a wall), cardboard boxes that can be searched,
// wall vents and the electrical boxes that house the breakers. The GLBs are
// loaded unchanged; this module only chooses transforms. Chairs and boxes are
// solid (their footprints are listed in the layout so navigation agrees).
import {M} from './engine.js';

export const DRESSING_MODELS = Object.freeze({
  chair: 'assets/models/office-chair.glb',
  box: 'assets/models/cardboard-box.glb',
  vent: 'assets/models/vent.glb',
  electrical: 'assets/models/electrical-box.glb',
});
// Height each model is scaled to (metres) and the yaw that turns its authored
// front toward +Z, measured from the files.
const FIT = Object.freeze({
  chair: {height: 1.02, front: 0},
  box: {height: .36, front: 0},
  vent: {height: .42, front: -Math.PI / 2},
  electrical: {height: .52, front: 0},
});
export const BOX_SEARCH_RANGE = 1.45;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Matrix that scales a loaded model to `height`, centres it in X/Z and rests it on `y`. */
export function fitMatrix(model, {x, y, z, yaw = 0, height, centred = false}) {
  const {min, max} = model;
  if (!min || !max || !(max[1] > min[1])) throw new TypeError('Prop model has no bounds');
  const scale = height / (max[1] - min[1]);
  const anchor = [-(min[0] + max[0]) / 2, centred ? -(min[1] + max[1]) / 2 : -min[1], -(min[2] + max[2]) / 2];
  return M.mul(M.pose(x, y, z, yaw, scale), M.trs(anchor));
}

/**
 * createSetDressing({models, props, nav, breakers}) → {models, boxes, nearestBox, search, reset}
 * props come from layout.props; breakers are [{position:[x,y,z], wallNormal}] wall mounts.
 */
export function createSetDressing({models, props = [], nav, breakers = []}) {
  const instances = [], boxes = [];
  const instance = (type, matrix, id) => { const source = models[type]; if (!source) return null; const model = {...source, visible: true, matrix, id}; instances.push(model); return model; };
  for (const prop of props) {
    const fit = FIT[prop.type], source = models[prop.type];
    if (!fit || !source) continue;
    if (prop.type === 'vent') {
      // Wall mounted: position is [x, y, z] of the centre, yaw faces away from the wall.
      const [x, y, z] = prop.position;
      const model = instance('vent', fitMatrix(source, {x, y, z, yaw: (prop.yaw ?? 0) + fit.front, height: prop.height ?? fit.height, centred: true}), prop.id);
      if (model) model.regionId = prop.region ?? null;
      continue;
    }
    const [x, z] = prop.position, floor = nav.floorAt(x, z);
    if (!Number.isFinite(floor)) continue;
    const model = instance(prop.type, fitMatrix(source, {x, y: floor, z, yaw: (prop.yaw ?? 0) + fit.front, height: prop.height ?? fit.height}), prop.id);
    if (model) model.regionId = prop.region ?? null;
    if (prop.type === 'box' && model) {
      let stand = null;
      for (const [dx, dz] of [[.75, 0], [-.75, 0], [0, .75], [0, -.75], [.6, .6], [-.6, .6], [.6, -.6], [-.6, -.6]]) {
        const index = nav.nearest(x + dx, z + dz), point = nav.point(index);
        if (nav.open(index) && nav.canWalk(...point) && distance(point, [x, z]) < BOX_SEARCH_RANGE - .2) { stand = {i: index, position: point}; break; }
      }
      boxes.push({id: prop.id, position: [x, z], contains: prop.contains ?? null, opened: false, model, stand});
    }
  }
  for (const [n, breaker] of breakers.entries()) {
    const [nx, , nz] = breaker.wallNormal, [x, y, z] = breaker.position, source = models.electrical;
    if (!source) continue;
    // Back of the box on the wall face (the mount point is 15 mm in front of it).
    const scale = FIT.electrical.height / (source.max[1] - source.min[1]), depth = (source.max[2] - source.min[2]) * scale;
    const model = instance('electrical', fitMatrix(source, {x: x + nx * (depth / 2 - .015), y: y - .06, z: z + nz * (depth / 2 - .015), yaw: Math.atan2(nx, nz) + FIT.electrical.front, height: FIT.electrical.height, centred: true}), 'electrical-box-' + n);
    if (model) model.regionId = breaker.instanceId ?? null;
  }
  function nearestBox(player) {
    let best = null, bestDistance = BOX_SEARCH_RANGE;
    for (const box of boxes) {
      if (box.opened) continue;
      const d = distance(player, box.position);
      if (d <= bestDistance) { best = box; bestDistance = d; }
    }
    return best;
  }
  /** Open the nearest unopened box. Returns {ok, box, contains}. */
  function search(player) {
    const box = nearestBox(player);
    if (!box) return {ok: false};
    box.opened = true;
    return {ok: true, box, contains: box.contains};
  }
  return {models: instances, boxes, nearestBox, search, reset() { for (const box of boxes) box.opened = false; },
    find: contains => boxes.find(box => box.contains === contains && !box.opened) ?? null};
}

/** Solid footprints for chairs and boxes, as closed navigation gates. */
export function dressingBarriers(props = []) {
  const half = {chair: .3, box: .24}, height = {chair: 1.0, box: .36};
  return props.filter(prop => half[prop.type]).map(prop => ({id: 'prop:' + prop.id, initiallyOpen: false,
    barrier: {min: [prop.position[0] - half[prop.type], 0, prop.position[1] - half[prop.type]], max: [prop.position[0] + half[prop.type], height[prop.type], prop.position[1] + half[prop.type]]}}));
}
