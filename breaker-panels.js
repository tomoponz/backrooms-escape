// Wall-mounted breaker plates. Each is a shallow box whose face is drawn on a
// 2D canvas (label, lamp, lever) and uploaded as a texture, so it is depth
// tested and lit with the room instead of floating over the picture as HTML.
// A second, mostly black canvas carries only the status lamp as self-lit colour
// so the lamp stays readable in a dark room.

const FACE = {width: 256, height: 330};

function drawFace(context, {title, restored, progress}) {
  const {width: w, height: h} = FACE;
  const plate = context.createLinearGradient(0, 0, w, h);
  plate.addColorStop(0, '#cdbf9b'); plate.addColorStop(1, '#a09577');
  context.fillStyle = '#4c483a'; context.fillRect(0, 0, w, h);
  context.fillStyle = plate; context.fillRect(9, 9, w - 18, h - 18);
  context.strokeStyle = '#e2d6b2'; context.lineWidth = 2; context.strokeRect(12, 12, w - 24, h - 24);
  context.fillStyle = '#35372d';
  for (const [x, y] of [[20, 20], [w - 20, 20], [20, h - 20], [w - 20, h - 20]]) { context.beginPath(); context.arc(x, y, 4, 0, Math.PI * 2); context.fill(); }
  context.textAlign = 'center'; context.fillStyle = '#22271e';
  context.font = '600 15px "Yu Gothic UI", Arial, sans-serif'; context.fillText('設備保守', w / 2, 44);
  context.fillRect(38, 53, w - 76, 1);
  context.font = '700 24px "Yu Gothic UI", Arial, sans-serif'; context.fillText(title, w / 2, 84);
  context.font = '600 14px "Yu Gothic UI", Arial, sans-serif'; context.fillText('EXIT 扉回路', w / 2, 106);
  // Status lamp and text.
  context.fillStyle = '#23241d'; context.beginPath(); context.arc(w / 2 - 62, 134, 11, 0, Math.PI * 2); context.fill();
  context.fillStyle = restored ? '#58d887' : '#e04a36'; context.beginPath(); context.arc(w / 2 - 62, 134, 8, 0, Math.PI * 2); context.fill();
  context.textAlign = 'left'; context.fillStyle = restored ? '#17512c' : '#8f2518';
  context.font = '700 17px "Yu Gothic UI", Arial, sans-serif'; context.fillText(restored ? '通電 / ON' : '遮断 / OFF', w / 2 - 42, 140);
  // Lever housing: the lever travels upward while the key is held.
  context.fillStyle = '#26271f'; context.fillRect(w / 2 - 34, 160, 68, 96);
  context.fillStyle = '#12130f'; context.fillRect(w / 2 - 9, 170, 18, 76);
  const travel = restored ? 1 : Math.max(0, Math.min(1, progress));
  const leverY = 226 - travel * 52;
  const lever = context.createLinearGradient(0, leverY, 0, leverY + 24);
  lever.addColorStop(0, restored ? '#a6d8ae' : '#e2dccb'); lever.addColorStop(1, restored ? '#4d7c57' : '#8d8776');
  context.fillStyle = lever; context.fillRect(w / 2 - 24, leverY, 48, 24);
  context.textAlign = 'center'; context.fillStyle = '#22271e';
  context.font = '700 15px "Yu Gothic UI", Arial, sans-serif'; context.fillText('復旧 / RESET', w / 2, 281);
  context.font = '12px "Yu Gothic UI", Arial, sans-serif'; context.fillStyle = '#353d2b';
  context.fillText(restored ? '復旧済み' : 'レバーを上げて保持', w / 2, 302);
}

function drawGlow(context, {restored}) {
  const {width: w, height: h} = FACE;
  context.fillStyle = '#000'; context.fillRect(0, 0, w, h);
  const glow = context.createRadialGradient(w / 2 - 62, 134, 1, w / 2 - 62, 134, 20);
  glow.addColorStop(0, restored ? '#7dffb0' : '#ff5a40'); glow.addColorStop(.45, restored ? '#2c9a58' : '#b0281a'); glow.addColorStop(1, '#000');
  context.fillStyle = glow; context.beginPath(); context.arc(w / 2 - 62, 134, 20, 0, Math.PI * 2); context.fill();
}

