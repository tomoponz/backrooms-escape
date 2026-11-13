// Runtime-only opening in the approved locker door. The downloaded GLB is not modified.
import {readGLB} from './renderer-resources.js';

const OPENING = Object.freeze({minX:-.11,maxX:.11,minY:1.50,maxY:1.56});
const COMPONENTS = {5120:['getInt8',1],5121:['getUint8',1],5122:['getInt16',2],5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]};
const WIDTH = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4};

function accessor(j, bytes, index) {
  const a=j.accessors?.[index], view=j.bufferViews?.[a?.bufferView], spec=COMPONENTS[a?.componentType], width=WIDTH[a?.type];
  if(!a || !view || !spec || !width || a.sparse || a.normalized) throw Error('Unsupported locker accessor');
  const raw=bytes(a.bufferView), data=new DataView(raw.buffer,raw.byteOffset,raw.byteLength), stride=view.byteStride||spec[1]*width, offset=a.byteOffset||0;
  if(offset+(a.count-1)*stride+spec[1]*width>raw.byteLength) throw Error('Locker accessor out of range');
  return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>data[spec[0]](offset+i*stride+k*spec[1],true)));
}
function interpolate(a,b,t){return a.map((v,i)=>v+(b[i]-v)*t)}
// Clip a convex polygon to one half-plane. The complete vertex includes position,
// normal, and UV, all of which must be interpolated at newly-created edges.
function half(poly,axis,bound,keepLess){
  if(!poly.length)return [];
  const out=[],inside=v=>keepLess?v[axis]<=bound:v[axis]>=bound;
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length], ia=inside(a), ib=inside(b);
    if(ia)out.push(a);
    if(ia!==ib)out.push(interpolate(a,b,(bound-a[axis])/(b[axis]-a[axis])));
  }
  return out;
}

// Four disjoint half-plane regions cover the original triangle minus the slit.
function outsideSlit(poly,box){
  const left=half(poly,0,box.minX,true), right=half(poly,0,box.maxX,false);
  let middle=half(poly,0,box.minX,false); middle=half(middle,0,box.maxX,true);
  return [left,right,half(middle,1,box.minY,true),half(middle,1,box.maxY,false)];
}

export function buildLockerSlitGeometry(buffer,box=OPENING){
  const {json:j,bytes}=readGLB(buffer), roots=j.scenes?.[j.scene||0]?.nodes;
  if(!Array.isArray(roots)||!(box.minX<box.maxX&&box.minY<box.maxY))throw Error('Invalid locker scene or opening');
  let meshIndex=-1,slot=0,primitive;
  function visit(i){
    const node=j.nodes?.[i];if(!node)throw Error('Invalid locker scene node');
    if(node.mesh!==undefined){const mesh=j.meshes?.[node.mesh];if(!mesh)throw Error('Missing locker mesh');
      for(const p of mesh.primitives){if(mesh.name==='locker_door_locker_0'){if(meshIndex>=0)throw Error('Ambiguous locker door');meshIndex=slot;primitive=p}slot++}}
    for(const c of node.children||[])visit(c);
  }
  for(const i of roots)visit(i);
  if(meshIndex<0||primitive.mode!==4||primitive.indices===undefined)throw Error('Missing supported locker door');
  const attrs=primitive.attributes, p=accessor(j,bytes,attrs.POSITION), n=accessor(j,bytes,attrs.NORMAL), uv=accessor(j,bytes,attrs.TEXCOORD_0), indices=accessor(j,bytes,primitive.indices).map(v=>v[0]);
  if(p.length!==n.length||p.length!==uv.length||indices.length%3)throw Error('Invalid locker geometry');
  const positions=[],normals=[],uvs=[];
  function emit(v){positions.push(...v.slice(0,3));normals.push(...v.slice(3,6));uvs.push(...v.slice(6,8))}
  for(let i=0;i<indices.length;i+=3){
    const tri=indices.slice(i,i+3).map(k=>{if(!p[k]||!n[k]||!uv[k])throw Error('Invalid locker triangle index');return [...p[k],...n[k],...uv[k]]});
    for(const poly of outsideSlit(tri,box))for(let q=1;q+1<poly.length;q++){emit(poly[0]);emit(poly[q]);emit(poly[q+1])}
  }
  return {meshIndex,positions:new Float32Array(positions),normals:new Float32Array(normals),uvs:new Float32Array(uvs),opening:{...box}};
}

// Call after renderer.load(url), with the original GLB ArrayBuffer. Restores
// the original VAO state on dispose; no GPU handles or GLB data are retained.
export function cutLockerSlit(renderer,model,buffer,box=OPENING){
  const geometry=buildLockerSlitGeometry(buffer,box), gl=renderer?.gl, mesh=model?.meshes?.[geometry.meshIndex];
  if(!gl||!mesh?.vao)throw Error('Locker renderer or door mesh unavailable');
  const oldVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING),oldArray=gl.getParameter(gl.ARRAY_BUFFER_BINDING),oldMesh={count:mesh.count,type:mesh.type,offset:mesh.offset,mode:mesh.mode},attrs=[],buffers=[];
  let oldElements,disposed=false;
  gl.bindVertexArray(mesh.vao);
  try {
    oldElements=gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
    for(let location=0;location<4;location++)attrs.push({location,buffer:gl.getVertexAttrib(location,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING),size:gl.getVertexAttrib(location,gl.VERTEX_ATTRIB_ARRAY_SIZE),type:gl.getVertexAttrib(location,gl.VERTEX_ATTRIB_ARRAY_TYPE),normalized:gl.getVertexAttrib(location,gl.VERTEX_ATTRIB_ARRAY_NORMALIZED),stride:gl.getVertexAttrib(location,gl.VERTEX_ATTRIB_ARRAY_STRIDE),offset:gl.getVertexAttribOffset(location,gl.VERTEX_ATTRIB_ARRAY_POINTER),enabled:gl.getVertexAttrib(location,gl.VERTEX_ATTRIB_ARRAY_ENABLED)});
    for(const [location,data,size] of [[0,geometry.positions,3],[1,geometry.normals,3],[2,geometry.uvs,2],[3,geometry.uvs,2]]){
      const b=gl.createBuffer();if(!b)throw Error('Unable to allocate locker slit buffer');buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null);mesh.count=geometry.positions.length/3;mesh.type=null;mesh.offset=0;mesh.mode=gl.TRIANGLES;
  } catch(error){restore();throw error} finally{gl.bindVertexArray(oldVAO);gl.bindBuffer(gl.ARRAY_BUFFER,oldArray)}
  function restore(){
    if(disposed)return;
    const previousVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING),previousArray=gl.getParameter(gl.ARRAY_BUFFER_BINDING);gl.bindVertexArray(mesh.vao);
    for(const a of attrs){if(a.buffer){gl.bindBuffer(gl.ARRAY_BUFFER,a.buffer);gl.vertexAttribPointer(a.location,a.size,a.type,a.normalized,a.stride,a.offset)}if(a.enabled)gl.enableVertexAttribArray(a.location);else gl.disableVertexAttribArray(a.location)}
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,oldElements);Object.assign(mesh,oldMesh);gl.bindVertexArray(previousVAO);gl.bindBuffer(gl.ARRAY_BUFFER,previousArray);for(const b of buffers)gl.deleteBuffer(b);disposed=true;
  }
  return {opening:geometry.opening,vertexCount:mesh.count,dispose:restore};
}
