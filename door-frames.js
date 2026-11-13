// Thin casings for the layout's wall apertures. Cutting a doorway through two
// neighbouring approved rooms leaves the hollow wall section visible between
// their inner faces. Each casing lines exactly that measured depth and frames
// the cut wallpaper edge on both sides. No room surface is replaced, nothing is
// added to navigation, and the source GLBs are untouched. Depths come from
// tests/build_door_frames.py (assets/source-world-door-frames.json).

const PAINT = Object.freeze([.42, .385, .235, 1]);
// The exit already carries the authored VR door frame.
const SKIPPED = new Set(['outdoor-threshold']);

function quad(out, a, b, c, d, normal) {
  for (const p of [a, b, c, a, c, d]) { out.positions.push(...p); out.normals.push(...normal); out.uvs.push(0, 0); }
}

/** Pure geometry for one aperture. `along` is the horizontal axis of the opening. */
export function doorFrameTriangles(frame, {proud = .012, trim = .07} = {}) {
  const out = {positions: [], normals: [], uvs: []};
  const depthAxis = frame.axis === 'x' ? 0 : 2, alongAxis = depthAxis === 0 ? 2 : 0;
  const near = frame.reveal[0] - proud, far = frame.reveal[1] + proud;
  const lo = frame.min[alongAxis], hi = frame.max[alongAxis], top = frame.max[1], floor = 0;
  if (!(far > near) || !(hi > lo) || !(top > floor)) return out;
  const point = (depth, along, y) => depthAxis === 0 ? [depth, y, along] : [along, y, depth];
  const alongNormal = sign => alongAxis === 0 ? [sign, 0, 0] : [0, 0, sign];
  const depthNormal = sign => depthAxis === 0 ? [sign, 0, 0] : [0, 0, sign];
  // Lining: two jambs and the underside of the head.
  quad(out, point(near, lo, floor), point(far, lo, floor), point(far, lo, top), point(near, lo, top), alongNormal(1));
  quad(out, point(near, hi, floor), point(far, hi, floor), point(far, hi, top), point(near, hi, top), alongNormal(-1));
  quad(out, point(near, lo, top), point(far, lo, top), point(far, hi, top), point(near, hi, top), [0, -1, 0]);
  // Face trim on both wall faces, covering the cut wallpaper edge.
  for (const [depth, sign] of [[near, -1], [far, 1]]) {
    const n = depthNormal(sign);
    quad(out, point(depth, lo - trim, floor), point(depth, lo, floor), point(depth, lo, top + trim), point(depth, lo - trim, top + trim), n);
    quad(out, point(depth, hi, floor), point(depth, hi + trim, floor), point(depth, hi + trim, top + trim), point(depth, hi, top + trim), n);
    quad(out, point(depth, lo, top), point(depth, hi, top), point(depth, hi, top + trim), point(depth, lo, top + trim), n);
    // Returns of the trim back to the wall so that it is not paper-thin.
    const back = depth - sign * (proud + .004);
    quad(out, point(depth, lo - trim, floor), point(back, lo - trim, floor), point(back, lo - trim, top + trim), point(depth, lo - trim, top + trim), alongNormal(-1));
    quad(out, point(depth, hi + trim, floor), point(back, hi + trim, floor), point(back, hi + trim, top + trim), point(depth, hi + trim, top + trim), alongNormal(1));
    quad(out, point(depth, lo - trim, top + trim), point(back, lo - trim, top + trim), point(back, hi + trim, top + trim), point(depth, hi + trim, top + trim), [0, 1, 0]);
  }
  return out;
}

export async function loadDoorFrames(url = 'assets/source-world-door-frames.json') {
  const response = await fetch(url);
  if (!response.ok) throw Error(`${url}: HTTP ${response.status}`);
  const data = await response.json();
  if (data?.version !== 1 || !Array.isArray(data.frames)) throw Error('Invalid door frame data');
  return data.frames;
}

/** One render model per aperture, lit with the atmosphere of the join's first room. */
export function createDoorFrames(renderer, frames, layout) {
  const models = [];
  for (const frame of frames) {
    if (SKIPPED.has(frame.id)) continue;
    const geometry = doorFrameTriangles(frame);
    if (!geometry.positions.length) continue;
    const model = renderer.createGeometry(geometry.positions, geometry.normals, geometry.uvs, {color: [...PAINT]});
    const join = layout.joins.find(item => item.id === frame.id);
    const owner = layout.instances.find(instance => instance.id === join?.a);
    model.id = 'door-frame:' + frame.id; model.regionId = owner?.id ?? null;
    model.atmosphere = layout.atmospheres?.[owner?.atmosphere];
    models.push(model);
  }
  return models;
}
