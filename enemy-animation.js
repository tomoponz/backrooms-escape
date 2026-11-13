// Procedural skinning for the existing Roman Trace Bacteria mesh.
// No additional model, dependency, or network asset is required.
import { M } from './engine.js';

const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smooth = (lo, hi, x) => { const t = clamp((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const angle = x => Math.atan2(Math.sin(x), Math.cos(x));
const identity = () => new Float32Array(M.identity());

// Joint locations are in the source GLB's transformed, Y-up coordinates.
// The two legs and each entire arm are single meshes; vertex weights below
// supply continuous elbow/knee bends rather than moving rigid mesh pieces.
const JOINTS = [
  ['pelvis', -1, [0, 2.50, .06]],
  ['chest', 0, [0, 2.65, .05]],
  ['neck', 1, [0, 4.79, .01]],
  ['head', 2, [0, 5.15, -.03]],
  ['leftArm', 1, [-.48, 4.85, .12]],
  ['leftElbow', 4, [-1.13, 2.73, .32]],
  ['leftHand', 5, [-1.64, .83, .61]],
  ['rightArm', 1, [.73, 4.85, .03]],
  ['rightElbow', 7, [1.23, 2.73, .02]],
  ['rightHand', 8, [1.56, .83, .23]],
  ['leftHip', 0, [-.20, 2.42, .08]],
  ['leftKnee', 10, [-.78, 1.30, .07]],
  ['rightHip', 0, [.19, 2.42, .08]],
  ['rightKnee', 12, [.43, 1.30, .08]],
  ['leftFinger1', 6, [-1.77, .70, .62]],
  ['leftFinger2', 6, [-1.72, .73, .71]],
  ['leftFinger3', 6, [-1.62, .73, .82]],
  ['rightFinger1', 9, [1.47, .70, .31]],
  ['rightFinger2', 9, [1.62, .73, .29]],
  ['rightFinger3', 9, [1.72, .73, .24]],
  ['headCable', 3, [0, 5.25, -.06]],
];

function multiply(out, a, b) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}

function jointMatrix(out, pivot, rx, ry, rz, tx = 0, ty = 0, tz = 0) {
  // Rz * Ry * Rx around an absolute rest-pose pivot.
  const sx = Math.sin(rx), cx = Math.cos(rx), sy = Math.sin(ry), cy = Math.cos(ry), sz = Math.sin(rz), cz = Math.cos(rz);
  out[0] = cz * cy; out[1] = sz * cy; out[2] = -sy; out[3] = 0;
  out[4] = cz * sy * sx - sz * cx; out[5] = sz * sy * sx + cz * cx; out[6] = cy * sx; out[7] = 0;
  out[8] = cz * sy * cx + sz * sx; out[9] = sz * sy * cx - cz * sx; out[10] = cy * cx; out[11] = 0;
  out[12] = pivot[0] + tx - out[0] * pivot[0] - out[4] * pivot[1] - out[8] * pivot[2];
  out[13] = pivot[1] + ty - out[1] * pivot[0] - out[5] * pivot[1] - out[9] * pivot[2];
  out[14] = pivot[2] + tz - out[2] * pivot[0] - out[6] * pivot[1] - out[10] * pivot[2]; out[15] = 1;
  return out;
}

function vertexWeights(name, x, y) {
  if (name.startsWith('Head_')) return [3, 2, smooth(5.05, 5.40, y)];
  if (name.startsWith('CableHead_')) return [20, 3, .75];
  if (name.startsWith('Neck2_')) return [2, 1, smooth(4.70, 5.02, y)];
  if (name.startsWith('Neck_')) return [3, 2, smooth(5.13, 5.52, y) * .55];
  if (name.startsWith('LeftArm_') || name.startsWith('CableLeftHand_')) {
    if (y < 1.1) return [6, 5, 1 - smooth(.70, 1.15, y)];
    return [4, 5, smooth(2.35, 3.18, y)];
  }
  if (name.startsWith('RightArm_')) {
    if (y < 1.1) return [9, 8, 1 - smooth(.70, 1.15, y)];
    return [7, 8, smooth(2.35, 3.18, y)];
  }
  for (const [part, bone, parent] of [
    ['LeftFinger1_', 14, 6], ['LeftFinger2_', 15, 6], ['LeftFinger3_', 16, 6],
    ['RightFinger1_', 17, 9], ['RightFinger2_', 18, 9], ['RightFinger3_', 19, 9],
  ]) if (name.startsWith(part)) return [bone, parent, 1 - smooth(.45, .82, y)];
  if (name.startsWith('Legs_') || name.startsWith('CableLeftLeg_') || name.startsWith('CableRightLeg')) {
    const left = name.startsWith('CableLeftLeg_') || (name.startsWith('Legs_') && x < -.025);
    const hip = left ? 10 : 12, knee = hip + 1;
    if (y > 2.13) return [0, hip, smooth(2.13, 2.55, y)];
    return [hip, knee, smooth(1.02, 1.66, y)];
  }
  if (name.startsWith('CableShoulder_')) return [4, 1, .65];
  return [1, 0, smooth(2.50, 4.10, y)];
}

/** Read the original model into bind-space positions and two-bone weights.
 * Exported for deterministic, GPU-independent geometry tests. */
export function buildBacteriaRig(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('Bacteria animation requires a GLB v2 model.');
  let json, binaryOffset = -1;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    if (offset + 8 + length > view.byteLength) throw new Error('Truncated Bacteria GLB.');
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(bytes.subarray(offset + 8, offset + 8 + length)));
    if (type === 0x004e4942) binaryOffset = offset + 8;
    offset += 8 + length;
  }
  if (!json || binaryOffset < 0) throw new Error('Bacteria GLB is missing geometry.');
  const parts = [];
  function accessor(index) {
    const a = json.accessors[index], bv = json.bufferViews[a.bufferView];
    if (a.componentType !== 5126 || a.type !== 'VEC3' || a.sparse) throw new Error('Unsupported Bacteria vertex layout.');
    return { count: a.count, offset: binaryOffset + (bv.byteOffset || 0) + (a.byteOffset || 0), stride: bv.byteStride || 12 };
  }
  function visit(index, parent) {
    const node = json.nodes[index], world = M.mul(parent, node.matrix || M.trs(node.translation, node.rotation, node.scale));
    if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh].primitives) {
      const a = accessor(primitive.attributes.POSITION), n = primitive.attributes.NORMAL === undefined ? null : accessor(primitive.attributes.NORMAL);
      const positions = new Float32Array(a.count * 3), normals = new Float32Array(a.count * 3), boneA = new Uint8Array(a.count), boneB = new Uint8Array(a.count), weights = new Float32Array(a.count);
      // The glTF transforms are rotation and non-uniform scale. Columns of
      // R*S divided by squared lengths give the correct inverse transpose.
      const scales = [0, 4, 8].map(k => world[k] ** 2 + world[k + 1] ** 2 + world[k + 2] ** 2 || 1);
      for (let i = 0; i < a.count; i++) {
        const k = i * 3, p = a.offset + i * a.stride, x = view.getFloat32(p, true), y = view.getFloat32(p + 4, true), z = view.getFloat32(p + 8, true);
        for (let c = 0; c < 3; c++) positions[k + c] = world[c] * x + world[c + 4] * y + world[c + 8] * z + world[c + 12];
        const np = n ? n.offset + i * n.stride : 0, nx = n ? view.getFloat32(np, true) : 0, ny = n ? view.getFloat32(np + 4, true) : 1, nz = n ? view.getFloat32(np + 8, true) : 0;
        for (let c = 0; c < 3; c++) normals[k + c] = world[c] / scales[0] * nx + world[c + 4] / scales[1] * ny + world[c + 8] / scales[2] * nz;
        const nl = Math.hypot(normals[k], normals[k + 1], normals[k + 2]) || 1;
        for (let c = 0; c < 3; c++) normals[k + c] /= nl;
        [boneA[i], boneB[i], weights[i]] = vertexWeights(node.name || '', positions[k], positions[k + 1]);
      }
      parts.push({ name: node.name || '', positions, normals, boneA, boneB, weights, posedPositions: positions.slice(), posedNormals: normals.slice() });
    }
    for (const child of node.children || []) visit(child, world);
  }
  for (const root of json.scenes[json.scene || 0].nodes) visit(root, M.identity());
  if (!parts.some(p => p.name.startsWith('LeftArm_')) || !parts.some(p => p.name.startsWith('Legs_'))) throw new Error('This animation rig is specific to the approved Bacteria model.');
  return { parts, vertexCount: parts.reduce((sum, p) => sum + p.boneA.length, 0), joints: JOINTS.map(([name, parent, pivot]) => ({ name, parent, pivot: [...pivot] })) };
}

