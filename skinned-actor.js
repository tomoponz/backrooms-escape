// CPU glTF skinning for the two user-selected characters. Neither GLB contains
// animation clips: movement below is a procedural skeletal pose, not a claim
// that the source assets provide walking or transformation animation.
import {M} from './engine.js';
import {readGLB} from './renderer-resources.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const components={5120:['getInt8',1,127],5121:['getUint8',1,255],5122:['getInt16',2,32767],5123:['getUint16',2,65535],5125:['getUint32',4,4294967295],5126:['getFloat32',4,1]};
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function inverse(a){
  const rows=Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>c<4?a[c*4+r]:+(c-4===r)));
  for(let c=0;c<4;c++){let p=c;for(let r=c+1;r<4;r++)if(Math.abs(rows[r][c])>Math.abs(rows[p][c]))p=r;
    if(Math.abs(rows[p][c])<1e-12)throw Error('Non-invertible skin transform');[rows[c],rows[p]]=[rows[p],rows[c]];
    const scale=rows[c][c];for(let k=0;k<8;k++)rows[c][k]/=scale;
    for(let r=0;r<4;r++)if(r!==c){const n=rows[r][c];for(let k=0;k<8;k++)rows[r][k]-=n*rows[c][k];}}
  return Array.from({length:16},(_,i)=>rows[i%4][4+Math.floor(i/4)]);
}
function axisX(r){const h=r*.5;return [Math.sin(h),0,0,Math.cos(h)]}
function axisY(r){const h=r*.5;return [0,Math.sin(h),0,Math.cos(h)]}
function poseRotation(x=0,y=0,z=0){const a=M.trs([0,0,0],axisX(x)),b=M.trs([0,0,0],axisY(y));const h=z*.5;return M.mul(M.mul(a,b),M.trs([0,0,0],[0,0,Math.sin(h),Math.cos(h)]))}

export function buildSkinnedRig(buffer){
  const {json:j,bytes}=readGLB(buffer),nodes=j.nodes||[];
  const candidates=nodes.map((n,i)=>n.mesh!==undefined&&n.skin!==undefined?i:-1).filter(i=>i>=0);
  if(candidates.length!==1)throw Error('Expected exactly one skinned mesh node');
  const meshNode=candidates[0],node=nodes[meshNode],skin=j.skins?.[node.skin],primitives=j.meshes?.[node.mesh]?.primitives;
  if(!skin||!Array.isArray(skin.joints)||primitives?.length!==1)throw Error('Unsupported skinned mesh');
  function accessor(index){const a=j.accessors?.[index],view=j.bufferViews?.[a?.bufferView],desc=components[a?.componentType],width=widths[a?.type];
    if(!a||!view||!desc||!width||a.sparse)throw Error('Unsupported skin accessor');
    const [get,size,denom]=desc,raw=bytes(a.bufferView),data=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),offset=a.byteOffset||0,stride=view.byteStride||size*width;
    if(offset+(a.count-1)*stride+size*width>raw.byteLength)throw Error('Skin accessor outside buffer');
    const out=new Float32Array(a.count*width);for(let i=0;i<a.count;i++)for(let c=0;c<width;c++){let n=data[get](offset+i*stride+c*size,true);if(a.normalized&&a.componentType!==5126)n=Math.max(-1,n/denom);out[i*width+c]=n;}return {values:out,width,count:a.count};}
  const attrs=primitives[0].attributes,p=accessor(attrs.POSITION),n=accessor(attrs.NORMAL),w=accessor(attrs.WEIGHTS_0),ids=accessor(attrs.JOINTS_0),ib=accessor(skin.inverseBindMatrices);
  if(p.width!==3||n.width!==3||w.width!==4||ids.width!==4||ib.width!==16||p.count!==n.count||p.count!==w.count||p.count!==ids.count||ib.count!==skin.joints.length)throw Error('Inconsistent skin attributes');
  for(let i=0;i<p.count;i++){let total=0;for(let k=0;k<4;k++){const q=i*4+k,id=ids.values[q],weight=w.values[q];if(!Number.isInteger(id)||id<0||id>=ib.count||!Number.isFinite(weight)||weight<0)throw Error('Invalid skin weights');total+=weight;}
    if(Math.abs(total-1)>.01||!Number.isFinite(total))throw Error('Unnormalized skin weights');for(let k=0;k<4;k++)w.values[i*4+k]/=total;}
  if(!p.values.every(Number.isFinite)||!n.values.every(Number.isFinite))throw Error('Nonfinite skin vertex');
  const locals=nodes.map(x=>x.matrix?[...x.matrix]:M.trs(x.translation,x.rotation,x.scale));
  const roots=j.scenes?.[j.scene||0]?.nodes;if(!Array.isArray(roots))throw Error('Missing skin scene');
  const world=Array(nodes.length),order=[],visiting=new Set();
  function visit(i,parent){if(!nodes[i]||visiting.has(i)||world[i])throw Error('Invalid skin hierarchy');visiting.add(i);world[i]=M.mul(parent,locals[i]);order.push(i);for(const c of nodes[i].children||[])visit(c,world[i]);visiting.delete(i)}
  for(const root of roots)visit(root,M.identity());if(!world[meshNode]||skin.joints.some(x=>!world[x]))throw Error('Skin joint outside scene');
  const names=new Map();nodes.forEach((x,i)=>{if(x.name)names.set(x.name,names.has(x.name)?-1:i)});
  const parents=Array(nodes.length).fill(-1);nodes.forEach((x,i)=>(x.children||[]).forEach(c=>parents[c]=i));
  return {nodes,skin,meshNode,locals,roots,order,parents,names,inverseMesh:inverse(world[meshNode]),bind:ib.values,positions:p.values,normals:n.values,weights:w.values,joints:ids.values,posedPositions:p.values.slice(),posedNormals:n.values.slice(),vertexCount:p.count};
}

