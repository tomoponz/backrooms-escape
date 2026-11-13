// Local display-only repair for an existing source wall whose rear UVs point
// at the black region of its own atlas. No GLB, floor or collision is changed.
// The patch samples the other face of the same BR_2 material and sits 1cm
// in front of the black source face as viewed from the optional room.
export const FORBIDDEN_ROOM_WALL_REPAIR=Object.freeze({
  id:'forbidden-room-wall-repair', planeZ:-20.5856, offset:.01,
  minX:-6.5,maxX:6.3,minY:-.011422,maxY:2.724702,
});
function uv(x,y){return [.224443-.016829*y,.231670+.0168045*x]}
export function createForbiddenRoomWallRepair(renderer,sourceScene){
  const original=sourceScene?.sources?.get('assets/models/original-backrooms.glb');
  const material=original?.meshes?.find(m=>m.material?.name==='BR_2')?.material;
  if(!renderer?.createGeometry||!material?.texture)throw new TypeError('Wall repair requires the loaded original BR_2 material');
  const s=FORBIDDEN_ROOM_WALL_REPAIR,z=s.planeZ-s.offset;
  const a=[s.minX,s.minY,z],b=[s.maxX,s.minY,z],c=[s.maxX,s.maxY,z],d=[s.minX,s.maxY,z];
  const points=[a,c,b,a,d,c],positions=points.flat(),normals=Array(6).fill([0,0,-1]).flat(),uvs=points.flatMap(p=>uv(p[0],p[1]));
  const model=renderer.createGeometry(positions,normals,uvs,{...material,uv:[0,0,1,1],rotation:0,emissiveUV:[0,0,1,1],emissiveRotation:0});
  model.id=s.id;model.instanceId='original-east';model.visible=false;
  model.atmosphere=sourceScene.instances?.find(i=>i.id==='original-east')?.models?.[0]?.atmosphere;
  let disposed=false;
  // Scope visibility to the optional room and its immediate threshold only.
  function update(eye){model.visible=!disposed&&Array.isArray(eye)&&eye.length===3&&eye.every(Number.isFinite)&&
    eye[0]>=-3&&eye[0]<=2&&eye[2]>=-29.5&&eye[2]<-24.15}
  function dispose(){disposed=true;model.visible=false}
  return Object.freeze({model,update,dispose});
}
