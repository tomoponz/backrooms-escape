// Navigation over the offline, geometry-validated source-world grid.
// Positions are mutable [x,z] pairs; all heights and obstacles are world-space.
const EPS = 1e-8, BIN = 2;
const validPoint = p => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pointSegment2 = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, den = dx * dx + dz * dz;
  const t = den ? clamp(((x - ax) * dx + (z - az) * dz) / den, 0, 1) : 0;
  return (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2;
};
function segmentDistance2(a, b, s) {
  const [ax, az] = a, [bx, bz] = b, [cx, cz, dx, dz] = s;
  const cross = (x, z, y, w) => x * w - z * y;
  const ux = bx - ax, uz = bz - az, vx = dx - cx, vz = dz - cz;
  const den = cross(ux, uz, vx, vz);
  if (Math.abs(den) > EPS) {
    const t = cross(cx - ax, cz - az, vx, vz) / den;
    const u = cross(cx - ax, cz - az, ux, uz) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointSegment2(ax, az, cx, cz, dx, dz), pointSegment2(bx, bz, cx, cz, dx, dz),
    pointSegment2(cx, cz, ax, az, bx, bz), pointSegment2(dx, dz, ax, az, bx, bz));
}
function binsFor(items, bounds) {
  const bins = new Map();
  for (const item of items) {
    const [x0, z0, x1, z1] = bounds(item);
    for (let x = Math.floor(x0 / BIN); x <= Math.floor(x1 / BIN); x++)
      for (let z = Math.floor(z0 / BIN); z <= Math.floor(z1 / BIN); z++) {
        const key = `${x},${z}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(item);
      }
  }
  return bins;
}

export function createSourceWorldNavigation(data, layout = {}) {
  const {step, minx, minz, width, height} = data ?? {};
  const length = width * height;
  if (data?.version !== 1 || !Number.isFinite(step) || step <= 0 ||
      !Number.isFinite(minx) || !Number.isFinite(minz) || !Number.isInteger(width) || width < 2 ||
      !Number.isInteger(height) || height < 2 || !Number.isSafeInteger(length) || length > 340000 ||
      typeof data.free !== 'string' || data.free.length !== length || /[^01]/.test(data.free) ||
      !Array.isArray(data.heights) || data.heights.length !== length ||
      !Array.isArray(data.regions) || data.regions.length !== length ||
      !Array.isArray(data.edges) || data.edges.length !== length ||
      !Array.isArray(data.regionIds) || !data.regionIds.length) throw new TypeError('Invalid source-world navigation grid');
  const clearance = data.clearance ?? .22, maxStep = data.maxStep ?? .24, maxSlope = data.maxSlope ?? .72;
  if (![clearance, maxStep, maxSlope].every(n => Number.isFinite(n) && n >= 0)) throw new TypeError('Invalid navigation clearance/slope');
  const gates = new Map(), gateVolumes = [];
  const validBox = box => Array.isArray(box?.min) && Array.isArray(box?.max) && box.min.length === 3 && box.max.length === 3 &&
    [...box.min, ...box.max].every(Number.isFinite) && box.min.every((v, i) => v <= box.max[i]);
  for (const descriptor of data.gates ?? layout.gates ?? []) {
    const box = descriptor.barrier ?? descriptor.box ?? descriptor;
    if (typeof descriptor.id !== 'string' || !descriptor.id || gates.has(descriptor.id) ||
        !validBox(box))
      throw new TypeError('Invalid source-world gate');
    const gate = {id:descriptor.id, min:[...box.min], max:[...box.max], open:(descriptor.initiallyOpen ?? descriptor.defaultOpen) === true};
    gates.set(descriptor.id, gate); gateVolumes.push(gate);
    for (const frame of descriptor.frameBarriers ?? []) {
      const frameBox = frame.box ?? frame;
      if (!validBox(frameBox)) throw new TypeError('Invalid source-world gate frame');
      // Frames belong to the source architecture and remain solid independently
      // of the operable leaf. Only the gate object is reachable by setGateOpen.
      gateVolumes.push({min:[...frameBox.min], max:[...frameBox.max], open:false});
    }
  }
  const gateBodyOverlap = (gate, lowFloor, highFloor = lowFloor) =>
    gate.max[1] > lowFloor + maxStep + EPS && gate.min[1] < highFloor + 1.78 - EPS;
  const pointBox2 = (x, z, gate) => Math.max(gate.min[0] - x, 0, x - gate.max[0]) ** 2 +
    Math.max(gate.min[2] - z, 0, z - gate.max[2]) ** 2;
  const gateBlocksPoint = (x, z, floor) => {
    for (const gate of gateVolumes) if (!gate.open && gateBodyOverlap(gate, floor) &&
        pointBox2(x, z, gate) <= clearance * clearance + EPS) return true;
    return false;
  };
  // The exact distance predicate below includes EPS, so expand by its full
  // effective radius. Disjoint AABBs cannot touch the swept clearance capsule;
  // equality still reaches the exact test (including edge and corner grazing).
  const gateLineRadius = Math.sqrt(clearance * clearance + EPS);
  const gateBlocksLine = (a, b, lowFloor, highFloor = lowFloor) => {
    const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
    const minZ = Math.min(a[1], b[1]), maxZ = Math.max(a[1], b[1]);
    for (const gate of gateVolumes) {
      if (gate.open || !gateBodyOverlap(gate, lowFloor, highFloor)) continue;
      if (maxX < gate.min[0] - gateLineRadius || minX > gate.max[0] + gateLineRadius ||
          maxZ < gate.min[2] - gateLineRadius || minZ > gate.max[2] + gateLineRadius) continue;
      if (pointBox2(...a, gate) <= clearance * clearance + EPS || pointBox2(...b, gate) <= clearance * clearance + EPS) return true;
      const [x0,,z0] = gate.min, [x1,,z1] = gate.max;
      for (const edge of [[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]])
        if (segmentDistance2(a, b, edge) <= clearance * clearance + EPS) return true;
    }
    return false;
  };
  const free = data.free, heights = Float64Array.from(data.heights, y => Number.isFinite(y) ? y : NaN);
  const regions = Int32Array.from(data.regions), masks = Uint8Array.from(data.edges);
  for (let i = 0; i < length; i++) {
    if (!Number.isInteger(data.edges[i]) || data.edges[i] < 0 || data.edges[i] > 15 ||
        free[i] === '1' && (!Number.isFinite(heights[i]) || !Number.isInteger(data.regions[i]) ||
        regions[i] < 0 || regions[i] >= data.regionIds.length)) throw new TypeError(`Invalid navigation cell ${i}`);
  }
  const walls = (data.segments ?? []).map(s => {
    if (!Array.isArray(s) || s.length < 6 || !s.slice(0, 6).every(Number.isFinite) || s[5] < s[4])
      throw new TypeError('Invalid source-world obstacle');
    return s.slice(0, 6);
  });
  const wallBins = binsFor(walls, s => [Math.min(s[0], s[2]), Math.min(s[1], s[3]), Math.max(s[0], s[2]), Math.max(s[1], s[3])]);
  const triangles = (data.floorTriangles ?? []).map(t => {
    if (!Array.isArray(t) || t.length < 9 || !t.slice(0, 9).every(Number.isFinite)) throw new TypeError('Invalid floor triangle');
    const den = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
    return {t, den};
  }).filter(t => Math.abs(t.den) > EPS);
  const floorBins = binsFor(triangles, ({t}) => [Math.min(t[0], t[3], t[6]), Math.min(t[2], t[5], t[8]), Math.max(t[0], t[3], t[6]), Math.max(t[2], t[5], t[8])]);
  const preciseFloors = Array.isArray(data.floorTriangles), heightfieldRegions = new Set(data.heightfieldRegions ?? []);
  const offsets = [-1, 1, -width, width], opposite = [1, 0, 3, 2];
  const nav = {length, step, minx, minz, width, height, maxx:minx + (width - 1) * step,
    maxz:minz + (height - 1) * step, clearance, maxStep, maxSlope, free,
    walls, segments:walls, regionIds:[...data.regionIds], links:(data.links ?? []).map(l => ({...l,
      ap:[...l.ap], bp:[...l.bp], regions:[...l.regions]})), metadata:data.metadata ?? {}};
  nav.point = i => Number.isInteger(i) && i >= 0 && i < length
    ? [minx + (i % width) * step, minz + Math.floor(i / width) * step] : [NaN, NaN];
  nav.index = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return -1;
    const c = Math.round((x - minx) / step), r = Math.round((z - minz) / step);
    return c >= 0 && c < width && r >= 0 && r < height ? r * width + c : -1;
  };
  // Cell and edge results depend only on static data and the gate states, so
  // they are memoised until a gate changes. Values equal the direct predicates.
  const openCache = new Int8Array(length).fill(-1), edgeCache = new Int32Array(length * 4).fill(-2);
  // A gate only affects cells within its clearance-expanded footprint (plus one
  // ring for the edges that enter it), so only those entries are forgotten.
  const clearTopologyCaches = gate => {
    if (!gate) { openCache.fill(-1); edgeCache.fill(-2); return; }
    const reach = clearance + step * 2;
    const c0 = Math.max(0, Math.floor((gate.min[0] - reach - minx) / step)), c1 = Math.min(width - 1, Math.ceil((gate.max[0] + reach - minx) / step));
    const r0 = Math.max(0, Math.floor((gate.min[2] - reach - minz) / step)), r1 = Math.min(height - 1, Math.ceil((gate.max[2] + reach - minz) / step));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * width + c;
      openCache[i] = -1; edgeCache.fill(-2, i * 4, i * 4 + 4);
    }
  };
  nav.open = i => {
    if (!Number.isInteger(i) || i < 0 || i >= length) return false;
    let known = openCache[i];
    if (known < 0) known = openCache[i] = free[i] === '1' && !gateBlocksPoint(...nav.point(i), heights[i]) ? 1 : 0;
    return known === 1;
  };
  const computeEdge = (i, d) => {
    if (!nav.open(i) || !(masks[i] & (1 << d)) || d === 0 && i % width === 0 || d === 1 && i % width === width - 1) return -1;
    const j = i + offsets[d];
    return nav.open(j) && (masks[j] & (1 << opposite[d])) &&
      !gateBlocksLine(nav.point(i), nav.point(j), Math.min(heights[i], heights[j]), Math.max(heights[i], heights[j])) ? j : -1;
  };
  const edge = (i, d) => {
    if (!Number.isInteger(i) || i < 0 || i >= length) return -1;
    const slot = i * 4 + d;
    let known = edgeCache[slot];
    if (known === -2) known = edgeCache[slot] = computeEdge(i, d);
    return known;
  };
  nav.neighbors = i => [0, 1, 2, 3].map(d => edge(i, d)).filter(j => j >= 0);
  const exactFloor = (x, z) => {
    let highest = -Infinity;
    for (const {t, den} of floorBins.get(`${Math.floor(x / BIN)},${Math.floor(z / BIN)}`) ?? []) {
      const u = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / den;
      const v = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / den;
      if (u >= -EPS && v >= -EPS && u + v <= 1 + EPS) highest = Math.max(highest, u * t[1] + v * t[4] + (1 - u - v) * t[7]);
    }
    return highest > -Infinity ? highest : NaN;
  };
  const gridFloor = (x, z) => {
    const i = nav.index(x, z);
    if (i < 0) return NaN;
    const fx = clamp((x - minx) / step, 0, width - 1), fz = clamp((z - minz) / step, 0, height - 1);
    const c = Math.floor(fx), r = Math.floor(fz), c1 = Math.min(c + 1, width - 1), r1 = Math.min(r + 1, height - 1);
    const ys = [heights[r * width + c], heights[r * width + c1], heights[r1 * width + c], heights[r1 * width + c1]];
    if (ys.every(Number.isFinite) && [[0,1],[0,2],[1,3],[2,3]].every(([a,b]) =>
      Math.abs(ys[a] - ys[b]) <= Math.max(maxStep, maxSlope * step) + EPS)) {
      const tx = fx - c, tz = fz - r;
      return (ys[0] * (1 - tx) + ys[1] * tx) * (1 - tz) + (ys[2] * (1 - tx) + ys[3] * tx) * tz;
    }
    return heights[i];
  };
  const supportFloor = (x, z) => {
    const y = exactFloor(x, z);
    if (Number.isFinite(y)) return y;
    const i = nav.index(x, z);
    return !preciseFloors || heightfieldRegions.has(regions[i]) ? gridFloor(x, z) : NaN;
  };
  nav.floorAt = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return NaN;
    const supported = supportFloor(x, z);
    // Unsupported interior coordinates may be inspected by UI/debug callers,
    // but must not acquire a made-up interpolated surface across a hole.
    return Number.isFinite(supported) ? supported : heights[nav.index(x, z)] ?? NaN;
  };
  const nearbyWalls = (x0, z0, x1, z1) => {
    const result = new Set();
    for (let x = Math.floor(x0 / BIN); x <= Math.floor(x1 / BIN); x++)
      for (let z = Math.floor(z0 / BIN); z <= Math.floor(z1 / BIN); z++)
        for (const s of wallBins.get(`${x},${z}`) ?? []) result.add(s);
    return result;
  };
  const overlapsBody = (s, lowFloor, highFloor = lowFloor) => s[5] > lowFloor + maxStep + EPS && s[4] < highFloor + 1.78 - EPS;
  nav.canWalk = (x, z) => {
    if (!nav.open(nav.index(x, z))) return false;
    const y = supportFloor(x, z);
    if (!Number.isFinite(y)) return false;
    if (gateBlocksPoint(x, z, y)) return false;
    for (const s of nearbyWalls(x - clearance, z - clearance, x + clearance, z + clearance))
      if (overlapsBody(s, y) && pointSegment2(x, z, ...s) < clearance * clearance - EPS) return false;
    return true;
  };
  // Traverse cell boundaries, including both sides of exact grid corners.
  // This prevents an apparently supported endpoint from bypassing a blocked edge.
  function gridLine(a, b) {
    let i = nav.index(...a), end = nav.index(...b);
    if (!nav.open(i) || !nav.open(end)) return false;
    if (i === end) return true;
    const dx = b[0] - a[0], dz = b[1] - a[1], sx = Math.sign(dx), sz = Math.sign(dz);
    const dirX = sx < 0 ? 0 : 1, dirZ = sz < 0 ? 2 : 3;
    const c = i % width, r = Math.floor(i / width);
    let tx = sx ? (minx + (c + sx * .5) * step - a[0]) / dx : Infinity;
    let tz = sz ? (minz + (r + sz * .5) * step - a[1]) / dz : Infinity;
    const addX = sx ? step / Math.abs(dx) : Infinity, addZ = sz ? step / Math.abs(dz) : Infinity;
    for (let count = 0; count <= width + height && i !== end; count++) {
      if (Math.abs(tx - tz) < EPS) {
        const x = edge(i, dirX), z = edge(i, dirZ);
        if (x < 0 || z < 0 || edge(x, dirZ) < 0 || edge(x, dirZ) !== edge(z, dirX)) return false;
        i = edge(x, dirZ); tx += addX; tz += addZ;
      } else if (tx < tz) { i = edge(i, dirX); tx += addX; }
      else { i = edge(i, dirZ); tz += addZ; }
      if (i < 0) return false;
    }
    return i === end;
  }
  nav.visible = (a, b) => {
    if (!validPoint(a) || !validPoint(b) || !nav.canWalk(...a) || !nav.canWalk(...b) || !gridLine(a, b)) return false;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), count = Math.max(1, Math.ceil(d / Math.min(.08, step / 3)));
    let previous = supportFloor(...a), low = previous, high = previous;
    for (let n = 1; n <= count; n++) {
      const t = n / count, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const y = supportFloor(x, z);
      if (!nav.open(nav.index(x, z)) || !Number.isFinite(y) || Math.abs(y - previous) > maxStep + EPS) return false;
      low = Math.min(low, y); high = Math.max(high, y); previous = y;
    }
    if (gateBlocksLine(a, b, low, high)) return false;
    for (const s of nearbyWalls(Math.min(a[0], b[0]) - clearance, Math.min(a[1], b[1]) - clearance,
      Math.max(a[0], b[0]) + clearance, Math.max(a[1], b[1]) + clearance))
      if (overlapsBody(s, low, high) && segmentDistance2(a, b, s) < clearance * clearance - EPS) return false;
    return true;
  };
  nav.move = (position, dx, dz) => {
    if (!validPoint(position) || !Number.isFinite(dx) || !Number.isFinite(dz)) return position;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .05));
    const tryMove = (x, z) => {
      const next = [x, z], before = supportFloor(...position), after = supportFloor(x, z);
      if (nav.canWalk(x, z) && gridLine(position, next) &&
          Math.abs(after - before) <= maxStep + EPS && !gateBlocksLine(position, next, Math.min(before, after), Math.max(before, after))) {position[0] = x; position[1] = z;}
    };
    for (let k = 0; k < n; k++) { if (dx) tryMove(position[0] + dx / n, position[1]); if (dz) tryMove(position[0], position[1] + dz / n); }
    return position;
  };
  nav.nearest = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return -1;
    const initial = nav.index(x, z);
    if (nav.open(initial) && nav.canWalk(...nav.point(initial))) return initial;
    const c = Math.round((x - minx) / step), r = Math.round((z - minz) / step);
    let best = -1, bestDistance = Infinity;
    const consider = i => {
      if (!nav.open(i)) return;
      const p = nav.point(i), d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
      if (d < bestDistance && nav.canWalk(...p)) {best = i; bestDistance = d;}
    };
    for (let radius = 1; radius <= 8; radius++) {
      for (let rz = -radius; rz <= radius; rz++) for (let cx = -radius; cx <= radius; cx++) {
        if (Math.max(Math.abs(cx), Math.abs(rz)) !== radius) continue;
        const xx = c + cx, zz = r + rz;
        if (xx >= 0 && xx < width && zz >= 0 && zz < height) consider(zz * width + xx);
      }
      if (best >= 0 && bestDistance < ((radius - .5) * step) ** 2) return best;
    }
    if (best < 0) for (let i = 0; i < length; i++) consider(i);
    return best;
  };
  nav.nearestSafe = nav.nearest;
  nav.regionAt = (x, z) => {const i = nav.index(x, z); return i >= 0 && regions[i] >= 0 && regions[i] < nav.regionIds.length ? regions[i] : 0;};
  nav.cellSizeAt = () => step;
  nav.forEachOpen = fn => {for (let i = 0; i < length; i++) if (nav.open(i)) fn(...nav.point(i), step, i);};
  let revealCache;
  nav.scanRevealCells = (player, radius = 6, explored) => {
    if (!validPoint(player) || !Number.isFinite(radius) || radius < 0) return [][Symbol.iterator]();
    player = [player[0], player[1]];
    // Cache only the last exact observation point. Occluded unknown cells
    // otherwise repeat expensive traces while the player stands still. Geometry
    // is static except gates, whose topology version invalidates these results.
    if (!revealCache || revealCache.x !== player[0] || revealCache.z !== player[1] ||
      revealCache.radius !== radius || revealCache.topology !== nav.topologyVersion) {
      revealCache = {x:player[0], z:player[1], radius, topology:nav.topologyVersion, visibility:new Map()};
    }
    const cache = revealCache, c0 = Math.max(0, Math.ceil((player[0] - radius - minx) / step)), c1 = Math.min(width - 1, Math.floor((player[0] + radius - minx) / step));
    const r0 = Math.max(0, Math.ceil((player[1] - radius - minz) / step)), r1 = Math.min(height - 1, Math.floor((player[1] + radius - minz) / step));
    return (function* () {
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (cache.topology !== nav.topologyVersion) return;
        const i = r * width + c;
        // Every candidate yields, including known and occluded floor, so the
        // journal can enforce its frame budget without changing visibility.
        if (explored?.has(i)) {yield null; continue;}
        const position = nav.point(i);
        if (!nav.open(i) || Math.hypot(position[0] - player[0], position[1] - player[1]) > radius) {yield null; continue;}
        let visible = cache.visibility.get(i);
        if (visible === undefined) {
          visible = nav.visible(player, position);
          cache.visibility.set(i, visible);
        }
        yield visible ? {i, position, size:step} : null;
      }
    })();
  };
  // Exhaustive compatibility API; the live journal consumes the same oracle
  // through scanRevealCells in small batches instead of one long frame.
  nav.revealCells = (player, radius = 6, explored) => {
    const found = [];
    for (const cell of nav.scanRevealCells(player, radius, explored)) if (cell) found.push(cell);
    return found;
  };
  const pathCache = new Map(), fieldCache = new Map();
  let topologyVersion = 0;
  Object.defineProperty(nav, 'topologyVersion', {enumerable:true, get:() => topologyVersion});
  nav.isGateOpen = id => gates.get(id)?.open ?? false;
  nav.setGateOpen = (id, value) => {
    const gate = gates.get(id);
    if (!gate || typeof value !== 'boolean') return false;
    if (gate.open !== value) {gate.open = value; topologyVersion++; pathCache.clear(); fieldCache.clear(); clearTopologyCaches(gate);}
    return true;
  };
  nav.path = (start, end) => {
    if (!nav.open(start) || !nav.open(end)) return [];
    if (start === end) return [start];
    const key = `${start},${end}`;
    if (pathCache.has(key)) return [...pathCache.get(key)];
    // A flooded field toward this target (kept for guidance) already encodes a
    // shortest route; follow it instead of searching again over long distances.
    if (fieldCache.has(end)) {
      const route = nav.descend(start, end);
      if (route.length && route.at(-1) === end) { if (pathCache.size >= 48) pathCache.delete(pathCache.keys().next().value); pathCache.set(key, route); return [...route]; }
      if (fieldCache.get(end)[start] < 0) return [];
    }
    const costs = new Float64Array(length).fill(Infinity), previous = new Int32Array(length).fill(-1), closed = new Uint8Array(length), heap = [];
    const ec = end % width, er = Math.floor(end / width);
    const heuristic = i => (Math.abs(i % width - ec) + Math.abs(Math.floor(i / width) - er)) * step;
    const push = (i, score) => {
      const item = {i, score}; let at = heap.length; heap.push(item);
      while (at) {const parent = (at - 1) >> 1; if (heap[parent].score <= score) break; heap[at] = heap[parent]; at = parent;}
      heap[at] = item;
    };
    const pop = () => {
      const first = heap[0], last = heap.pop();
      if (heap.length) {let at = 0; while (at * 2 + 1 < heap.length) {let child = at * 2 + 1; if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++; if (heap[child].score >= last.score) break; heap[at] = heap[child]; at = child;} heap[at] = last;}
      return first.i;
    };
    costs[start] = 0; push(start, heuristic(start));
    while (heap.length) {
      const i = pop(); if (closed[i]) continue; closed[i] = 1;
      if (i === end) {const route = [end]; while (route.at(-1) !== start) route.push(previous[route.at(-1)]); route.reverse(); if (pathCache.size >= 48) pathCache.delete(pathCache.keys().next().value); pathCache.set(key, route); return [...route];}
      for (const j of nav.neighbors(i)) {
        const cost = costs[i] + Math.hypot(step, heights[j] - heights[i]);
        if (cost < costs[j]) {costs[j] = cost; previous[j] = i; push(j, cost + heuristic(j));}
      }
    }
    return [];
  };
  // Walking-step counts from every reachable cell to one target, flooded once
  // per target and gate state. Guidance follows this field instead of running
  // a new search whenever the player changes cell. Unreachable cells hold -1.
  nav.distanceField = target => {
    if (!nav.open(target)) return null;
    const cached = fieldCache.get(target);
    if (cached) return cached;
    const steps = new Int32Array(length).fill(-1), queue = new Int32Array(length);
    let head = 0, tail = 0;
    steps[target] = 0; queue[tail++] = target;
    while (head < tail) {
      const i = queue[head++], next = steps[i] + 1;
      for (let d = 0; d < 4; d++) {
        const j = edge(i, d);
        if (j >= 0 && steps[j] < 0) { steps[j] = next; queue[tail++] = j; }
      }
    }
    if (fieldCache.size >= 8) fieldCache.delete(fieldCache.keys().next().value);
    fieldCache.set(target, steps);
    return steps;
  };
  /** Cells from start toward target along the flooded field, at most `limit` cells. */
  nav.descend = (start, target, limit = Infinity) => {
    const steps = nav.distanceField(target);
    if (!steps || !nav.open(start) || steps[start] < 0) return [];
    const route = [start];
    let i = start, previousDirection = -1;
    while (i !== target && route.length < limit) {
      let best = -1, bestDirection = -1;
      // Prefer continuing straight among equally short steps: fewer zig-zags.
      for (let n = 0; n < 4; n++) {
        const d = previousDirection >= 0 ? (previousDirection + n) % 4 : n, j = edge(i, d);
        if (j >= 0 && steps[j] === steps[i] - 1) { best = j; bestDirection = d; break; }
      }
      if (best < 0) break;
      route.push(best); i = best; previousDirection = bestDirection;
    }
    return route;
  };
  nav.pathSteps = (start, target) => { const steps = nav.distanceField(target); return steps && nav.open(start) ? steps[start] : -1; };
  nav.authoredAnchors = Object.fromEntries(Object.entries(data.anchors ?? {}).map(([key, value]) => [key,
    key === 'patrol' ? value.map(p => [...p]) : [...value]]));
  for (const [field, anchor] of [['start','spawn'],['exit','exit'],['enemy','enemy']]) {
    if (!validPoint(data.anchors?.[anchor])) throw new TypeError(`Missing navigation anchor ${anchor}`);
    nav[field] = nav.nearest(...data.anchors[anchor]);
    if (nav[field] < 0) throw new Error(`No supported floor for navigation anchor ${anchor}`);
  }
  if (data.anchors.maintenance !== undefined) {
    if (!validPoint(data.anchors.maintenance)) throw new TypeError('Invalid navigation maintenance anchor');
    nav.maintenance = nav.nearest(...data.anchors.maintenance);
    if (nav.maintenance < 0) throw new Error('No supported floor for navigation anchor maintenance');
  }
  if (data.anchors.escape !== undefined) {
    if (!validPoint(data.anchors.escape)) throw new TypeError('Invalid navigation escape anchor');
    nav.escape = nav.nearest(...data.anchors.escape);
    if (nav.escape < 0) throw new Error('No supported floor for navigation anchor escape');
  }
  nav.patrol = (data.anchors.patrol ?? []).map(p => validPoint(p) ? nav.nearest(...p) : -1).filter(i => i >= 0);
  if (data.exitDoorPosition) nav.exitDoorPosition = [...data.exitDoorPosition];
  nav.exitYaw = Number.isFinite(data.exitYaw) ? data.exitYaw : 0;
  return nav;
}