export function deformSkinnedRig(rig,rotations={}){
  const worlds=Array(rig.nodes.length),jointMatrices=[],normalMatrices=[];
  for(const i of rig.order){const n=rig.nodes[i],r=rotations[n.name],local=r?M.mul(rig.locals[i],poseRotation(...r)):rig.locals[i];worlds[i]=M.mul(rig.parents[i]<0?M.identity():worlds[rig.parents[i]],local);}
  for(let i=0;i<rig.skin.joints.length;i++){const bind=Array.from(rig.bind.subarray(i*16,i*16+16)),m=M.mul(M.mul(rig.inverseMesh,worlds[rig.skin.joints[i]]),bind),inv=inverse(m);jointMatrices.push(m);normalMatrices.push(inv);}
  let minY=Infinity,maxY=-Infinity;
  for(let i=0;i<rig.vertexCount;i++){const k=i*3,j=i*4,x=rig.positions[k],y=rig.positions[k+1],z=rig.positions[k+2],nx=rig.normals[k],ny=rig.normals[k+1],nz=rig.normals[k+2];let px=0,py=0,pz=0,ox=0,oy=0,oz=0;
    for(let a=0;a<4;a++){const w=rig.weights[j+a];if(!w)continue;const m=jointMatrices[rig.joints[j+a]],n=normalMatrices[rig.joints[j+a]];
      px+=w*(m[0]*x+m[4]*y+m[8]*z+m[12]);py+=w*(m[1]*x+m[5]*y+m[9]*z+m[13]);pz+=w*(m[2]*x+m[6]*y+m[10]*z+m[14]);
      ox+=w*(n[0]*nx+n[1]*ny+n[2]*nz);oy+=w*(n[4]*nx+n[5]*ny+n[6]*nz);oz+=w*(n[8]*nx+n[9]*ny+n[10]*nz);}
    const length=Math.hypot(ox,oy,oz)||1;rig.posedPositions[k]=px;rig.posedPositions[k+1]=py;rig.posedPositions[k+2]=pz;rig.posedNormals[k]=ox/length;rig.posedNormals[k+1]=oy/length;rig.posedNormals[k+2]=oz/length;minY=Math.min(minY,py);maxY=Math.max(maxY,py);}
  return {minY,maxY};
}

