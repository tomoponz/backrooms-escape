// Off-screen presentation for the scene renderer: multisampled colour/depth,
// blended in-world overlays (guidance marks, glows) and one full-screen finishing
// pass. It draws no room geometry itself and owns only the handles it creates.
// If any allocation fails the caller keeps using Renderer.render() directly.
import {cameraViewProjection} from './engine.js';

const FULLSCREEN_VS = `#version 300 es
precision highp float;
out vec2 vUV;
void main(){vec2 p=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);vUV=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;

const POST_FS = `#version 300 es
precision highp float;
in vec2 vUV;out vec4 outColor;
uniform sampler2D uScene;uniform vec2 uResolution;
uniform float uTime,uGrain,uVignette,uAberration,uFear,uBloom,uFade,uDesaturate,uDistort;
uniform vec3 uFadeColor,uGrade;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
  vec2 c=vUV-.5;float r2=dot(c,c);
  vec2 uv=.5+c*(1.-uDistort*r2);
  float ab=uAberration*(.25+r2*3.);
  vec3 col=vec3(texture(uScene,.5+(uv-.5)*(1.+ab)).r,texture(uScene,uv).g,texture(uScene,.5+(uv-.5)*(1.-ab)).b);
  if(uBloom>0.){
    // Wide glow from the scene's own blurred mip levels: ceiling panels and the
    // torch spot bleed slightly into the air around them.
    vec3 glow=textureLod(uScene,uv,2.5).rgb*.4+textureLod(uScene,uv,4.).rgb*.35+textureLod(uScene,uv,5.5).rgb*.25;
    glow=max(glow-.46,0.)*1.9;col+=glow*glow*uBloom;
  }
  float luma=dot(col,vec3(.299,.587,.114));
  col=mix(col,vec3(luma),uDesaturate)*uGrade;
  col=mix(col,col*col*(3.-2.*col),.16);
  float edge=sqrt(r2)*1.22;
  col*=mix(1.,smoothstep(1.02,.28,edge),uVignette);
  col=mix(col,col*vec3(1.,.42,.38)+vec3(.09,0.,0.)*r2*3.,uFear*smoothstep(.04,.46,r2));
  float n=hash(vUV*uResolution+fract(uTime*.37)*vec2(91.7,53.3))-.5;
  col+=n*uGrain*(1.15-luma);
  outColor=vec4(mix(col,uFadeColor,uFade),1.);
}`;

const OVERLAY_VS = `#version 300 es
precision highp float;
uniform mat4 uVP;uniform vec3 uCenter,uAxisU,uAxisV;out vec2 vUV;
void main(){vec2 q=vec2(gl_VertexID==1||gl_VertexID==2||gl_VertexID==4?1.:-1.,gl_VertexID==2||gl_VertexID==4||gl_VertexID==5?1.:-1.);
vUV=q;gl_Position=uVP*vec4(uCenter+uAxisU*q.x+uAxisV*q.y,1.);}`;

// Shapes are drawn procedurally: 0 chevron, 1 ring, 2 soft glow, 3 light column,
// 4 diamond outline, 5 dust mote. Output is premultiplied; uAdditive selects glow.
const OVERLAY_FS = `#version 300 es
precision highp float;
in vec2 vUV;out vec4 outColor;
uniform vec4 uColor;uniform float uKind,uAdditive,uPhase;
void main(){
  vec2 p=vUV;float a=0.;
  if(uKind<.5){
    float band=abs(p.y-(.5-abs(p.x)*.95));float side=1.-smoothstep(.74,.9,abs(p.x));
    a=((1.-smoothstep(.2,.3,band))*.6+(1.-smoothstep(.05,.16,band))*.4)*side;
  }else if(uKind<1.5){
    float r=length(p);a=(1.-smoothstep(.03,.09,abs(r-(.35+.5*uPhase))))*(1.-uPhase)+(1.-smoothstep(.0,.16,r))*.5;
  }else if(uKind<2.5){
    float r=length(p);a=pow(max(1.-r,0.),2.2);
  }else if(uKind<3.5){
    float x=1.-abs(p.x);float up=p.y*.5+.5;a=x*x*x*(1.-up)*(1.-up)*.9+pow(max(1.-length(vec2(p.x,(p.y+1.)*2.4)),0.),2.)*.8;
  }else if(uKind<4.5){
    float d=abs(p.x)+abs(p.y);a=(1.-smoothstep(.04,.1,abs(d-.78)))+(1.-smoothstep(.12,.2,d))*.9;
  }else{
    float r=length(p);a=pow(max(1.-r,0.),3.);
  }
  a*=uColor.a;if(a<.003)discard;
  outColor=vec4(uColor.rgb*a,a*(1.-uAdditive));
}`;

function compileProgram(g, vertexSource, fragmentSource) {
  const build = (type, source) => {
    const shader = g.createShader(type);
    g.shaderSource(shader, source); g.compileShader(shader);
    if (!g.getShaderParameter(shader, g.COMPILE_STATUS)) {
      const log = g.getShaderInfoLog(shader); g.deleteShader(shader);
      throw new Error(log || 'Pipeline shader compilation failed.');
    }
    return shader;
  };
  const vertex = build(g.VERTEX_SHADER, vertexSource), fragment = build(g.FRAGMENT_SHADER, fragmentSource);
  const program = g.createProgram();
  g.attachShader(program, vertex); g.attachShader(program, fragment); g.linkProgram(program);
  g.deleteShader(vertex); g.deleteShader(fragment);
  if (!g.getProgramParameter(program, g.LINK_STATUS)) {
    const log = g.getProgramInfoLog(program); g.deleteProgram(program);
    throw new Error(log || 'Pipeline shader linking failed.');
  }
  return program;
}
const locations = (g, program, names) => Object.fromEntries(names.map(name => [name, g.getUniformLocation(program, 'u' + name)]));

/** Pixel budgets: the scene is drawn at "internal" size and presented at "output" size. */
export const QUALITY_PRESETS = Object.freeze({
  high: Object.freeze({outputPixels: 2560 * 1440, internalPixels: 1920 * 1080, samples: 4, bloom: .55, maxRatio: 2}),
  low: Object.freeze({outputPixels: 1600 * 900, internalPixels: 1152 * 648, samples: 2, bloom: 0, maxRatio: 1.25}),
});

/** Choose canvas (output) and scene (internal) sizes for a CSS box. Pure; unit-tested. */
export function planResolution({cssWidth, cssHeight, dpr = 1, quality = 'high', scale = 1, maxSize = 8192, maxRatio = Infinity}) {
  const base = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS.high;
  const preset = maxRatio < base.maxRatio ? {...base, maxRatio} : base;
  if (!(cssWidth > 0) || !(cssHeight > 0)) return null;
  const area = cssWidth * cssHeight, device = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const limit = Math.min(maxSize / cssWidth, maxSize / cssHeight);
  const outputRatio = Math.min(device, preset.maxRatio, Math.sqrt(preset.outputPixels / area), limit);
  const dynamic = Number.isFinite(scale) ? Math.max(.5, Math.min(1, scale)) : 1;
  // Quantise so a small change in the adaptive scale does not reallocate buffers.
  const internalRatio = Math.max(.35, Math.floor(Math.min(outputRatio, Math.sqrt(preset.internalPixels / area)) * dynamic * 16 + 1e-6) / 16);
  const size = ratio => [Math.max(1, Math.floor(cssWidth * ratio)), Math.max(1, Math.floor(cssHeight * ratio))];
  const [outputWidth, outputHeight] = size(outputRatio), [width, height] = size(Math.min(internalRatio, limit));
  return {outputWidth, outputHeight, width, height, samples: preset.samples, bloom: preset.bloom};
}

export function createRenderPipeline(renderer) {
  const g = renderer.gl, canvas = renderer.canvas;
  if (typeof g.createFramebuffer !== 'function' || typeof g.renderbufferStorageMultisample !== 'function') throw new Error('Off-screen rendering is unavailable.');
  const maxSamples = g.getParameter(g.MAX_SAMPLES) || 0;
  const maxSize = Math.min(g.getParameter(g.MAX_RENDERBUFFER_SIZE), g.getParameter(g.MAX_TEXTURE_SIZE), ...g.getParameter(g.MAX_VIEWPORT_DIMS));
  const post = compileProgram(g, FULLSCREEN_VS, POST_FS), overlay = compileProgram(g, OVERLAY_VS, OVERLAY_FS);
  const pu = locations(g, post, ['Scene', 'Resolution', 'Time', 'Grain', 'Vignette', 'Aberration', 'Fear', 'Bloom', 'Fade', 'Desaturate', 'Distort', 'FadeColor', 'Grade']);
  const ou = locations(g, overlay, ['VP', 'Center', 'AxisU', 'AxisV', 'Color', 'Kind', 'Additive', 'Phase']);
  const emptyVAO = g.createVertexArray();
  const sceneFBO = g.createFramebuffer(), resolveFBO = g.createFramebuffer();
  const colorBuffer = g.createRenderbuffer(), depthBuffer = g.createRenderbuffer(), resolveTexture = g.createTexture();
  const target = {framebuffer: sceneFBO, width: 0, height: 0};
  let samples = -1, plan = null, disposed = false, bloom = 0, mipmapped = false;

  function allocate(next) {
    const wanted = Math.min(next.samples, maxSamples);
    if (target.width === next.width && target.height === next.height && samples === wanted && mipmapped === next.bloom > 0) return;
    target.width = next.width; target.height = next.height; samples = wanted; mipmapped = next.bloom > 0;
    g.bindRenderbuffer(g.RENDERBUFFER, colorBuffer);
    g.renderbufferStorageMultisample(g.RENDERBUFFER, samples, g.RGBA8, next.width, next.height);
    g.bindRenderbuffer(g.RENDERBUFFER, depthBuffer);
    g.renderbufferStorageMultisample(g.RENDERBUFFER, samples, g.DEPTH_COMPONENT24, next.width, next.height);
    g.bindRenderbuffer(g.RENDERBUFFER, null);
    g.bindFramebuffer(g.FRAMEBUFFER, sceneFBO);
    g.framebufferRenderbuffer(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.RENDERBUFFER, colorBuffer);
    g.framebufferRenderbuffer(g.FRAMEBUFFER, g.DEPTH_ATTACHMENT, g.RENDERBUFFER, depthBuffer);
    const sceneStatus = g.checkFramebufferStatus(g.FRAMEBUFFER);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, resolveTexture);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, next.width, next.height, 0, g.RGBA, g.UNSIGNED_BYTE, null);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, mipmapped ? g.LINEAR_MIPMAP_LINEAR : g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.bindFramebuffer(g.FRAMEBUFFER, resolveFBO);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, resolveTexture, 0);
    const resolveStatus = g.checkFramebufferStatus(g.FRAMEBUFFER);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    if (sceneStatus !== g.FRAMEBUFFER_COMPLETE || resolveStatus !== g.FRAMEBUFFER_COMPLETE) throw new Error('Off-screen framebuffer is incomplete.');
  }

  /** Size the canvas and the scene target. Returns the target for Renderer.render(). */
  function configure({quality = 'high', scale = 1, maxRatio} = {}) {
    if (disposed) return null;
    const next = planResolution({cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, dpr: globalThis.devicePixelRatio, quality, scale, maxSize, maxRatio});
    if (!next) return null;
    if (canvas.width !== next.outputWidth || canvas.height !== next.outputHeight) { canvas.width = next.outputWidth; canvas.height = next.outputHeight; }
    allocate(next); plan = next; bloom = next.bloom;
    return target;
  }

  /** Blend flat marks into the scene target. items: {kind,center,u,v,color,additive,phase,depth}. */
  function drawOverlays(items, camera) {
    if (disposed || !plan || !items?.length) return 0;
    g.bindFramebuffer(g.FRAMEBUFFER, sceneFBO);
    g.viewport(0, 0, target.width, target.height);
    g.useProgram(overlay);
    g.bindVertexArray(emptyVAO);
    g.uniformMatrix4fv(ou.VP, false, cameraViewProjection(camera, target.width / target.height));
    g.enable(g.BLEND); g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA); g.depthMask(false);
    let drawn = 0, depthOn = true;
    for (const item of items) {
      if (!item || !(item.color?.[3] > 0)) continue;
      const wantDepth = item.depth !== false;
      if (wantDepth !== depthOn) { if (wantDepth) g.enable(g.DEPTH_TEST); else g.disable(g.DEPTH_TEST); depthOn = wantDepth; }
      g.uniform3fv(ou.Center, item.center); g.uniform3fv(ou.AxisU, item.u); g.uniform3fv(ou.AxisV, item.v);
      g.uniform4fv(ou.Color, item.color); g.uniform1f(ou.Kind, item.kind ?? 0);
      g.uniform1f(ou.Additive, item.additive ?? 1); g.uniform1f(ou.Phase, item.phase ?? 0);
      g.drawArrays(g.TRIANGLES, 0, 6); drawn++;
    }
    g.disable(g.BLEND); g.depthMask(true); g.enable(g.DEPTH_TEST);
    g.bindVertexArray(null);
    return drawn;
  }

  /** Resolve the multisampled scene and finish it onto the canvas. */
  function present(options = {}) {
    if (disposed || !plan) return false;
    g.bindFramebuffer(g.READ_FRAMEBUFFER, sceneFBO);
    g.bindFramebuffer(g.DRAW_FRAMEBUFFER, resolveFBO);
    g.blitFramebuffer(0, 0, target.width, target.height, 0, 0, target.width, target.height, g.COLOR_BUFFER_BIT, g.NEAREST);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.viewport(0, 0, canvas.width, canvas.height);
    g.disable(g.DEPTH_TEST);
    g.useProgram(post);
    g.bindVertexArray(emptyVAO);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, resolveTexture);
    if (mipmapped) g.generateMipmap(g.TEXTURE_2D);
    g.uniform1i(pu.Scene, 0);
    g.uniform2f(pu.Resolution, canvas.width, canvas.height);
    g.uniform1f(pu.Time, options.time ?? 0);
    g.uniform1f(pu.Grain, options.grain ?? .035);
    g.uniform1f(pu.Vignette, options.vignette ?? .55);
    g.uniform1f(pu.Aberration, options.aberration ?? .0012);
    g.uniform1f(pu.Fear, options.fear ?? 0);
    g.uniform1f(pu.Bloom, bloom * (options.bloom ?? 1));
    g.uniform1f(pu.Fade, options.fade ?? 0);
    g.uniform1f(pu.Desaturate, options.desaturate ?? 0);
    g.uniform1f(pu.Distort, options.distort ?? 0);
    g.uniform3fv(pu.FadeColor, options.fadeColor ?? [0, 0, 0]);
    g.uniform3fv(pu.Grade, options.grade ?? [1, 1, 1]);
    g.drawArrays(g.TRIANGLES, 0, 3);
    g.bindVertexArray(null);
    g.enable(g.DEPTH_TEST);
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    g.deleteFramebuffer(sceneFBO); g.deleteFramebuffer(resolveFBO);
    g.deleteRenderbuffer(colorBuffer); g.deleteRenderbuffer(depthBuffer);
    g.deleteTexture(resolveTexture); g.deleteVertexArray(emptyVAO);
    g.deleteProgram(post); g.deleteProgram(overlay);
  }

  return {configure, drawOverlays, present, dispose, get target() { return target; },
    get stats() { return plan ? {...plan, samples} : null; }};
}

/** Project a world point with the renderer's last view-projection. Returns CSS pixels or null. */
export function projectToScreen(viewProjection, point, cssWidth, cssHeight) {
  if (!viewProjection || !point) return null;
  const [x, y, z] = point, m = viewProjection;
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (!(cw > .05)) return null;
  const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw, ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw;
  return {x: (nx + 1) * cssWidth / 2, y: (1 - ny) * cssHeight / 2, depth: cw, inside: Math.abs(nx) < 1 && Math.abs(ny) < 1};
}
