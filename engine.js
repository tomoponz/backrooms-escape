import {GLResources, readGLB, baseColorForMaterial} from "./renderer-resources.js";
import {loadModelBuffer} from './model-source.js';
// Small local WebGL2 renderer. No CDN, tracking, or runtime dependencies.
export const V={add:(a,b)=>a.map((v,i)=>v+b[i]),sub:(a,b)=>a.map((v,i)=>v-b[i]),len:a=>Math.hypot(...a),norm:a=>{let l=Math.hypot(...a)||1;return a.map(v=>v/l)},cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot:(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0)};
export const M={
 identity:()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
 mul:(a,b)=>{let o=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o},
 trs:(t=[0,0,0],q=[0,0,0,1],s=[1,1,1])=>{let[x,y,z,w]=q;return [(1-2*(y*y+z*z))*s[0],2*(x*y+z*w)*s[0],2*(x*z-y*w)*s[0],0,2*(x*y-z*w)*s[1],(1-2*(x*x+z*z))*s[1],2*(y*z+x*w)*s[1],0,2*(x*z+y*w)*s[2],2*(y*z-x*w)*s[2],(1-2*(x*x+y*y))*s[2],0,...t,1]},
 pose:(x,y,z,yaw=0,scale=1)=>M.trs([x,y,z],[0,Math.sin(yaw/2),0,Math.cos(yaw/2)],[scale,scale,scale]),
 perspective:(f,aspect,near=.05,far=300)=>{let a=1/Math.tan(f/2);return[a/aspect,0,0,0,0,a,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]},
 view:(eye,target)=>{let z=V.norm(V.sub(eye,target)),x=V.norm(V.cross([0,1,0],z)),y=V.cross(z,x);return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1]}
};
// Conservatively reject whole environment objects whose transformed AABB lies
// beyond the fog distance. Small dynamic objects without bounds stay visible.
const IDENTITY = M.identity();
const ZERO3 = [0, 0, 0], ONE3 = [1, 1, 1], ZERO4 = [0, 0, 0, 0], BLEND_RANGE = [0, 1];
const EMPTY_HOLE = {min: [1, 1, 1], max: [0, 0, 0]};
const DEFAULT_FOG = [.035, .032, .018];
const DEFAULT_UV = [0, 0, 1, 1];
const WORLD_CLIP_MIN = [-1e4, -1e4, -1e4], WORLD_CLIP_MAX = [1e4, 1e4, 1e4];
export const MAX_CLIP_HOLES = 8;
const HOLE_UNIFORMS = Array.from({length: MAX_CLIP_HOLES}, (_, i) => ['HoleMin' + i, 'HoleMax' + i]);

// The output must be distinct from a and b. Rendering reuses one scratch matrix;
// the public M.mul continues returning an independent array for scene builders.
function multiplyInto(out, a, b) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
      + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}

