// Independent instances of the approved warning-sign meshes. The original
// GLB and renderer-owned buffers/materials stay unchanged and are shared.
import {M} from './engine.js';
import {readGLB} from './renderer-resources.js';

const DEFINITIONS=Object.freeze({
  stop:12, stop_alt:14, yield:8, do_not_enter:3, wrong_way:11,
  no_pedestrians:1, no_bicycles:4, no_parking:9, no_standing:10,
  no_u_turn:7, no_parking_symbol:5, no_trucks:2,
  turn_restriction_a:0, turn_restriction_b:6, one_way:13
});
const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[4+k]*p[1]+m[8+k]*p[2]+m[12+k]);
const shift=(x,y,z)=>M.trs([x,y,z]);
function bounds(matrix,min,max){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<8;i++){const v=min.map((n,k)=>i&(1<<k)?max[k]:n),p=transform(matrix,v);for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k])}}
  return {min:lo,max:hi,center:lo.map((v,k)=>(v+hi[k])/2),size:lo.map((v,k)=>hi[k]-v)};
}
export function createWarningSignCatalog(model,buffer){
  const {json}=readGLB(buffer), source=json.asset?.extras?.source;
  if(source!=='https://sketchfab.com/3d-models/warning-signs-set-2e8ef8f837c445578e3d08bdcd37ee3b')throw Error('Unexpected warning-sign source');
  const primitives=[];
  function walk(i){const node=json.nodes?.[i];if(!node)throw Error('Invalid sign scene');if(node.mesh!==undefined){const mesh=json.meshes?.[node.mesh];for(const p of mesh.primitives)primitives.push({name:mesh.name,primitive:p})}for(const child of node.children||[])walk(child)}
  for(const i of json.scenes?.[json.scene||0]?.nodes||[])walk(i);
  if(primitives.length!==29||model?.meshes?.length!==29)throw Error('Warning-sign model mesh mismatch');
  const defs={};
  for(const [name,index] of Object.entries(DEFINITIONS)){
    const item=primitives[index],mesh=model.meshes[index],accessor=json.accessors?.[item.primitive.attributes.POSITION];
    if(!accessor?.min||!accessor.max||!mesh?.matrix)throw Error('Warning-sign bounds missing');
    const box=bounds(mesh.matrix,accessor.min,accessor.max),height=box.size[1];
    if(!(height>0&&box.size[2]>0))throw Error('Invalid warning-sign geometry');
    // Sketchfab face is +X; -90° about Y maps it to +Z while preserving up.
    const center=box.center,rotation=M.pose(0,0,0,-Math.PI/2),canonical=M.mul(rotation,M.mul(shift(-center[0],-center[1],-center[2]),mesh.matrix));
    defs[name]={index,mesh,canonical,height,sourceName:item.name,dimensions:{width:box.size[2]/height,height:1,thickness:box.size[0]/height}};
  }
  return {
    types:Object.keys(defs),
    describe(name){const d=defs[name];if(!d)throw Error(`Unknown warning sign: ${name}`);return {name,sourceMesh:d.sourceName,index:d.index,dimensions:{...d.dimensions},nativeHeight:d.height}},
    create(name,{position=[0,0,0],yaw=0,height=1}={}){
      const d=defs[name];if(!d)throw Error(`Unknown warning sign: ${name}`);
      if(!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite)||!Number.isFinite(yaw)||!Number.isFinite(height)||height<=0)throw Error('Invalid warning-sign placement');
      // position is the geometric centre of the sign; yaw=0 faces world +Z.
      return {visible:true,matrix:M.pose(position[0],position[1],position[2],yaw,height/d.height),meshes:[{...d.mesh,matrix:[...d.canonical]}]};
    }
  };
}
export async function loadWarningSignCatalog(model,{url='assets/models/warning-signs-set.glb'}={}){
  const response=await fetch(url);if(!response.ok)throw Error(`Warning-sign model HTTP ${response.status}`);
  return createWarningSignCatalog(model,await response.arrayBuffer());
}
