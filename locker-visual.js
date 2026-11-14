// Rendering adapter for the approved Gonsaku Locker GLB. The source asset is
// unchanged; rigidly weighted meshes use their authored joints and animation.
import {M} from './engine.js';
import {readGLB} from './renderer-resources.js';
import {loadModelBuffer} from './model-source.js';
import {cutLockerSlit} from './locker-slit.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function slerp(a,b,t){
  let dot=a.reduce((s,x,i)=>s+x*b[i],0), end=b;
  if(dot<0){dot=-dot;end=b.map(v=>-v)}
  if(dot>.9995){const q=a.map((v,i)=>v+(end[i]-v)*t),n=Math.hypot(...q);return q.map(v=>v/n)}
  const angle=Math.acos(clamp(dot,-1,1)),den=Math.sin(angle),x=Math.sin((1-t)*angle)/den,y=Math.sin(t*angle)/den;
  return a.map((v,i)=>v*x+end[i]*y);
}
export function readLockerRig(buffer){
  const {json:j,bytes}=readGLB(buffer),nodes=j.nodes||[],skin=j.skins?.[0];
  if(!skin||!nodes.length)throw Error('Locker skeleton missing');
  function accessor(index){const a=j.accessors?.[index],v=j.bufferViews?.[a?.bufferView],width={SCALAR:1,VEC3:3,VEC4:4,MAT4:16}[a?.type],size={5123:2,5125:4,5126:4}[a?.componentType];
    if(!a||!v||!width||!size||a.sparse)throw Error('Unsupported locker accessor');
    const raw=bytes(a.bufferView),view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),stride=v.byteStride||width*size,offset=a.byteOffset||0;
    if(offset+(a.count-1)*stride+width*size>raw.byteLength)throw Error('Invalid locker accessor');
    const read=a.componentType===5126?'getFloat32':a.componentType===5123?'getUint16':'getUint32';
    return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>view[read](offset+i*stride+k*size,true)));
  }
  const order=[],parents=Array(nodes.length).fill(-1),meshNodes=[];
  function walk(i,p){if(!nodes[i]||order.includes(i))throw Error('Invalid locker hierarchy');parents[i]=p;order.push(i);if(nodes[i].mesh!==undefined)meshNodes.push(i);for(const c of nodes[i].children||[])walk(c,i)}
  for(const r of j.scenes?.[j.scene||0]?.nodes||[])walk(r,-1);
  if(meshNodes.length!==2)throw Error('Expected locker body and door');
  const bind=accessor(skin.inverseBindMatrices),parts=meshNodes.map(index=>{
    const node=nodes[index],primitive=j.meshes[node.mesh].primitives[0],ids=accessor(primitive.attributes.JOINTS_0),weights=accessor(primitive.attributes.WEIGHTS_0),joint=ids[0][0];
    if(node.skin!==0||!skin.joints[joint]||!ids.every((row,i)=>row[0]===joint&&Math.abs(weights[i][0]-1)<.001))throw Error('Locker mesh is not rigidly weighted');
    return {node:index,joint:skin.joints[joint],bind:bind[joint],name:j.meshes[node.mesh].name};
  });
  const door=parts.findIndex(p=>/door/i.test(p.name));if(door<0)throw Error('Locker door missing');
  function readClip(name){
    const clip=(j.animations||[]).find(a=>a.name.endsWith(name));
    if(!clip||clip.channels.length!==1)throw Error(`Locker animation ${name} missing`);
    const channel=clip.channels[0],sampler=clip.samplers[channel.sampler];
    if(channel.target.node!==parts[door].joint||channel.target.path!=='rotation'||sampler.interpolation!=='LINEAR')throw Error('Unsupported locker animation');
    const times=accessor(sampler.input).map(v=>v[0]),rotations=accessor(sampler.output),duration=times.at(-1);
    if(times.length<2||times.length!==rotations.length||!Number.isFinite(duration)||duration<=0)throw Error('Invalid locker animation');
    return {times,rotations,duration};
  }
  const opening=readClip('@AtoB'),closing=readClip('@BtoA'),duration=opening.duration;
  if(Math.abs(duration-closing.duration)>1e-5)throw Error('Inconsistent locker animation duration');
  function matrices(fraction,direction='opening'){
    const clip=direction==='closing'?closing:opening, time=(direction==='closing'?1-clamp(fraction,0,1):clamp(fraction,0,1))*duration,{times,rotations}=clip;
    let i=0;while(i<times.length-2&&times[i+1]<time)i++;
    const t=clamp((time-times[i])/(times[i+1]-times[i]),0,1),rotation=slerp(rotations[i],rotations[i+1],t),world=[];
    for(const index of order){const n=nodes[index],local=n.matrix||M.trs(n.translation,index===parts[door].joint?rotation:n.rotation,n.scale);world[index]=M.mul(parents[index]<0?M.identity():world[parents[index]],local)}
    return parts.map(p=>M.mul(world[p.joint],p.bind));
  }
  return {json:j,parts,door,duration,matrices};
}

export async function createLockerVisual(renderer,model,{url='assets/models/locker.glb'}={}){
  if(!renderer?.gl)throw Error('Locker requires WebGL');
  const buffer=await loadModelBuffer(url),rig=readLockerRig(buffer);
  if(model?.meshes?.length!==rig.parts.length)throw Error('Locker renderer mesh mismatch');
  const originals=model.meshes.map(m=>m.matrix),slit=cutLockerSlit(renderer,model,buffer);
  let disposed=false;const instances=new Set();
  function controller(object,root=false){
    let fraction=0,target=0,dead=false,direction='opening';
    const pose=()=>rig.matrices(fraction,direction).forEach((m,i)=>object.meshes[i].matrix=m);
    const api={model:object,duration:rig.duration,rig,get fraction(){return fraction},get target(){return target},
      setOpen(open){if(!dead&&!disposed){target=open?1:0;direction=open?'opening':'closing'}},
      setOpenFraction(value){if(dead||disposed)return;fraction=target=clamp(Number.isFinite(value)?value:0,0,1);direction='opening';pose()},
      update(dt){if(dead||disposed)return fraction;const step=Number.isFinite(dt)?Math.max(0,dt)/rig.duration:0;fraction=target>fraction?Math.min(target,fraction+step):Math.max(target,fraction-step);pose();return fraction},
      dispose(){if(dead)return;dead=true;if(!root){object.visible=false;instances.delete(api)}}};
    pose();return api;
  }
  const main=controller(model,true),disposeMain=main.dispose;
  main.createInstance=({matrix=M.identity()}={})=>{
    if(disposed)throw Error('Locker visual disposed');
    // VAOs and materials are shared; per-instance mesh descriptors hold their
    // own animated matrices, so opening one door never opens another.
    const object={...model,matrix,visible:true,meshes:model.meshes.map(mesh=>({...mesh}))};
    const instance=controller(object);instances.add(instance);return instance;
  };
  main.dispose=()=>{if(disposed)return;for(const instance of [...instances])instance.dispose();disposeMain();slit.dispose();originals.forEach((m,i)=>model.meshes[i].matrix=m);disposed=true};
  return main;
}