export function inRenderRange(obj, eye, limit) {
  if (!obj?.min || !obj?.max || !Number.isFinite(limit) || limit <= 0) return true;
  const lo = obj.min, hi = obj.max, m = obj.matrix || IDENTITY;
  // Center/extents gives the exact world AABB of an affine-transformed box,
  // including rotation, negative scale and shear, without eight corner arrays.
  const cx = (lo[0] + hi[0]) * .5, cy = (lo[1] + hi[1]) * .5, cz = (lo[2] + hi[2]) * .5;
  const ex = (hi[0] - lo[0]) * .5, ey = (hi[1] - lo[1]) * .5, ez = (hi[2] - lo[2]) * .5;
  if (!Number.isFinite(cx + cy + cz + ex + ey + ez) || ex < 0 || ey < 0 || ez < 0) return true;
  let distanceSquared = 0;
  for (let axis = 0; axis < 3; axis++) {
    const center = m[axis] * cx + m[4 + axis] * cy + m[8 + axis] * cz + m[12 + axis];
    const extent = Math.abs(m[axis]) * ex + Math.abs(m[4 + axis]) * ey + Math.abs(m[8 + axis]) * ez;
    const distance = Math.max(Math.abs(eye[axis] - center) - extent, 0);
    if (!Number.isFinite(distance)) return true;
    distanceSquared += distance * distance;
  }
  return distanceSquared <= limit * limit;
}
// Conservative clip-space test of a transformed AABB. An object is rejected only
// when all eight corners lie outside the same frustum plane.
export function inViewFrustum(obj, vp) {
  if (!obj?.min || !obj?.max || !vp) return true;
  const lo = obj.min, hi = obj.max, m = obj.matrix || IDENTITY;
  let left = 0, right = 0, bottom = 0, top = 0, behind = 0;
  for (let corner = 0; corner < 8; corner++) {
    const lx = corner & 1 ? hi[0] : lo[0], ly = corner & 2 ? hi[1] : lo[1], lz = corner & 4 ? hi[2] : lo[2];
    const x = m[0] * lx + m[4] * ly + m[8] * lz + m[12], y = m[1] * lx + m[5] * ly + m[9] * lz + m[13], z = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
    if (!Number.isFinite(x + y + z)) return true;
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cx < -cw) left++; if (cx > cw) right++; if (cy < -cw) bottom++; if (cy > cw) top++; if (cw < 0) behind++;
  }
  return !(left === 8 || right === 8 || bottom === 8 || top === 8 || behind === 8);
}
const VS=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;layout(location=1) in vec3 aNormal;layout(location=2) in vec2 aUV;layout(location=3) in vec2 aEmissiveUV;
uniform mat4 uModel,uVP;out vec3 vWorld,vNormal;out vec2 vUV,vEmissiveUV;
void main(){vec4 p=uModel*vec4(aPosition,1.);vWorld=p.xyz;vNormal=normalize(mat3(uModel)*aNormal);vUV=aUV;vEmissiveUV=aEmissiveUV;gl_Position=uVP*p;}`;
const FS=`#version 300 es
precision highp float;
in vec3 vWorld,vNormal;in vec2 vUV,vEmissiveUV;out vec4 outColor;
uniform sampler2D uTexture,uBlendTexture,uEmissiveTexture;uniform vec4 uColor;uniform vec3 uEye,uForward,uFog,uEmissive;
uniform vec4 uEmissiveUV;uniform float uEmissiveUVRot,uHasEmissiveTexture;
uniform float uAmbient,uFlash,uFogNear,uFogFar,uUnlit,uCutoff,uRim,uRepairKind,uLight,uDetail,uSelfLit;uniform vec3 uTint,uDarkFill;uniform vec4 uUV;uniform float uUVRot,uClipSide,uClipZSide,uClipMinX,uClipMaxX,uExcludePassage,uExteriorClip;
uniform vec3 uClipOrigin,uWorldClipMin,uWorldClipMax;uniform vec4 uTileRect,uBlendRect;uniform vec2 uBlendRange;
${Array.from({length: MAX_CLIP_HOLES}, (_, i) => `uniform vec3 uHoleMin${i},uHoleMax${i};`).join('\n')}
void main(){if(any(lessThan(vWorld,uWorldClipMin))||any(greaterThan(vWorld,uWorldClipMax)))discard;vec3 local=vWorld-uClipOrigin;if(local.x<uClipMinX||local.x>uClipMaxX)discard;if(uExcludePassage>.5&&abs(local.z+.25)<1.22)discard;
// From outside, keep Original fragments whose sightline passes through the
// actual corridor mouth. This hides exposed backs without cutting away the
// visible room beyond the far end or changing the interior view.
if(uExteriorClip>.5&&uEye.x< -132.1){float den=vWorld.x-uEye.x;if(den<=0.)discard;float t=(-132.1-uEye.x)/den;vec3 aperture=mix(uEye,vWorld,t);if(abs(aperture.z-7.15209016744)>1.23||aperture.y<-.22||aperture.y>2.57)discard;}
// Keep the Original outer wall except where it overlaps the neighbouring Baked room.
if(abs(uClipSide)>.5&&local.x>37.68&&local.z> -5.92&&local.z<6.08)discard;
if(uClipSide>0.5&&local.x>12.65)discard;if(uClipSide<-.5&&local.x<12.65)discard;
if(abs(uClipSide)>.5&&local.x>12.45&&local.x<13.0&&(abs(local.z)<1.2||abs(local.z-25.2)<1.2)&&local.y>.05&&local.y<2.3)discard;
if(uClipZSide>.5&&local.z>12.65)discard;if(uClipZSide<-.5&&local.z<12.65)discard;
if(abs(uClipZSide)>.5&&local.z>12.0&&local.z<13.3&&(abs(local.x-5.1)<1.2||abs(local.x-30.3)<1.2)&&local.y>.05&&local.y<2.3)discard;
${Array.from({length: MAX_CLIP_HOLES}, (_, i) => `if(all(greaterThan(local,uHoleMin${i}))&&all(lessThan(local,uHoleMax${i})))discard;`).join('\n')}
vec2 uv=vUV*uUV.zw;uv=mat2(cos(uUVRot),sin(uUVRot),-sin(uUVRot),cos(uUVRot))*uv+uUV.xy;if(uTileRect.z>0.){vec2 mirrored=1.-abs(mod(uv,2.)-1.);uv=uTileRect.xy+mirrored*uTileRect.zw;}vec4 base=texture(uTexture,uv)*uColor;if(uBlendRect.z>0.){vec2 t=1.-abs(mod(vWorld.xz*.4,2.)-1.);vec4 grass=texture(uBlendTexture,uBlendRect.xy+t*uBlendRect.zw)*uColor;float weight=1.-smoothstep(uBlendRange.x,uBlendRange.y,vWorld.x);base=mix(base,grass,weight);}if(base.a<uCutoff)discard;
// Baked wall atlases are pure black on faces their author never lit (the outer
// side of a room). Where a material supplies a fill colour, such texels show
// that dim colour instead of a black void. Lit texels are unchanged.
if(uDarkFill.r>0.){float lit=max(base.r,max(base.g,base.b));base.rgb=mix(uDarkFill*uColor.rgb,base.rgb,smoothstep(.015,.07,lit));}
// Optional detail layer: the same authored texture, sampled again at a finer
// scale and normalised by its own blurred average. It adds near-field grain to
// surfaces whose single texture is stretched over tens of metres.
if(uDetail>0.){vec2 duv=vWorld.xz*uDetail;float fine=dot(texture(uTexture,duv).rgb,vec3(.3333));float mean=dot(textureLod(uTexture,duv,7.).rgb,vec3(.3333));float mid=dot(texture(uTexture,duv*.23+.37).rgb,vec3(.3333));float midMean=dot(textureLod(uTexture,duv*.23+.37,7.).rgb,vec3(.3333));float near=1.-smoothstep(10.,48.,length(vWorld-uEye));base.rgb*=mix(1.,clamp(fine/max(mean,.02),.45,1.9),.75*near)*mix(1.,clamp(mid/max(midMean,.02),.6,1.6),.6);}
base.rgb*=uTint;
// Local repair for the far-west/southwest doorway. Reuse the two adjoining
// source wall/trim/carpet texels; no new texture or geometry is introduced.
float repair=0.; vec3 repairedSample=base.rgb;
if (uRepairKind>.5 && abs(vWorld.z-12.6)<.70 && abs(vWorld.x+75.6)<1.65 && vWorld.y>-.08 && vWorld.y<2.7) {
  float dark=max(base.r,max(base.g,base.b));
  // Fixed world-position blend prevents a stationary wall from changing as
  // the camera moves through this opening.
  float viewerSide=smoothstep(12.20,13.0,vWorld.z);
  if (uRepairKind<1.5) {
    vec2 northUV=vec2(.25877-.01680*clamp(vWorld.y,0.,2.7),.74452-.01696*(vWorld.x+76.847));
    vec2 southUV=vec2(.22445-.01680*clamp(vWorld.y,0.,2.7),.21025+.01680*(vWorld.x+76.875));
    repairedSample=mix(texture(uTexture,northUV).rgb,texture(uTexture,southUV).rgb,viewerSide);
    repair=1.-smoothstep(.018,.09,dark);
  } else if (uRepairKind<2.5) {
    vec2 trimUV=vec2(.53378+.02528*vWorld.y,.347667+.02525*(vWorld.x+76.9228));
    repairedSample=texture(uTexture,trimUV).rgb;
    repair=1.-smoothstep(.018,.09,dark);
  } else {
    float area=(1.-smoothstep(.35,.70,abs(vWorld.z-12.6)))*(1.-smoothstep(1.28,1.65,abs(vWorld.x+75.6)));
    float across=smoothstep(12.15,13.05,vWorld.z);
    repairedSample=mix(texture(uTexture,vec2(uv.x,.94)).rgb,texture(uTexture,vec2(uv.x,.06)).rgb,across);
    repair=area;
  }
  base.rgb=mix(base.rgb,repairedSample*uColor.rgb,repair);
}
// The authored wall triangles continue for 15mm below the aperture cut.
// Those exposed edges render as bright floor stripes. Let the existing carpet
// remain visible through that narrow strip; never discard outside the opening.
if(uRepairKind>.5&&uRepairKind<1.5&&abs(vWorld.x+75.6)<1.2&&vWorld.z>12.15&&vWorld.z<13.05&&vWorld.y>-.02&&vWorld.y<.025)discard;
vec3 delta=vWorld-uEye;float d=length(delta);vec3 ray=delta/max(d,1e-4);float axis=dot(ray,uForward);
// Torch: a soft-edged hot spot inside a faint spill, attenuated by distance and
// by the angle at which the beam meets the surface.
float cone=smoothstep(.845,.972,axis),spill=smoothstep(.45,.93,axis)*.16,hot=.82+.18*smoothstep(.975,.998,axis);
float facing=.45+.55*abs(dot(normalize(vNormal),ray));
float flash=min(uFlash*(cone*hot+spill)*facing*1.9/(1.+d*d*.032),1.05*uFlash);float lam=.72+.28*abs(dot(normalize(vNormal),normalize(vec3(.4,1.,.3))));
vec3 emission=uEmissive;if(uHasEmissiveTexture>.5){vec2 euv=vEmissiveUV*uEmissiveUV.zw;euv=mat2(cos(uEmissiveUVRot),sin(uEmissiveUVRot),-sin(uEmissiveUVRot),cos(uEmissiveUVRot))*euv+uEmissiveUV.xy;emission*=mix(texture(uEmissiveTexture,euv).rgb,repairedSample,repair);}
float rim=pow(1.-abs(dot(normalize(vNormal),normalize(uEye-vWorld))),2.);vec3 col=base.rgb*(uAmbient*uLight*mix(lam,1.,uUnlit)+flash*vec3(1.,.95,.84))+emission*mix(uLight,1.,uSelfLit)+vec3(uRim*rim*(.4+.6*min(flash,1.)));
// Roll bright values off smoothly instead of clipping them to flat white.
vec3 over=max(col-.62,0.);col=min(col,.62)+.38*tanh(over/.38);
float fog=smoothstep(uFogNear,uFogFar,d);outColor=vec4(mix(col,uFog,fog),base.a);}`;
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', {antialias: false, alpha: false, powerPreference: 'high-performance'});
    if (!this.gl) throw new Error('WebGL 2 を利用できません。Chrome / Edge とグラフィック設定を確認してください。');
    const g = this.gl;
    this._resources = new GLResources(g);
    this._pendingLoads = new Set();
    this._disposed = false;
    this._contextLost = false;
    this._onContextLost = () => { this._contextLost = true; this.drawCalls = 0; };
    this._modelMatrix = new Float32Array(16);
    this._uniformState = Object.create(null);
    this._frame = 0;
    this.bounds = {};
    this.drawCalls = 0;
    try {
      const compile = (type, source) => {
        const shader = this._resources.create('Shader', type);
        g.shaderSource(shader, source);
        g.compileShader(shader);
        if (!g.getShaderParameter(shader, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(shader) || 'WebGL shader compilation failed.');
        return shader;
      };
      this.p = this._resources.create('Program');
      const vertex = compile(g.VERTEX_SHADER, VS), fragment = compile(g.FRAGMENT_SHADER, FS);
      g.attachShader(this.p, vertex);
      g.attachShader(this.p, fragment);
      g.linkProgram(this.p);
      if (!g.getProgramParameter(this.p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(this.p) || 'WebGL shader linking failed.');
      g.detachShader(this.p, vertex);
      g.detachShader(this.p, fragment);
      this._resources.release('Shader', vertex);
      this._resources.release('Shader', fragment);
      this.u = {};
      const names = ['Model', 'VP', 'Texture', 'BlendTexture', 'Color', 'Eye', 'Forward', 'Fog', 'Emissive', 'Ambient', 'Flash', 'FogNear', 'FogFar', 'Unlit', 'Cutoff', 'Rim', 'RepairKind', 'Light', 'Detail', 'Tint', 'SelfLit', 'DarkFill', 'UV', 'UVRot', 'TileRect', 'BlendRect', 'BlendRange', 'ClipSide', 'ClipZSide', 'ClipMinX', 'ClipMaxX', 'ExcludePassage', 'ExteriorClip', 'ClipOrigin', 'WorldClipMin', 'WorldClipMax', 'EmissiveTexture', 'HasEmissiveTexture', 'EmissiveUV', 'EmissiveUVRot',
        ...HOLE_UNIFORMS.flat()];
      for (const name of names) {
        this.u[name] = g.getUniformLocation(this.p, 'u' + name);
        this._uniformState[name] = {frame: -1, value: 0, vector: [0, 0, 0, 0]};
      }
      const maxBuffer = g.getParameter(g.MAX_RENDERBUFFER_SIZE), maxViewport = g.getParameter(g.MAX_VIEWPORT_DIMS);
      this._maxWidth = Math.min(maxBuffer, maxViewport[0]);
      this._maxHeight = Math.min(maxBuffer, maxViewport[1]);
      this.white = this._resources.create('Texture');
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, this.white);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 1, 1, 0, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.enable(g.DEPTH_TEST);
      g.disable(g.CULL_FACE);
      // Sharper wallpaper and carpet at grazing angles where supported.
      const anisotropic = g.getExtension?.('EXT_texture_filter_anisotropic') ?? null;
      this._anisotropy = anisotropic ? {parameter: anisotropic.TEXTURE_MAX_ANISOTROPY_EXT,
        level: Math.min(8, g.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1)} : null;
      canvas.addEventListener('webglcontextlost', this._onContextLost);
    } catch (error) {
      this._resources.dispose();
      throw error;
    }
  }

  _available() {
    // Restoration invalidates all old handles. The game's existing recovery
    // screen requests a reload, so keep loss latched until a new Renderer exists.
    if (this.gl.isContextLost()) this._contextLost = true;
    return !this._disposed && !this._contextLost;
  }

  _assertActive() {
    if (!this._available()) throw new Error('Renderer is disposed or its WebGL context was lost.');
  }

  // Only handles created by this renderer are owned here. Callers using gl
  // directly (such as the animator) retain responsibility for their resources.
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    for (const pending of this._pendingLoads) pending.dispose();
    this._resources.dispose();
    this.drawCalls = 0;
  }

  async load(url) {
    this._assertActive();
    const resources = new GLResources(this.gl);
    this._pendingLoads.add(resources);
    const g = this.gl;
    try {
      const data = await loadModelBuffer(url);
      this._assertActive();
      const {json: j, bytes} = readGLB(data), textures = [];
      for (const image of j.images || []) {
        if (image.uri) throw new Error('External image references are not supported');
        const bitmap = await createImageBitmap(new Blob([bytes(image.bufferView)], {type: image.mimeType}), {premultiplyAlpha: 'none', colorSpaceConversion: 'none'});
        try {
          this._assertActive();
          const texture = resources.create('Texture');
          g.activeTexture(g.TEXTURE0);
          g.bindTexture(g.TEXTURE_2D, texture);
          g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, bitmap);
          g.generateMipmap(g.TEXTURE_2D);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
          g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
          if (this._anisotropy?.level > 1) g.texParameterf?.(g.TEXTURE_2D, this._anisotropy.parameter, this._anisotropy.level);
          textures.push(texture);
        } finally {
          bitmap.close();
        }
      }
      const material = (m = {}) => {
        const selected = baseColorForMaterial(j.asset, m), tx = selected.texture, t = tx?.extensions?.KHR_texture_transform || {};
        const emission = m.emissiveTexture, et = emission?.extensions?.KHR_texture_transform || {};
        return {name: m.name || '', color: selected.color, texture: tx ? textures[j.textures[tx.index].source] : this.white,
          emissive: (m.emissiveFactor || [0, 0, 0]).map(v => v * .18), unlit: m.extensions?.KHR_materials_unlit ? 1 : 0,
          emissiveTexture: emission ? textures[j.textures[emission.index].source] : null,
          emissiveUV: [...(et.offset || [0, 0]), ...(et.scale || [1, 1])], emissiveRotation: et.rotation || 0,
          emissiveTexCoord: et.texCoord ?? emission?.texCoord ?? 0,
          cutoff: m.alphaMode === 'MASK' ? (m.alphaCutoff ?? .5) : 0, uv: [...(t.offset || [0, 0]), ...(t.scale || [1, 1])], rotation: t.rotation || 0};
      };
      const materials = (j.materials || []).map(material), defaultMaterial = material();
      const buffers = new Map();
      const getBuffer = (index, target = g.ARRAY_BUFFER) => {
        const key = target + ':' + index;
        if (!buffers.has(key)) {
          const contents = bytes(index), buffer = resources.create('Buffer');
          g.bindBuffer(target, buffer);
          g.bufferData(target, contents, g.STATIC_DRAW);
          buffers.set(key, buffer);
        }
        return buffers.get(key);
      };
      const meshData = (j.meshes || []).map(mesh => mesh.primitives.map(primitive => {
        const mat = primitive.material === undefined ? defaultMaterial : materials[primitive.material];
        const emissiveAttribute = 'TEXCOORD_' + mat.emissiveTexCoord;
        if (mat.emissiveTexture && primitive.attributes[emissiveAttribute] === undefined) {
          throw new Error(`Emissive texture requires missing ${emissiveAttribute}.`);
        }
        const vao = resources.create('VertexArray');
        g.bindVertexArray(vao);
        for (const [key, location, size] of [['POSITION', 0, 3], ['NORMAL', 1, 3], ['TEXCOORD_0', 2, 2], [emissiveAttribute, 3, 2]]) {
          if (primitive.attributes[key] === undefined) {
            g.disableVertexAttribArray(location);
            if (size === 3) g.vertexAttrib3f(location, 0, 1, 0); else g.vertexAttrib2f(location, 0, 0);
            continue;
          }
          const accessor = j.accessors[primitive.attributes[key]], view = j.bufferViews[accessor.bufferView];
          if (accessor.sparse) throw new Error('Sparse GLB accessors are not supported.');
          g.bindBuffer(g.ARRAY_BUFFER, getBuffer(accessor.bufferView));
          g.enableVertexAttribArray(location);
          g.vertexAttribPointer(location, size, accessor.componentType, !!accessor.normalized, view.byteStride || 0, accessor.byteOffset || 0);
        }
        const indices = primitive.indices === undefined ? null : j.accessors[primitive.indices];
        if (indices?.sparse) throw new Error('Sparse GLB indices are not supported.');
        if (indices) g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, getBuffer(indices.bufferView, g.ELEMENT_ARRAY_BUFFER));
        g.bindVertexArray(null);
        return {vao, count: indices?.count ?? j.accessors[primitive.attributes.POSITION].count, type: indices?.componentType,
          offset: indices?.byteOffset || 0, mode: primitive.mode ?? g.TRIANGLES,
          material: mat};
      }));
      const meshes = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      const walk = (index, parent) => {
        const node = j.nodes[index], world = M.mul(parent, node.matrix || M.trs(node.translation, node.rotation, node.scale));
        if (node.mesh !== undefined) for (const [pi, primitive] of meshData[node.mesh].entries()) {
          meshes.push({...primitive, matrix: world});
          const accessor = j.accessors[j.meshes[node.mesh].primitives[pi].attributes.POSITION];
          if (accessor.min && accessor.max) for (let corner = 0; corner < 8; corner++) {
            const vertex = [0, 1, 2].map(c => corner & (1 << c) ? accessor.max[c] : accessor.min[c]);
            for (let axis = 0; axis < 3; axis++) {
              const value = world[axis] * vertex[0] + world[4 + axis] * vertex[1] + world[8 + axis] * vertex[2] + world[12 + axis];
              min[axis] = Math.min(min[axis], value);
              max[axis] = Math.max(max[axis], value);
            }
          }
        }
        for (const child of node.children || []) walk(child, world);
      };
      for (const index of j.scenes[j.scene || 0].nodes) walk(index, IDENTITY);
      const result = {meshes, matrix: M.identity(), visible: true, min, max, asset: j.asset};
      this._resources.adopt(resources);
      this.bounds[url] = {min, max};
      return result;
    } catch (error) {
      resources.dispose();
      throw error;
    } finally {
      g.bindVertexArray(null);
      this._pendingLoads.delete(resources);
    }
  }

  _float(name, value) {
    const state = this._uniformState[name];
    if (state.frame === this._frame && state.value === value) return;
    state.frame = this._frame;
    state.value = value;
    this.gl.uniform1f(this.u[name], value);
  }

  _vector(name, value) {
    const state = this._uniformState[name], previous = state.vector;
    let changed = state.frame !== this._frame;
    for (let i = 0; i < value.length; i++) if (previous[i] !== value[i]) changed = true;
    if (!changed) return;
    state.frame = this._frame;
    for (let i = 0; i < value.length; i++) previous[i] = value[i];
    const g = this.gl, location = this.u[name];
    if (value.length === 2) g.uniform2fv(location, value);
    else if (value.length === 3) g.uniform3fv(location, value);
    else g.uniform4fv(location, value);
  }

  // Upload a 2D canvas (or image) as a mip-mapped texture; update() re-uploads
  // the same handle after the canvas has been redrawn.
  createTexture(source) {
    this._assertActive();
    const g = this.gl, texture = this._resources.create('Texture');
    const upload = image => {
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, texture);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, image);
      g.generateMipmap(g.TEXTURE_2D);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      if (this._anisotropy?.level > 1) g.texParameterf?.(g.TEXTURE_2D, this._anisotropy.parameter, this._anisotropy.level);
    };
    upload(source);
    return {texture, update: image => { if (this._available()) upload(image); }};
  }

  // Small connector surfaces can share approved materials while their GPU
  // allocations participate in the renderer's normal ownership and teardown.
  createGeometry(positions, normals, uvs, material = {}) {
    this._assertActive();
    if (!positions?.length || positions.length % 9 || normals?.length !== positions.length || uvs?.length !== positions.length / 3 * 2) {
      throw new TypeError('Geometry requires matching triangle-list positions, normals and UVs.');
    }
    for (const values of [positions, normals, uvs]) {
      for (const value of values) if (!Number.isFinite(value)) throw new TypeError('Geometry attributes must be finite.');
    }
    const g = this.gl, resources = new GLResources(g), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3;
      min[axis] = Math.min(min[axis], positions[i]); max[axis] = Math.max(max[axis], positions[i]);
    }
    try {
      const vao = resources.create('VertexArray');
      g.bindVertexArray(vao);
      for (const [values, location, size] of [[positions, 0, 3], [normals, 1, 3], [uvs, 2, 2]]) {
        g.bindBuffer(g.ARRAY_BUFFER, resources.create('Buffer'));
        g.bufferData(g.ARRAY_BUFFER, new Float32Array(values), g.STATIC_DRAW);
        g.enableVertexAttribArray(location); g.vertexAttribPointer(location, size, g.FLOAT, false, 0, 0);
        if (location === 2) { g.enableVertexAttribArray(3); g.vertexAttribPointer(3, 2, g.FLOAT, false, 0, 0); }
      }
      const mat = {texture: this.white, color: [1, 1, 1, 1], emissive: [0, 0, 0], unlit: 0, cutoff: 0, uv: [0, 0, 1, 1], rotation: 0, ...material};
      this._resources.adopt(resources);
      return {visible: true, matrix: M.identity(), min, max,
        meshes: [{vao, count: positions.length / 3, mode: g.TRIANGLES, matrix: M.identity(), material: mat}]};
    } catch (error) {
      resources.dispose();
      throw error;
    } finally {
      g.bindVertexArray(null);
    }
  }

 // Bridge the indoor floor to Dreamcore's cross-slope without a step.
 rampFloor(from,to,z,material){
  this._assertActive();
  const g=this.gl,positions=[],normals=[],uvs=[],nx=16,nz=8,width=2.4;
  const vertex=(x,zz)=>{let t=(to-x)/(to-from),y=-.136*(zz-z)*t-.008;
   let n=V.norm([-.136*(zz-z)/(to-from),1,.136*t]);
   positions.push(x,y,zz);normals.push(...n);uvs.push((x-from)*.5,(zz-z)*.5)};
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
   let a=from+(to-from)*i/nx,b=from+(to-from)*(i+1)/nx,c=z-width/2+width*j/nz,d=z-width/2+width*(j+1)/nz;
   for(const [x,zz] of [[a,c],[a,d],[b,c],[b,c],[a,d],[b,d]])vertex(x,zz);
  }
  let vao=this._resources.create('VertexArray');g.bindVertexArray(vao);
  for(const [data,loc,n] of [[positions,0,3],[normals,1,3],[uvs,2,2]]){g.bindBuffer(g.ARRAY_BUFFER,this._resources.create('Buffer'));g.bufferData(g.ARRAY_BUFFER,new Float32Array(data),g.STATIC_DRAW);g.enableVertexAttribArray(loc);g.vertexAttribPointer(loc,n,g.FLOAT,false,0,0)}g.bindVertexArray(null);
  return{visible:true,matrix:M.identity(),meshes:[{vao,count:positions.length/3,mode:g.TRIANGLES,matrix:M.identity(),material:material?{...material,color:[1,1,1,1],emissive:[0,0,0]}:{texture:this.white,color:[.54,.49,.29,1],emissive:[0,0,0],unlit:0,cutoff:0,uv:[0,0,1,1],rotation:0}}]};
 }
 cube(color=[1,1,1,1]){this._assertActive();let g=this.gl,positions=[],normals=[],uvs=[];for(let [normal,a,b,c,d] of [ [[0,0,1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],[[0,0,-1],[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],[[1,0,0],[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],[[-1,0,0],[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],[[0,1,0],[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],[[0,-1,0],[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]]){for(let v of [a,b,c,a,c,d]){positions.push(...v.map(x=>x*.5));normals.push(...normal)}uvs.push(0,0,1,0,1,1,0,0,1,1,0,1)}let vao=this._resources.create('VertexArray');g.bindVertexArray(vao);for(let [data,loc,n] of [[positions,0,3],[normals,1,3],[uvs,2,2]]){g.bindBuffer(g.ARRAY_BUFFER,this._resources.create('Buffer'));g.bufferData(g.ARRAY_BUFFER,new Float32Array(data),g.STATIC_DRAW);g.enableVertexAttribArray(loc);g.vertexAttribPointer(loc,n,g.FLOAT,false,0,0)}g.bindVertexArray(null);return{visible:true,matrix:M.identity(),meshes:[{vao,count:36,mode:g.TRIANGLES,matrix:M.identity(),material:{texture:this.white,color,emissive:[0,0,0],unlit:0,cutoff:0,uv:[0,0,1,1],rotation:0}}]};}

  render(objects, camera, opts = {}) {
    const g = this.gl, u = this.u;
    this.drawCalls = 0;
    if (!this._available()) return false;
    let width, height;
    const target = opts.target;
    if (target) {
      // The render pipeline owns canvas sizing and supplies an off-screen
      // multisampled surface; draw the scene into it at its own resolution.
      width = target.width; height = target.height;
      if (!(width > 0) || !(height > 0)) return false;
      g.bindFramebuffer(g.FRAMEBUFFER, target.framebuffer);
    } else {
      const cssWidth = this.canvas.clientWidth, cssHeight = this.canvas.clientHeight;
      if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || cssWidth <= 0 || cssHeight <= 0) return false;
      const dpr = globalThis.devicePixelRatio, scale = opts.renderScale;
      let ratio = Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, opts.quality === 'low' ? .6 : 1)
        * (Number.isFinite(scale) && scale > 0 ? scale : 1);
      // Limit the scale as a whole so oversized surfaces retain their aspect.
      // Clamping before multiplication also avoids overflow from a huge scale.
      ratio = Math.min(ratio, this._maxWidth / cssWidth, this._maxHeight / cssHeight);
      width = Math.min(this._maxWidth, Math.max(1, Math.floor(cssWidth * ratio)));
      height = Math.min(this._maxHeight, Math.max(1, Math.floor(cssHeight * ratio)));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
    }
    g.viewport(0, 0, width, height);
    const fog = opts.fog || DEFAULT_FOG;
    g.clearColor(fog[0], fog[1], fog[2], 1);
    g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
    g.useProgram(this.p);
    const forward = [Math.sin(camera.yaw) * Math.cos(camera.pitch), Math.sin(camera.pitch), -Math.cos(camera.yaw) * Math.cos(camera.pitch)];
    const vp = M.mul(M.perspective((camera.fov || 72) * Math.PI / 180, width / height), M.view(camera.eye, V.add(camera.eye, forward)));
    this.viewProjection = vp;
    g.uniformMatrix4fv(u.VP, false, vp);
    g.uniform3fv(u.Eye, camera.eye);
    g.uniform3fv(u.Forward, forward);
    g.uniform3fv(u.Fog, fog);
    g.uniform1f(u.Ambient, opts.ambient ?? .6);
    // A boolean keeps the earlier on/off contract; a number dims the torch.
    g.uniform1f(u.Flash, typeof opts.flash === 'number' ? Math.max(0, opts.flash) : opts.flash ? 1 : 0);
    g.uniform1f(u.FogNear, opts.fogNear ?? 9);
    g.uniform1f(u.FogFar, opts.fogFar ?? 36);
    g.uniform1i(u.Texture, 0);
    g.uniform1i(u.BlendTexture, 1);
    g.uniform1i(u.EmissiveTexture, 2);
    // Reset knowledge each frame: loaders and animation may use gl directly
    // between calls. Compare values, not material identity, to allow mutations.
    this._frame++;
    let boundTexture, boundBlendTexture, boundEmissiveTexture, boundVAO;
    for (const object of objects) {
      const atmosphere=object?.atmosphere;
      if (!object?.visible || !inRenderRange(object, camera.eye, atmosphere?.fogFar ?? opts.fogFar ?? 36)) continue;
      if (opts.cull && !object.foreground && !inViewFrustum(object, vp)) continue;
      if (object.foreground) g.clear(g.DEPTH_BUFFER_BIT);
      // Room lighting (flicker, blackout) scales ambient and emissive together.
      this._float('Light', object.light ?? opts.light ?? 1);
      this._vector('Tint', object.tint ?? ONE3);
      // Lighting and fog belong to the visible environment, not only to the
      // camera's current room. An outdoor landscape stays visible through an
      // indoor doorway, and the next ordinary object restores camera defaults.
      this._float('Ambient',atmosphere?.ambient ?? opts.ambient ?? .6);
      this._float('FogNear',atmosphere?.fogNear ?? opts.fogNear ?? 9);
      this._float('FogFar',atmosphere?.fogFar ?? opts.fogFar ?? 36);
      this._vector('Fog',atmosphere?.fog ?? fog);
      this._vector('ClipOrigin', object.clipOrigin ?? ZERO3);
      this._float('ExteriorClip', object.exteriorClip ? 1 : 0);
      this._vector('WorldClipMin', object.worldClipBounds?.min ?? WORLD_CLIP_MIN);
      this._vector('WorldClipMax', object.worldClipBounds?.max ?? WORLD_CLIP_MAX);
      for (let i = 0; i < MAX_CLIP_HOLES; i++) {
        const hole = object.holes?.[i] || EMPTY_HOLE;
        this._vector(HOLE_UNIFORMS[i][0], hole.min);
        this._vector(HOLE_UNIFORMS[i][1], hole.max);
      }
      for (const mesh of object.meshes) {
        const mat = mesh.material;
        this._float('RepairKind', ['original-far-west','original-far-southwest'].includes(object.instanceId) ? ({BR_2:1,GreenSkirting:2,NewCarpet:3}[mat.name] ?? 0) : 0);
        this._float('ClipMinX', mesh.clipMinX ?? object.clipMinX ?? -1e9);
        this._float('ClipMaxX', mesh.clipMaxX ?? object.clipMaxX ?? 1e9);
        this._float('ExcludePassage', mesh.excludePassage ? 1 : 0);
        g.uniformMatrix4fv(u.Model, false, multiplyInto(this._modelMatrix, object.matrix, mesh.matrix));
        this._vector('Color', mat.color);
        this._vector('Emissive', mat.emissive);
        this._float('HasEmissiveTexture', mat.emissiveTexture ? 1 : 0);
        this._vector('EmissiveUV', mat.emissiveUV ?? DEFAULT_UV);
        this._float('EmissiveUVRot', mat.emissiveRotation ?? 0);
        this._float('Unlit', mat.unlit);
        this._float('Cutoff', mat.cutoff);
        this._float('Rim', mat.rim ?? 0);
        this._float('Detail', mat.detail ?? 0);
        this._float('SelfLit', mat.selfLit ?? 0);
        this._vector('DarkFill', mat.darkFill ?? ZERO3);
        this._float('ClipSide', mesh.clipSide ?? 0);
        this._float('ClipZSide', mesh.clipZSide ?? 0);
        this._vector('UV', mat.uv);
        this._float('UVRot', mat.rotation);
        this._vector('TileRect', mat.tileRect ?? ZERO4);
        this._vector('BlendRect', mat.blendRect ?? ZERO4);
        this._vector('BlendRange', mat.blendRange ?? BLEND_RANGE);
        const blend = mat.blendTexture ?? this.white;
        if (boundBlendTexture !== blend) {
          g.activeTexture(g.TEXTURE1);
          g.bindTexture(g.TEXTURE_2D, blend);
          boundBlendTexture = blend;
        }
        if (boundTexture !== mat.texture) {
          g.activeTexture(g.TEXTURE0);
          g.bindTexture(g.TEXTURE_2D, mat.texture);
          boundTexture = mat.texture;
        }
        const emission = mat.emissiveTexture ?? this.white;
        if (boundEmissiveTexture !== emission) {
          g.activeTexture(g.TEXTURE2);
          g.bindTexture(g.TEXTURE_2D, emission);
          boundEmissiveTexture = emission;
        }
        if (boundVAO !== mesh.vao) {
          g.bindVertexArray(mesh.vao);
          boundVAO = mesh.vao;
        }
        if (mesh.type) g.drawElements(mesh.mode, mesh.count, mesh.type, mesh.offset);
        else g.drawArrays(mesh.mode, 0, mesh.count);
        this.drawCalls++;
      }
    }
    // Preserve the renderer's established handoff state for external GL users.
    g.activeTexture(g.TEXTURE0);
    g.bindVertexArray(null);
    return true;
  }
}

/** View-projection used by render(); shared with overlay and HUD projection. */
export function cameraViewProjection(camera, aspect) {
  const forward = [Math.sin(camera.yaw) * Math.cos(camera.pitch), Math.sin(camera.pitch), -Math.cos(camera.yaw) * Math.cos(camera.pitch)];
  return M.mul(M.perspective((camera.fov || 72) * Math.PI / 180, aspect), M.view(camera.eye, V.add(camera.eye, forward)));
}
