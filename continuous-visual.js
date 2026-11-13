import {M} from './engine.js';
import {ROOM_CLIP_X} from './continuous-world.js';

// Translations are shared with the navigation layout. The Baked mesh already
// has its authored 3x scale; all coordinates used for cutouts are in metres.
export const ROOM_VISUALS=Object.freeze({
 level0:{translation:[0,.11756357598,0],holes:[{min:[-74.1,.05,5.95209016744],max:[-67.0,2.5,8.35209016744]}]},
 baked:{translation:[-73.6,0,7.22209016744],holes:[{min:[-68.3,.05,5.95209016744],max:[-67.3,2.3,8.35209016744]},{min:[-82.4,.05,5.95209016744],max:[-81.4,2.3,8.35209016744]}]},
 original:{translation:[-119.6,-.00808581710,7.14023040238],holes:[{min:[-83.0,.05,5.95209016744],max:[-80.3,2.3,8.35209016744]},{min:[-133.2,.05,5.95209016744],max:[-131.2,2.3,8.35209016744]}]},
 dreamcore:{translation:[-104.7,-7.2724,7.40209016744],holes:[]}
});
export const PASSAGES=Object.freeze([
 {from:-68.0133,to:-67.5644,z:7.15209016744},
 {from:-82.3050,to:-81.7333,z:7.15209016744},
 {from:-132.1,to:-131.5850,z:7.15209016744}
]);

// The original carpet repeats every two world metres after the Baked room's
// 3x scale. Keep the same world-anchored phase on every corridor surface,
// including the sloped section, instead of stretching one tile over a hall.
const CARPET_WORLD_SCALE=.5, BAKED_ORIGIN=ROOM_VISUALS.baked.translation;
function carpetPhase(x,z){return [(x-BAKED_ORIGIN[0])*CARPET_WORLD_SCALE,(z-BAKED_ORIGIN[2])*CARPET_WORLD_SCALE]}
function carpetForFloor(material,startX,highZ,length,width){
 if(!material)return undefined;
 const [u,v]=carpetPhase(startX,highZ);
 return {...material,uv:[u,v,length*CARPET_WORLD_SCALE,-width*CARPET_WORLD_SCALE],rotation:0};
}
function carpetForRamp(material,startX,centerZ){
 if(!material)return undefined;
 const [u,v]=carpetPhase(startX,centerZ);
 // rampFloor emits (x-startX)/2 and (z-centerZ)/2 as its UVs.
 return {...material,uv:[u,v,1,1],rotation:0};
}

// Apertures are in the room's translated, scaled coordinates. Converting
// from world coordinates preserves the pre-existing Original seam clipping.
export function prepareContinuousRoom(id,obj){
 const data=ROOM_VISUALS[id];if(!data)throw Error('Unknown room: '+id);
 const t=data.translation;obj.clipOrigin=[...t];if(id==='dreamcore')obj.clipMaxX=-27.4;
 // Adjacent rooms share these planes; the authoring meshes sometimes extend
 // beyond their navigable rooms, so trim that overlap instead of layering it.
 if(ROOM_CLIP_X[id]){const [min,max]=ROOM_CLIP_X[id];if(Number.isFinite(min))obj.clipMinX=min;if(Number.isFinite(max))obj.clipMaxX=max}
 obj.holes=data.holes.map(h=>({min:h.min.map((x,i)=>x-t[i]),max:h.max.map((x,i)=>x-t[i])}));
 if(id==='original'){
  obj.exteriorClip=true;
  if(obj.min&&obj.max)obj.max=[obj.max[0]+25.2,obj.max[1],obj.max[2]+25.2];
 }
 if(id==='dreamcore'){
  // Reuse the author's grass mesh (same VAOs/textures) beneath the exposed
  // outdoor sides of the corridor. The shift and vertical correction match
  // the existing terrain at the edge; clips keep the passage carpet clear.
  const existing=(obj.meshes??[]).filter(m=>m.material?.name==='grass');
  obj.meshes?.push(...existing.map(m=>({...m,matrix:M.mul(M.pose(10,.409,0),m.matrix),clipMinX:-27.4,clipMaxX:-26.4,excludePassage:true})));
  if(obj.max)obj.max=[obj.max[0]+10,obj.max[1]+.409,obj.max[2]];
 }
 return obj;
}

// Four instances of the same approved Original meshes; VAOs and textures are
// shared. The shader clips the overlapping sides and opens the two loop doors.
// The end wall reaches x=37.96; the shader trims only its overlap with Baked.
export function expandOriginalMeshes(obj){
 obj.meshes=obj.meshes.flatMap(m=>[0,25.2].flatMap(z=>[0,25.2].map(x=>({...m,
  matrix:M.mul(M.pose(x,0,z),m.matrix),clipSide:x? -1:1,clipZSide:z? -1:1,clipMaxX:37.98}))));
 return obj;
}