/** Continuous, frame-rate-independent pose state. update() never changes the
 * actor's world position, rotation, collision radius, or visibility. */
export class BacteriaPose {
  constructor(rig) {
    this.rig = rig;
    this.matrices = JOINTS.map(identity);
    this.local = identity();
    this.reset();
  }
  reset() {
    this.time = 0; this.phase = 0; this.speed = 0; this.urgency = 0; this.attack = 0; this.look = 0; this.turn = 0; this.previousYaw = null; this.grounded = 0;
    this.events = { footstep: false, foot: 0, intensity: 0, lunge: 0, rigged: true };
    for (const m of this.matrices) m.set(M.identity());
    for (const p of this.rig.parts) { p.posedPositions.set(p.positions); p.posedNormals.set(p.normals); }
  }
  update(dt, options = {}) {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    if (!dt) { this.events.footstep = false; return this.events; }
    this.time += dt;
    const mode = options.mode || 'idle';
    const fast = mode === 'chase' || mode === 'lunge' || mode === 'attack';
    const targetSpeed = clamp(Number.isFinite(options.speed) ? options.speed : 0, 0, 9);
    this.speed = damp(this.speed, targetSpeed, targetSpeed > this.speed ? 13 : 18, dt);
    this.urgency = damp(this.urgency, fast ? 1 : mode === 'investigate' || mode === 'search' ? .32 : 0, 6, dt);
    const distance = Number.isFinite(options.distance) ? options.distance : Infinity;
    const strike = mode === 'lunge' || mode === 'attack' ? 1 : fast ? (1 - smooth(.65, 2.2, distance)) * .75 : 0;
    this.attack = damp(this.attack, strike, strike > this.attack ? 11 : 7, dt);
    const yaw = Number.isFinite(options.facingYaw) ? options.facingYaw : 0;
    const targetYaw = Number.isFinite(options.targetYaw) ? options.targetYaw : yaw;
    this.look = damp(this.look, clamp(angle(targetYaw - yaw), -.85, .85), fast ? 12 : 5, dt);
    const turn = this.previousYaw === null ? 0 : clamp(angle(yaw - this.previousYaw) / dt, -3, 3);
    this.turn = damp(this.turn, turn, 9, dt); this.previousYaw = yaw;
    const previousHalf = Math.floor(this.phase / Math.PI);
    this.phase += this.speed / (1.34 + .38 * this.urgency) * TAU * dt;
    const half = Math.floor(this.phase / Math.PI), stride = smooth(.02, .75, this.speed), run = this.urgency, t = this.time, p = this.phase;
    this.events.footstep = half !== previousHalf && stride > .25;
    this.events.foot = half & 1;
    this.events.intensity = stride * (.48 + run * .52);
    this.events.lunge = this.attack;

    const pose = (i, rx = 0, ry = 0, rz = 0, tx = 0, ty = 0, tz = 0) => {
      jointMatrix(this.local, JOINTS[i][2], rx, ry, rz, tx, ty, tz);
      const parent = JOINTS[i][1];
      if (parent < 0) this.matrices[i].set(this.local);
      else multiply(this.matrices[i], this.matrices[parent], this.local);
    };
    const breath = Math.sin(t * 2.65) * .012;
    const gaitRoll = Math.sin(p) * stride;
    pose(0, .015 + run * .035, Math.sin(p) * .025 * stride, gaitRoll * .028, gaitRoll * .025, breath + Math.cos(p * 2) * .028 * stride);
    pose(1, .025 + run * .12 + this.attack * .14 + Math.cos(p * 2) * .025 * stride, -gaitRoll * .065, -this.turn * .026 + Math.sin(t * 1.17) * .012);
    // The head leads the turn while the shoulders lag; short irregular
    // holds followed by a fast release produce a deliberate unnatural scan.
    const twitch = Math.sin(t * 6.3) > .92 ? Math.sin(t * 31) * .024 * (1 - run * .5) : 0;
    pose(2, -.035 - run * .055, this.look * .30, Math.sin(t * 1.63) * .023);
    pose(3, -.025 - run * .10 - this.attack * .17 + breath, this.look * .70 + twitch, -.055 + Math.sin(t * 1.9) * .045 + twitch);
    for (let side = 0; side < 2; side++) {
      const phase = p + side * Math.PI + (side ? .09 : 0), swing = Math.sin(phase), lift = Math.max(0, Math.cos(phase));
      const arm = side ? 7 : 4, sign = side ? -1 : 1;
      pose(arm, swing * (.19 + run * .26) * stride - this.attack * .72 - run * .07, sign * (.035 + this.attack * .10), sign * (-.035 - run * .025) + Math.sin(t * 2.1 + side * 2) * .012);
      pose(arm + 1, -.045 - Math.max(0, -swing) * .23 * stride - this.attack * .22, sign * .015, sign * .028);
      pose(arm + 2, Math.sin(phase + .65) * .11 * stride - this.attack * .17, sign * Math.sin(t * 2.4 + side) * .05, sign * .035);
      const hip = side ? 12 : 10;
      pose(hip, -swing * (.45 + run * .17) * stride, 0, sign * .01 * stride);
      pose(hip + 1, (.055 + lift * (.62 + run * .28)) * stride, 0, 0);
      for (let finger = 0; finger < 3; finger++) pose((side ? 17 : 14) + finger, -.035 - this.attack * (.22 + finger * .07) + Math.sin(t * 3.8 + finger * 1.4 + side * 2) * (.035 + run * .025), 0, sign * .02 * Math.sin(t * 2 + finger));
    }
    pose(20, Math.sin(t * 2.7 - .7) * .035 - run * .035, Math.sin(t * 3.3) * .038, Math.sin(t * 2.1 + .8) * .032);
    this.deform();
    return this.events;
  }
  deform() {
    // CPU linear blend skinning: 15.6k vertices, two weights each, no
    // per-vertex allocations and no re-building indices or texture buffers.
    let footMinimum = Infinity;
    for (const part of this.rig.parts) {
      const src = part.positions, sn = part.normals, out = part.posedPositions, on = part.posedNormals;
      for (let i = 0, k = 0; i < part.boneA.length; i++, k += 3) {
        const a = this.matrices[part.boneA[i]], b = this.matrices[part.boneB[i]], w = part.weights[i], iw = 1 - w;
        const x = src[k], y = src[k + 1], z = src[k + 2], nx = sn[k], ny = sn[k + 1], nz = sn[k + 2];
        for (let c = 0; c < 3; c++) {
          const m0 = a[c] * w + b[c] * iw, m1 = a[c + 4] * w + b[c + 4] * iw, m2 = a[c + 8] * w + b[c + 8] * iw;
          out[k + c] = m0 * x + m1 * y + m2 * z + a[c + 12] * w + b[c + 12] * iw;
          on[k + c] = m0 * nx + m1 * ny + m2 * nz;
        }
        const length = Math.hypot(on[k], on[k + 1], on[k + 2]) || 1;
        on[k] /= length; on[k + 1] /= length; on[k + 2] /= length;
        if (part.name.startsWith('Legs_') && y < .15) footMinimum = Math.min(footMinimum, out[k + 1]);
      }
    }
    // Keep the lowest foot on the floor throughout the gait. The source mesh
    // contains a small negative sole offset; retain it for existing placement.
    const ground = Number.isFinite(footMinimum) ? -.02 - footMinimum : 0;
    this.grounded = ground;
    for (const part of this.rig.parts) for (let k = 1; k < part.posedPositions.length; k += 3) part.posedPositions[k] += ground;
  }
}