const DEFINITIONS={
  hazmat:{leftLeg:'LeftUpLeg',rightLeg:'RightUpLeg',leftKnee:'LeftLeg',rightKnee:'RightLeg',leftArm:'LeftArm',rightArm:'RightArm',spine:'Spine',head:'Head'},
  skinstealer:{leftLeg:'thigh_L_60',rightLeg:'thigh_R_65',leftKnee:'shin_L_59',rightKnee:'shin_R_64',leftArm:'upper_arm_L_24',rightArm:'upper_arm_R_47',leftElbow:'forearm_L_23',rightElbow:'forearm_R_46',leftFoot:'foot_L_58',rightFoot:'foot_R_63',spine:'spine_001_53',head:'spine_006_0'}
};
export function proceduralActorPose(type,time,{speed=0,mode='idle',collapse=0,gaitPhase}={}){
  const bones=DEFINITIONS[type];if(!bones)throw Error('Unknown actor type');const movement=clamp(Number.isFinite(speed)?speed/2.5:0,0,1),t=Number.isFinite(time)?time:0,c=clamp(Number.isFinite(collapse)?collapse:0,0,1);
  if(type==='skinstealer'){
    // The imported skeleton has mirrored arm axes: +X on the thigh turns
    // the leg BACK, whereas +X on the upper arm turns the arm FORWARD.
    // Full sprint: a longer stride, large arm follow-through and folded
    // recovery knee. Ankle extension accentuates the rear-foot push-off.
    // Arm axes oppose the same-side leg in world space.
    const velocity=clamp(Number.isFinite(speed)?speed:0,0,6),run=mode==='chase',
      drive=clamp(velocity/(run?3.4:1.5),0,1),
      phase=Number.isFinite(gaitPhase)?gaitPhase:t*velocity*Math.PI/1.25,
      left=Math.sin(phase),right=-left,amplitude=run?1.05:.32,
      hipL=-left*amplitude*drive,hipR=-right*amplitude*drive,
      kneeL=(.12+(run?Math.max(0,Math.cos(phase))*1.45:Math.max(0,-left)*.34))*drive,
      kneeR=(.12+(run?Math.max(0,-Math.cos(phase))*1.45:Math.max(0,-right)*.34))*drive,
      lean=(run?.42:.07)*drive,twist=Math.sin(phase)*(run?.14:.025)*drive;
    return {
      [bones.leftLeg]:[hipL,0,0],[bones.rightLeg]:[hipR,0,0],
      [bones.leftKnee]:[kneeL,0,0],[bones.rightKnee]:[kneeR,0,0],
      [bones.leftFoot]:[-(hipL+kneeL)*.52+(run?Math.max(0,-left)*.20:0)*drive,0,0],
      [bones.rightFoot]:[-(hipR+kneeR)*.52+(run?Math.max(0,-right)*.20:0)*drive,0,0],
      [bones.leftArm]:[-left*(run?1.20:.24)*drive+.12*drive,0,-.05*drive],
      [bones.rightArm]:[-right*(run?1.20:.24)*drive+.12*drive,0,.05*drive],
      [bones.leftElbow]:[(run?.95:.15)*drive+Math.max(0,left)*.32*drive,0,0],
      [bones.rightElbow]:[(run?.95:.15)*drive+Math.max(0,right)*.32*drive,0,0],
      [bones.spine]:[lean+Math.sin(phase*2)*.025*drive+Math.sin(t*2)*.012,twist,0],
      // Keep the face on the player rather than staring down at the floor.
      [bones.head]:[-lean*.68,0,Math.sin(t*7.1)*.018*drive]
    };
  }
  const phase=t*(mode==='chase'?8.4:6),s=Math.sin(phase)*movement,breath=Math.sin(t*2)*.015;
  // The selected hazmat source is a T-pose. The authored local X axes of
  // both upper arms point in opposite world-Z directions, so the same
  // positive angle lowers both arms toward the torso before adding gait.
  const amplitude=type==='hazmat'?.24:.34,armsDown=type==='hazmat'?1.18:0;
  // During the suit's collapse, bow the original pelvis joint forward.
  // The separate game-side floor-anchored vertical squash is deliberately
  // modest; together they make the slump visible without a new model.
  return {...(type==='hazmat'?{Hips:[c*.75,0,0]}:{}),[bones.leftLeg]:[s*amplitude+c*.20,0,0],[bones.rightLeg]:[-s*amplitude+c*.20,0,0],
    [bones.leftKnee]:[Math.max(0,-s)*.20+c*.35,0,0],[bones.rightKnee]:[Math.max(0,s)*.20+c*.35,0,0],
    [bones.leftArm]:[armsDown-s*amplitude*.7+c*.25,0,0],[bones.rightArm]:[armsDown+s*amplitude*.7+c*.25,0,0],
    [bones.spine]:[breath+c*.55,0,Math.sin(phase)*.025*movement],[bones.head]:[-c*.25,Math.sin(t*1.3)*.025,0]};
}