// Passage surfaces are simple built-in meshes, not additional imported 3D
// models. Their carpet reuses an existing approved room's material.
export function createPassages(renderer,baked,level0,original,dream,nav){
 const objects=[];
 const carpet=baked?.meshes.find(m=>m.material?.name==='Existing carpet sample')?.material;
 const material=(obj,name)=>obj?.meshes.find(m=>m.material?.name===name)?.material;
 const levelWall=material(level0,'Wall_1'),originalWall=material(original,'Dot_Wallpaper')??material(original,'StripeWallpaper');
 const ceiling=material(level0,'Ceiling_1'),grass=material(dream,'grass');
 // Each patch lies strictly inside the corresponding original texture atlas;
 // mirrored repeats avoid the black unused atlas area and hard tile edges.
 const tile=(base,rect,uv,tint=[1,1,1,1])=>base?{...base,color:tint,uv,tileRect:rect,rotation:0,unlit:0}:undefined;
 const box=(position,scale,color,material)=>{
  const o=renderer.cube(color);o.matrix=M.trs(position,[0,0,0,1],scale);
  if(material)o.meshes[0].material={...material,color:material.color??[1,1,1,1],emissive:[0,0,0]};
  objects.push(o);
 };
 for(const [index,p] of PASSAGES.entries()){
  const center=(p.from+p.to)/2,length=p.to-p.from+.25;
  const wall=index===0?tile(levelWall,[.02,.295,.075,.075],[0,0,length/2,1.35],[.65,.65,.65,1]):tile(originalWall,[.845,.29,.06,.06],[0,0,length/2,1.35],[.78,.78,.78,1]);
  const ceilingTiles=tile(ceiling,[.385,.05,.05,.07],[0,0,length/2,1.27],[.72,.72,.72,1]);
  if(index===2){
   // Carry the existing sloped floor slightly beneath the terrain edge so
   // rasterization cannot leave a sky-coloured hairline at the join.
   const rampStart=p.from-.02,rampEnd=p.to,ramp=carpetForRamp(carpet,rampStart,p.z);
   if(ramp&&grass){ramp.blendTexture=grass.texture;ramp.blendRect=[.70,.08,.075,.075];ramp.blendRange=[rampStart,rampEnd]}
   objects.push(renderer.rampFloor(rampStart,rampEnd,p.z,ramp));
  }else box([center,-.048,p.z],[length,.08,2.4],[.54,.49,.29,1],carpetForFloor(carpet,center-length/2,p.z+1.2,length,2.4));
  for(const z of [p.z-1.23,p.z+1.23])box([center,1.15,z],[length,2.7,.08],[.52,.49,.32,1],wall);
  box([center,2.52,p.z],[length,.08,2.54],[.60,.59,.47,1],ceilingTiles);
  for(const z of [p.z-1.185,p.z+1.185]){
   if(index!==2){box([center,.112,z],[length,.20,.025],[.29,.29,.20,1]);continue}
   const h=-.136*(z-p.z),span=p.to-p.from,angle=Math.atan(-h/span),o=renderer.cube([.29,.29,.20,1]);
   o.matrix=M.trs([center,.112+h/2,z],[0,0,Math.sin(angle/2),Math.cos(angle/2)],[Math.hypot(span,h),.20,.025]);objects.push(o);
  }
  for(let x=p.from+2;x<p.to-1;x+=4)box([x,2.47,p.z],[.9,.025,.22],[.88,.86,.68,1]);
  // Small muted chevrons point west toward the exit; avoid luminous portals.
  for(const side of [-1,1]){
   const angle=-Math.PI/2+side*Math.PI/4,o=renderer.cube([.70,.68,.47,1]);
   o.matrix=M.trs([center,.026,p.z+side*.15],[0,Math.sin(angle/2),0,Math.cos(angle/2)],[.055,.025,.5]);
   o.meshes[0].material.emissive=[.025,.022,.01];objects.push(o);
  }
 }
 // The Baked source has open edge sections that show the outside fog as large
 // black rectangles when viewed from the opposite corridor. Back those edges
 // with wall panels, leaving the two 2.4 m door openings completely clear.
 const z0=1.22209016744,z1=5.95209016744,z2=8.35209016744,z3=13.22209016744;
 for(const x of [-67.57,-82.09]){
  for(const [a,b] of [[z0,z1],[z2,z3]])box([x,1.5,(a+b)/2],[.05,3,b-a],[.49,.47,.32,1]);
  box([x,2.65,(z1+z2)/2],[.05,.7,z2-z1],[.49,.47,.32,1]);
 }
 // Bridge the small ceiling-height gap between the passage and Original.
 for(const x of [-81.75,-132.00])box([x,2.45,7.15209016744],[.6,.30,2.52],[.58,.57,.45,1]);
 return objects;
}

// A solid, unlit metal door with a small red indicator, rather than a glowing
// warp frame. Use the goal's actual floor height and face its approach path.
export function createExitDoor(renderer,position,yaw=0){
 const base=M.pose(position[0],position[1],position[2],yaw),objects=[];
 const piece=(pos,size,color)=>{
  let o=renderer.cube(color);o.matrix=M.mul(base,M.trs(pos,[0,0,0,1],size));objects.push(o);return o;
 };
 // A small wall and lintel ground the door as an evacuation structure.
 for(const x of [-1.12,1.12])piece([x,1.10,.07],[1.08,2.20,.22],[.38,.38,.34,1]);
 piece([0,2.32,.07],[3.32,.40,.22],[.38,.38,.34,1]);
 piece([0,1.04,0],[1.02,2.08,.10],[.20,.21,.19,1]);
 for(const x of [-.56,.56])piece([x,1.08,0],[.10,2.16,.18],[.44,.43,.37,1]);
 piece([0,2.13,0],[1.22,.12,.18],[.44,.43,.37,1]);
 piece([.37,1.00,-.07],[.12,.045,.035],[.70,.66,.48,1]);
 let indicator=piece([0,2.24,0],[.40,.09,.12],[.63,.19,.13,1]);
 indicator.meshes[0].material.emissive=[.08,.015,.008];
 return objects;
}
