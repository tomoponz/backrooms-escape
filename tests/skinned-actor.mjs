import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {buildSkinnedRig,deformSkinnedRig,proceduralActorPose,createSkinnedActor} from '../skinned-actor.js';

const buffer=name=>{const b=readFileSync(new URL('../assets/models/'+name+'.glb',import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
for(const [type,count,joints] of [['hazmat',38907,65],['skinstealer',51204,69]]){
  const raw=buffer(type),rig=buildSkinnedRig(raw);assert.equal(rig.vertexCount,count);assert.equal(rig.skin.joints.length,joints);
  deformSkinnedRig(rig);let max=0;for(let i=0;i<rig.positions.length;i++)max=Math.max(max,Math.abs(rig.positions[i]-rig.posedPositions[i]));assert(max<1e-4,`${type}: bind reproduction error ${max}`);
  let movement=0,normalError=0;const timings=[];
  for(let frame=0;frame<12;frame++){
    const t=performance.now();deformSkinnedRig(rig,proceduralActorPose(type,frame/10,{speed:1.5,mode:'patrol'}));timings.push(performance.now()-t);
    for(let i=0;i<rig.positions.length;i+=3){movement=Math.max(movement,Math.hypot(rig.positions[i]-rig.posedPositions[i],rig.positions[i+1]-rig.posedPositions[i+1],rig.positions[i+2]-rig.posedPositions[i+2]));normalError=Math.max(normalError,Math.abs(Math.hypot(...rig.posedNormals.subarray(i,i+3))-1));}
  }
  assert(movement>.01&&Number.isFinite(movement),`${type}: joints must move actual vertices`);assert(normalError<1e-5,`${type}: normals must remain normalized`);
  const before=rig.posedPositions.slice();deformSkinnedRig(rig,proceduralActorPose(type,0,{speed:0,mode:'collapse',collapse:1}));let collapse=0;for(let i=0;i<before.length;i++)collapse=Math.max(collapse,Math.abs(before[i]-rig.posedPositions[i]));assert(collapse>.05,`${type}: collapse must deform body`);
  if(type==='hazmat'){
    const idle=deformSkinnedRig(rig,proceduralActorPose(type,0,{collapse:0}));
    const bow=deformSkinnedRig(rig,proceduralActorPose(type,0,{collapse:.78}));
    assert(idle.maxY-bow.maxY>.20,'suit head must visibly lower during collapse');
    assert(bow.minY>=-.03&&bow.minY<=.08,'suit feet must remain close to the floor');
    assert(!Object.hasOwn(proceduralActorPose('skinstealer',0,{collapse:1}),'Hips'),'hazmat bone name must not leak into Skinstealer');
  }
  deformSkinnedRig(rig);for(let i=0;i<rig.positions.length;i++)assert(Math.abs(rig.positions[i]-rig.posedPositions[i])<1e-4);
  assert.throws(()=>buildSkinnedRig(raw.slice(0,raw.byteLength-4)));
  console.log(JSON.stringify({type,vertices:count,joints,bindError:max,maxMotion:movement,normalError,collapse,timingsMs:timings.sort((a,b)=>a-b)}));
}
assert.equal((await createSkinnedActor({},null,{url:'unused',type:'hazmat'})).enabled,false);
assert.throws(()=>proceduralActorPose('unknown',0));
const previousFetch=globalThis.fetch,records={created:0,deleted:0,uploads:0,pointers:0};
globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>buffer('hazmat')});
const gl={ARRAY_BUFFER:1,DYNAMIC_DRAW:2,FLOAT:3,VERTEX_ATTRIB_ARRAY_BUFFER_BINDING:4,VERTEX_ATTRIB_ARRAY_SIZE:5,VERTEX_ATTRIB_ARRAY_TYPE:6,VERTEX_ATTRIB_ARRAY_NORMALIZED:7,VERTEX_ATTRIB_ARRAY_STRIDE:8,VERTEX_ATTRIB_ARRAY_POINTER:9,VERTEX_ATTRIB_ARRAY_ENABLED:10,
  bindVertexArray(){},bindBuffer(){},bufferData(){},enableVertexAttribArray(){},disableVertexAttribArray(){},vertexAttribPointer(){records.pointers++},getVertexAttrib(_i,key){return key===4?{existing:true}:key===5?3:key===6?3:key===10?true:0},getVertexAttribOffset(){return 0},createBuffer(){records.created++;return {}},deleteBuffer(){records.deleted++},bufferSubData(){records.uploads++}};
try{
  const model={meshes:[{vao:{},matrix:[1,2,3]}]},actor=await createSkinnedActor({gl},model,{url:'approved',type:'hazmat'});assert.equal(actor.enabled,true);assert.deepEqual(model.meshes[0].matrix,[1,2,3]);
  const initial=records.uploads;actor.update(.01,{speed:1});assert.equal(records.uploads,initial,'30 Hz cap should defer short frame');actor.update(.03,{speed:1});assert.equal(records.uploads,initial+2);actor.reset();assert.equal(records.uploads,initial+4);actor.dispose();actor.dispose();assert.equal(records.created,2);assert.equal(records.deleted,2);assert(records.pointers>=4,'original vertex pointers must be restored');
}finally{globalThis.fetch=previousFetch}
console.log('PASS actual GLB rigs, bind recovery, gait, collapse, normals, and truncation');

// Chasing must be a genuine full stride, not a faster patrol shuffle.
for (const phase of [Math.PI/2,Math.PI*1.5]) {
  const run=proceduralActorPose('skinstealer',1,{speed:4.4,mode:'chase',gaitPhase:phase});
  const walk=proceduralActorPose('skinstealer',1,{speed:1.5,mode:'patrol',gaitPhase:phase});
  assert(Math.abs(run.thigh_L_60[0])>Math.abs(walk.thigh_L_60[0])*2);
  assert(run.forearm_L_23[0]>.7 && run.forearm_R_46[0]>.7);
  assert(run.spine_001_53[0]>.25 && run.spine_006_0[0]<0);
  const rig=buildSkinnedRig(buffer('skinstealer'));deformSkinnedRig(rig,run);
  assert(rig.posedPositions.every(Number.isFinite));assert(rig.posedNormals.every(Number.isFinite));
}
const stopped=proceduralActorPose('skinstealer',1,{speed:0,mode:'chase',gaitPhase:2});
assert(stopped.thigh_L_60[0]===0);assert.equal(stopped.forearm_L_23[0],0);
console.log('PASS chase stride, bent elbows, forward lean, counter-tilted head and stationary legs');

const sprintForward=proceduralActorPose('skinstealer',0,{speed:4.4,mode:'chase',gaitPhase:Math.PI/2});
assert(Math.abs(sprintForward.upper_arm_L_24[0])>1,'sprint arm must swing through more than 1 radian');
assert(sprintForward.thigh_L_60[0]<-1,'sprint must extend the leading leg');
const recovery=proceduralActorPose('skinstealer',0,{speed:4.4,mode:'chase',gaitPhase:0});
assert(recovery.shin_L_59[0]>1.5 && recovery.shin_R_64[0]<.2,'recovery knee folds while support leg remains extended');
console.log('PASS full arm follow-through and separate support/recovery knee phases');

// Check a complete chase gait against the real mesh, including the head's
// descendants. A small local twist can otherwise produce a large visible
// left/right displacement through the inherited skeleton transforms.
const sprintRig=buildSkinnedRig(buffer('skinstealer'));
const headJoint=sprintRig.skin.joints.indexOf(sprintRig.names.get('spine_006_0'));
assert(headJoint>=0,'the real model must contain the head joint');
const headVertices=[];
for(let i=0;i<sprintRig.vertexCount;i++){
  let weight=0;
  for(let k=0;k<4;k++)if(sprintRig.joints[i*4+k]===headJoint)weight+=sprintRig.weights[i*4+k];
  if(weight>.5)headVertices.push(i);
}
assert(headVertices.length>0,'the real model must have head-weighted vertices');
const headCenters=[],leftArms=[],rightArms=[],leftLegs=[],rightLegs=[];
for(let sample=0;sample<32;sample++){
  const phase=sample*Math.PI*2/32,time=phase*1.25/(4.4*Math.PI);
  const pose=proceduralActorPose('skinstealer',time,{speed:4.4,mode:'chase',gaitPhase:phase});
  assert(Math.abs(pose.spine_001_53[1])<=.05,'chase torso twist must stay restrained');
  assert(Math.abs(pose.spine_006_0[2])<=.006,'chase head roll must stay restrained');
  assert(pose.spine_001_53[0]>.38,'chase retains the forward lean');
  leftArms.push(pose.upper_arm_L_24[0]);rightArms.push(pose.upper_arm_R_47[0]);
  leftLegs.push(pose.thigh_L_60[0]);rightLegs.push(pose.thigh_R_65[0]);
  deformSkinnedRig(sprintRig,pose);
  headCenters.push(headVertices.reduce((sum,i)=>sum+sprintRig.posedPositions[i*3],0)/headVertices.length);
}
for(const values of [leftArms,rightArms,leftLegs,rightLegs]){
  assert(Math.max(...values)-Math.min(...values)>2,'both arms and legs retain a full sprint swing');
}
assert(Math.max(...headCenters)-Math.min(...headCenters)<.55,'real-model head center must remain near the movement axis throughout the stride');
console.log('PASS stable full-cycle chase torso and real-model head with full limb swings and forward lean');
