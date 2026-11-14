// Only the user-approved bust needs this legacy diffuse material. Other GLBs
// continue through the existing metallic/roughness path without changes.
const APPROVED_BUST_SOURCE = 'https://sketchfab.com/3d-models/sculpture-bust-of-roza-loewenfeld-fc6e731a0131471ba8e45511c7ea9996';
export function baseColorForMaterial(asset, material = {}) {
  const pbr = material.pbrMetallicRoughness || {};
  const legacy = asset?.extras?.source === APPROVED_BUST_SOURCE
    ? material.extensions?.KHR_materials_pbrSpecularGlossiness : undefined;
  return {
    texture: pbr.baseColorTexture || legacy?.diffuseTexture,
    color: pbr.baseColorFactor || legacy?.diffuseFactor || [1, 1, 1, 1],
  };
}

// Only base colour and emission are sampled by this renderer. Other authored
// maps stay in the GLB, without decoding or allocating unused GPU textures.
export function materialImageSources(json) {
  const sources = new Set();
  for (const material of json.materials || []) {
    for (const slot of [baseColorForMaterial(json.asset, material).texture, material.emissiveTexture]) {
      if (slot) sources.add(json.textures[slot.index].source);
    }
  }
  return sources;
}

// Explicit ownership for renderer-created WebGL handles. Scopes let a failed
// model load release its partial work without disturbing already-loaded models.
export class GLResources {
  constructor(gl) {
    this.gl = gl;
    this.handles = new Map();
  }

  create(kind, ...args) {
    const handle = this.gl[`create${kind}`](...args);
    if (!handle) throw new Error(`Unable to create WebGL ${kind}.`);
    if (!this.handles.has(kind)) this.handles.set(kind, new Set());
    this.handles.get(kind).add(handle);
    return handle;
  }

  release(kind, handle) {
    if (this.handles.get(kind)?.delete(handle)) this.gl[`delete${kind}`](handle);
  }

  adopt(scope) {
    for (const [kind, handles] of scope.handles) {
      if (!this.handles.has(kind)) this.handles.set(kind, new Set());
      for (const handle of handles) this.handles.get(kind).add(handle);
    }
    scope.handles.clear();
  }

  dispose() {
    // Release VAOs before their buffers, and programs before attached shaders.
    for (const kind of ['VertexArray', 'Buffer', 'Texture', 'Program', 'Shader']) {
      for (const handle of this.handles.get(kind) || []) this.gl[`delete${kind}`](handle);
    }
    this.handles.clear();
  }
}

// Check the GLB container before allocating GPU memory. Unknown chunks are
// allowed by GLB v2; reading BIN by its tag avoids assuming a fixed offset.
export function readGLB(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error('Expected a GLB v2 model.');
  }
  if (view.getUint32(8, true) !== view.byteLength) throw new Error('Invalid GLB length.');
  let json, binary;
  for (let offset = 12; offset < view.byteLength;) {
    if (offset + 8 > view.byteLength) throw new Error('Truncated GLB chunk header.');
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    const end = offset + 8 + length;
    if (length % 4 || end > view.byteLength) throw new Error('Invalid GLB chunk length.');
    if (offset === 12 && type !== 0x4e4f534a) throw new Error('GLB JSON must be the first chunk.');
    if (type === 0x4e4f534a) {
      if (json) throw new Error('Duplicate GLB JSON chunk.');
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, length)));
    } else if (type === 0x004e4942) {
      if (binary) throw new Error('Duplicate GLB binary chunk.');
      binary = new Uint8Array(buffer, offset + 8, length);
    }
    offset = end;
  }
  if (!json || !binary) throw new Error('GLB is missing JSON or binary data.');
  if ((json.buffers || []).some(b => b.uri)) throw new Error('External GLB buffers are not supported.');
  const bytes = index => {
    const bv = json.bufferViews?.[index], start = bv?.byteOffset ?? 0, length = bv?.byteLength;
    if (!bv || (bv.buffer ?? 0) !== 0 || !Number.isInteger(start) || start < 0 || !Number.isInteger(length) || length < 0 || start + length > binary.byteLength) {
      throw new Error('GLB buffer view is outside its binary data.');
    }
    return new Uint8Array(binary.buffer, binary.byteOffset + start, length);
  };
  return {json, bytes};
}