/** Box vertices: front face mapped to the whole canvas, sides to its border colour. */
export function breakerBoxGeometry(fixture, depth = .055) {
  const [cx, cy, cz] = fixture.position, [nx, , nz] = fixture.wallNormal;
  const halfWidth = (fixture.width ?? .62) / 2, halfHeight = (fixture.height ?? .8) / 2;
  // Tangent runs to the viewer's right when facing the plate.
  const tx = -nz, tz = nx;
  const corner = (side, up, out) => [cx + tx * halfWidth * side + nx * out, cy + halfHeight * up, cz + tz * halfWidth * side + nz * out];
  const positions = [], normals = [], uvs = [];
  const face = (points, normal, coordinates) => {
    for (const i of [0, 1, 2, 0, 2, 3]) { positions.push(...points[i]); normals.push(...normal); uvs.push(...coordinates[i]); }
  };
  const front = depth - .015;
  // Viewer's left is +tangent when looking against the normal.
  face([corner(1, -1, front), corner(-1, -1, front), corner(-1, 1, front), corner(1, 1, front)], [nx, 0, nz], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  const edge = [[.02, .02], [.02, .02], [.02, .02], [.02, .02]];
  face([corner(1, -1, -.015), corner(1, -1, front), corner(1, 1, front), corner(1, 1, -.015)], [tx, 0, tz], edge);
  face([corner(-1, -1, front), corner(-1, -1, -.015), corner(-1, 1, -.015), corner(-1, 1, front)], [-tx, 0, -tz], edge);
  face([corner(1, 1, front), corner(-1, 1, front), corner(-1, 1, -.015), corner(1, 1, -.015)], [0, 1, 0], edge);
  face([corner(1, -1, -.015), corner(-1, -1, -.015), corner(-1, -1, front), corner(1, -1, front)], [0, -1, 0], edge);
  return {positions, normals, uvs};
}

/**
 * fixtures: [{id, title, position:[x,y,z], wallNormal:[x,0,z], width, height}].
 * Returns render models and set(id, {restored, progress}) which redraws a plate
 * only when its visible state changes.
 */
export function createBreakerPanels(renderer, fixtures, {document = globalThis.document} = {}) {
  const panels = new Map(), models = [];
  for (const fixture of fixtures) {
    const face = document.createElement('canvas'), glow = document.createElement('canvas');
    face.width = glow.width = FACE.width; face.height = glow.height = FACE.height;
    const state = {title: fixture.title ?? '配電盤', restored: false, progress: 0};
    drawFace(face.getContext('2d'), state); drawGlow(glow.getContext('2d'), state);
    const faceTexture = renderer.createTexture(face), glowTexture = renderer.createTexture(glow);
    const geometry = breakerBoxGeometry(fixture);
    const model = renderer.createGeometry(geometry.positions, geometry.normals, geometry.uvs, {
      texture: faceTexture.texture, color: [1, 1, 1, 1], emissive: [1.15, 1.15, 1.15], emissiveTexture: glowTexture.texture, selfLit: 1});
    model.id = 'breaker:' + fixture.id; model.regionId = fixture.instanceId ?? null;
    panels.set(fixture.id, {fixture, face, glow, faceTexture, glowTexture, state, shown: {restored: false, step: 0}});
    models.push(model);
  }
  function set(id, {restored = false, progress = 0} = {}) {
    const panel = panels.get(id);
    if (!panel) return false;
    const step = restored ? 0 : Math.round(Math.max(0, Math.min(1, progress)) * 12);
    if (panel.shown.restored === restored && panel.shown.step === step) return false;
    panel.shown = {restored, step};
    Object.assign(panel.state, {restored, progress: step / 12});
    drawFace(panel.face.getContext('2d'), panel.state); panel.faceTexture.update(panel.face);
    drawGlow(panel.glow.getContext('2d'), panel.state); panel.glowTexture.update(panel.glow);
    return true;
  }
  return {models, set, reset() { for (const id of panels.keys()) set(id, {restored: false, progress: 0}); }, ids: [...panels.keys()]};
}
