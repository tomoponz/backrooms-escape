// An isolated copy of one authored Backrooms VR door leaf and its fittings.
// No source triangles, GLB, room walls, or navigation data are modified.
import {M} from './engine.js';
import {readGLB} from './renderer-resources.js';
import {loadModelBuffer} from './model-source.js';
const SOURCE_URL='https://sketchfab.com/3d-models/backrooms-vr-1a5c397f0a43408fa38b09ea5c041149';
const VR_MATRIX=M.pose(0,.11756357598021501,-27.6);
const SOURCE_HINGE=Object.freeze([-36.516,0,-13.807]);
const SELECT=Object.freeze({min:[-36.80,-.01,-13.82],max:[-36.51,2.18,-12.80]});
const width={SCALAR:1,VEC2:2,VEC3:3},types={5121:['getUint8',1],5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]};
const point=(m,v)=>[0,1,2].map(k=>m[k]*v[0]+m[k+4]*v[1]+m[k+8]*v[2]+m[k+12]);
const direction=(m,v)=>{let a=[0,1,2].map(k=>m[k]*v[0]+m[k+4]*v[1]+m[k+8]*v[2]),l=Math.hypot(...a);if(!(l>0))throw Error('Invalid door normal');return a.map(v=>v/l)};
export function extractWarningDoor(buffer){
  const {json:j,bytes}=readGLB(buffer);if(j.asset?.extras?.source!==SOURCE_URL)throw Error('Unexpected door source');
  function accessor(index){const a=j.accessors?.[index],view=j.bufferViews?.[a?.bufferView],spec=types[a?.componentType],n=width[a?.type];if(!a||!view||!spec||!n||a.sparse||a.normalized)throw Error('Unsupported door accessor');
    const raw=bytes(a.bufferView),data=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),stride=view.byteStride||spec[1]*n,offset=a.byteOffset||0;
    if(offset+(a.count-1)*stride+spec[1]*n>raw.byteLength)throw Error('Door accessor outside buffer');
    return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>data[spec[0]](offset+i*stride+k*spec[1],true)))}
  const positions=[],normals=[],uvs=[],counts={};
  const inside=p=>p.every((v,i)=>v>=SELECT.min[i]&&v<=SELECT.max[i]);
  function walk(i,parent){const n=j.nodes?.[i];if(!n)throw Error('Invalid door hierarchy');const world=M.mul(parent,n.matrix||M.trs(n.translation,n.rotation,n.scale));
    if(n.mesh!==undefined){const mesh=j.meshes[n.mesh];if(['Object_20','Object_22'].includes(mesh.name))for(const primitive of mesh.primitives){
      if(j.materials?.[primitive.material]?.name!=='Exit_Door'||primitive.mode!==4||primitive.indices===undefined)throw Error('Unexpected door primitive');
      const p=accessor(primitive.attributes.POSITION),ns=accessor(primitive.attributes.NORMAL),uv=accessor(primitive.attributes.TEXCOORD_0),idx=accessor(primitive.indices).map(x=>x[0]),matrix=M.mul(VR_MATRIX,world);let selected=0;
      if(idx.length%3||p.length!==ns.length||p.length!==uv.length)throw Error('Invalid door attributes');
      for(let t=0;t<idx.length;t+=3){const ids=idx.slice(t,t+3),triangle=ids.map(i=>{if(!p[i])throw Error('Invalid door index');return point(matrix,p[i])});if(!triangle.every(inside))continue;
        for(let k=0;k<3;k++){const id=ids[k];positions.push(...triangle[k].map((v,a)=>v-SOURCE_HINGE[a]));normals.push(...direction(matrix,ns[id]));uvs.push(...uv[id])}selected++}
      counts[mesh.name]=selected;
    }}for(const child of n.children||[])walk(child,world)}
  for(const root of j.scenes?.[j.scene||0]?.nodes||[])walk(root,M.identity());
  if(counts.Object_20!==444||counts.Object_22!==4515)throw Error('Door leaf does not match the approved model');
  return {positions:new Float32Array(positions),normals:new Float32Array(normals),uvs:new Float32Array(uvs),counts,sourceHinge:[...SOURCE_HINGE]};
}
export function createWarningDoor(renderer,sourceModel,geometry,{hinge=[-1.30,0,-24.31],yaw=Math.PI/4}={}){
  if(!Array.isArray(hinge)||hinge.length!==3||!hinge.every(Number.isFinite)||!Number.isFinite(yaw))throw Error('Invalid door placement');
  const material=sourceModel?.meshes?.find(m=>m.material?.name==='Exit_Door')?.material;if(!material)throw Error('Door material unavailable');
  if(!renderer?.createGeometry||!geometry?.positions?.length)throw Error('Door renderer or geometry unavailable');
  // Renderer owns the copied triangle buffers; original VAOs/materials remain untouched.
  const model=renderer.createGeometry(geometry.positions,geometry.normals,geometry.uvs,material);
  model.matrix=M.pose(hinge[0],hinge[1],hinge[2],yaw);model.id='warning-room-door';
  return model;
}
export async function loadWarningDoor(renderer,sourceModel,{url='assets/models/level0.glb',...placement}={}){
  return createWarningDoor(renderer,sourceModel,extractWarningDoor(await loadModelBuffer(url)),placement);
}