export async function createSkinnedActor(renderer,model,{url,type}={}){
  if(!DEFINITIONS[type]||typeof url!=='string')throw Error('Actor type and URL required');
  if(!renderer?.gl)return {enabled:false,update(){return {rigged:false}},reset(){},dispose(){}};
  const response=await fetch(url);if(!response.ok)throw Error(`Actor model HTTP ${response.status}`);
  const rig=buildSkinnedRig(await response.arrayBuffer());if(model.meshes?.length!==1)throw Error('Actor mesh does not match rig');
  for(const name of Object.values(DEFINITIONS[type])){const index=rig.names.get(name);if(index===undefined||index<0||!rig.skin.joints.includes(index))throw Error(`Actor skeleton is missing ${name}`)}
  const g=renderer.gl,mesh=model.meshes[0],old=[],buffers=[];let disposed=false,time=0,accumulator=0,gaitPhase=0;
  g.bindVertexArray(mesh.vao);
  for(const [location,data] of [[0,rig.posedPositions],[1,rig.posedNormals]]){
    old.push({location,buffer:g.getVertexAttrib(location,g.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING),size:g.getVertexAttrib(location,g.VERTEX_ATTRIB_ARRAY_SIZE),type:g.getVertexAttrib(location,g.VERTEX_ATTRIB_ARRAY_TYPE),normalized:g.getVertexAttrib(location,g.VERTEX_ATTRIB_ARRAY_NORMALIZED),stride:g.getVertexAttrib(location,g.VERTEX_ATTRIB_ARRAY_STRIDE),offset:g.getVertexAttribOffset(location,g.VERTEX_ATTRIB_ARRAY_POINTER),enabled:g.getVertexAttrib(location,g.VERTEX_ATTRIB_ARRAY_ENABLED)});
    const b=g.createBuffer();if(!b)throw Error('Unable to create skin buffer');g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,data,g.DYNAMIC_DRAW);g.enableVertexAttribArray(location);g.vertexAttribPointer(location,3,g.FLOAT,false,0,0);buffers.push(b);}
  g.bindVertexArray(null);g.bindBuffer(g.ARRAY_BUFFER,null);
  const upload=()=>{for(const [i,data] of [rig.posedPositions,rig.posedNormals].entries()){g.bindBuffer(g.ARRAY_BUFFER,buffers[i]);g.bufferSubData(g.ARRAY_BUFFER,0,data)}g.bindBuffer(g.ARRAY_BUFFER,null)};
  const bindFloor=deformSkinnedRig(rig).minY;
  function pose(state={}) {
    const bounds=deformSkinnedRig(rig,proceduralActorPose(type,time,{...state,gaitPhase}));
    // Plant the lowest foot at the original floor height. This is visual only:
    // navigation, chase speed, capture radius and the grace window are unchanged.
    if(type==='skinstealer'){
      const lift=bindFloor-bounds.minY;
      for(let i=1;i<rig.posedPositions.length;i+=3)rig.posedPositions[i]+=lift;
    }
    upload();
  }
  pose();
  return {enabled:true,rig,vertexCount:rig.vertexCount,update(dt,state={}){if(disposed)return {rigged:false};const step=Number.isFinite(dt)?clamp(dt,0,.1):0;time+=step;accumulator+=step;gaitPhase=(gaitPhase+step*clamp(Number.isFinite(state.speed)?state.speed:0,0,6)*Math.PI/1.25)%(Math.PI*2);
      if(accumulator>=1/30){accumulator=0;pose(state)}return {rigged:true}},
    reset(){if(disposed)return;time=0;accumulator=0;gaitPhase=0;pose()},
    dispose(){if(disposed)return;g.bindVertexArray(mesh.vao);for(const a of old){if(a.buffer){g.bindBuffer(g.ARRAY_BUFFER,a.buffer);g.vertexAttribPointer(a.location,a.size,a.type,a.normalized,a.stride,a.offset)}if(a.enabled)g.enableVertexAttribArray(a.location);else g.disableVertexAttribArray(a.location)}g.bindVertexArray(null);g.bindBuffer(g.ARRAY_BUFFER,null);for(const b of buffers)g.deleteBuffer(b);disposed=true}};
}