const noOpAnimator = () => ({ enabled: false, vertexCount: 0, update: () => ({ footstep: false, foot: 0, intensity: 0, lunge: 0, rigged: false }), reset() {}, dispose() {} });

/** Usage: const animation = await createBacteriaAnimator(renderer, bacteria);
 * animation.update(dt, {speed: actualMetresPerSecond, mode: 'chase', distance,
 *                      facingYaw: enemy.yaw, targetYaw: angleToPlayer});
 * Set bacteria.matrix separately with M.pose(), exactly as before.
 * Camera motion-reduction should not disable this character animation.
 */
export async function createBacteriaAnimator(renderer, model, options = {}) {
  // The game's DOM integration tests intentionally provide a non-GPU renderer.
  if (!renderer?.gl || options.disabled) return noOpAnimator();
  let input = options.glb;
  if (!input) {
    const response = await fetch(options.url || 'assets/models/bacteria.glb');
    if (!response.ok) throw new Error(`Bacteria animation: HTTP ${response.status}`);
    input = await response.arrayBuffer();
  }
  const rig = buildBacteriaRig(input);
  if (rig.parts.length !== model.meshes.length) throw new Error('Bacteria animation mesh order does not match the renderer.');
  const g = renderer.gl, pose = new BacteriaPose(rig), records = [];
  let disposed = false;
  for (let i = 0; i < rig.parts.length; i++) {
    const mesh = model.meshes[i], part = rig.parts[i], buffers = [], previous = [], matrix = mesh.matrix;
    g.bindVertexArray(mesh.vao);
    for (const [location, data] of [[0, part.posedPositions], [1, part.posedNormals]]) {
      previous.push({ location, buffer: g.getVertexAttrib(location, g.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING), size: g.getVertexAttrib(location, g.VERTEX_ATTRIB_ARRAY_SIZE), type: g.getVertexAttrib(location, g.VERTEX_ATTRIB_ARRAY_TYPE), normalized: g.getVertexAttrib(location, g.VERTEX_ATTRIB_ARRAY_NORMALIZED), stride: g.getVertexAttrib(location, g.VERTEX_ATTRIB_ARRAY_STRIDE), offset: g.getVertexAttribOffset(location, g.VERTEX_ATTRIB_ARRAY_POINTER), enabled: g.getVertexAttrib(location, g.VERTEX_ATTRIB_ARRAY_ENABLED) });
      const buffer = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, buffer); g.bufferData(g.ARRAY_BUFFER, data, g.DYNAMIC_DRAW);
      g.enableVertexAttribArray(location); g.vertexAttribPointer(location, 3, g.FLOAT, false, 0, 0);
      buffers.push(buffer);
    }
    mesh.matrix = M.identity();
    records.push({ mesh, part, buffers, previous, matrix });
  }
  g.bindVertexArray(null); g.bindBuffer(g.ARRAY_BUFFER, null);
  function upload() {
    for (const { part, buffers } of records) {
      g.bindBuffer(g.ARRAY_BUFFER, buffers[0]); g.bufferSubData(g.ARRAY_BUFFER, 0, part.posedPositions);
      g.bindBuffer(g.ARRAY_BUFFER, buffers[1]); g.bufferSubData(g.ARRAY_BUFFER, 0, part.posedNormals);
    }
    g.bindBuffer(g.ARRAY_BUFFER, null);
  }
  return {
    enabled: true, vertexCount: rig.vertexCount, rig, pose,
    update(dt, state) { if (disposed) return noOpAnimator().update(); const events = pose.update(dt, state); if (dt > 0) upload(); return events; },
    reset() { if (!disposed) { pose.reset(); upload(); } },
    dispose() {
      if (disposed) return;
      for (const { mesh, buffers, previous, matrix } of records) {
        g.bindVertexArray(mesh.vao);
        for (const a of previous) {
          if (a.buffer) { g.bindBuffer(g.ARRAY_BUFFER, a.buffer); g.vertexAttribPointer(a.location, a.size, a.type, a.normalized, a.stride, a.offset); }
          if (a.enabled) g.enableVertexAttribArray(a.location); else g.disableVertexAttribArray(a.location);
        }
        mesh.matrix = matrix;
        for (const buffer of buffers) g.deleteBuffer(buffer);
      }
      g.bindVertexArray(null); g.bindBuffer(g.ARRAY_BUFFER, null); disposed = true;
    },
  };
}
