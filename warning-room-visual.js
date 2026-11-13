// Warning-room decoration reuses only the two approved, existing source models.
// The heading is a DOM overlay projected to a world anchor; no 3D text model is created.
import {M,V} from './engine.js';
import {loadWarningSignCatalog} from './warning-signs.js';
import {loadWarningDoor} from './warning-door.js';

const OPENING=Object.freeze({minX:-1.313,maxX:1.021,z:-24.31});
const LABEL=Object.freeze([-.146,2.45,-24.10]);
// All centres are outside the opening and just in front of the outer wall.
export const WARNING_ROOM_SIGNS=Object.freeze([
  ['stop',-1.67,1.87,.36],['yield',-2.16,1.79,.37],['no_pedestrians',-2.64,1.91,.34],
  ['do_not_enter',-1.64,1.30,.34],['no_parking',-2.09,1.27,.39],['no_trucks',-2.60,1.37,.32],
  ['wrong_way',-1.79,.79,.20],['no_bicycles',-2.52,.76,.32],
  ['stop_alt',1.40,1.89,.36],['no_u_turn',1.81,1.78,.35],['no_standing',2.27,1.88,.38],
  ['no_parking_symbol',1.40,1.31,.34],['turn_restriction_a',1.84,1.23,.35],['turn_restriction_b',2.33,1.35,.35],
  ['one_way',1.52,.78,.19],['do_not_enter',2.28,.73,.35]
].map(a=>Object.freeze({type:a[0],position:Object.freeze([a[1],a[2],-24.105]),yaw:0,height:a[3]})));

export function buildWarningRoomSigns(catalog){
  if(!catalog?.create||!catalog?.describe)throw Error('Warning sign catalog required');
  return WARNING_ROOM_SIGNS.map((s,index)=>{
    const dims=catalog.describe(s.type).dimensions,half=dims.width*s.height/2;
    if(s.position[0]+half> -1.45&&s.position[0]-half<1.20)throw Error(`Sign ${index} lies outside the verified wall`);
    const model=catalog.create(s.type,{position:[...s.position],yaw:s.yaw,height:s.height});model.id=`warning-sign-${index}`;return model;
  });
}

// Screen coordinates only. This is an exterior, near-entrance label; it is not
// a raycast or a replacement for depth testing against arbitrary geometry.
export function projectWarningLabel(camera,rect){
  if(!camera?.eye?.every(Number.isFinite)||!Number.isFinite(camera.yaw)||!Number.isFinite(camera.pitch)||!rect||rect.width<=0||rect.height<=0)return null;
  const delta=V.sub(LABEL,camera.eye),distance=V.len(delta);
  if(camera.eye[2]<=OPENING.z+.12||camera.eye[2]>OPENING.z+6.5||Math.abs(camera.eye[0]-LABEL[0])>3.4||distance<.25)return null;
  const forward=[Math.sin(camera.yaw)*Math.cos(camera.pitch),Math.sin(camera.pitch),-Math.cos(camera.yaw)*Math.cos(camera.pitch)];
  const view=M.view(camera.eye,V.add(camera.eye,forward)),vp=M.mul(M.perspective((camera.fov||72)*Math.PI/180,rect.width/rect.height),view);
  const [x,y,z]=LABEL,clip=[0,1,2,3].map(i=>vp[i]*x+vp[i+4]*y+vp[i+8]*z+vp[i+12]);if(clip[3]<=0)return null;
  const nx=clip[0]/clip[3],ny=clip[1]/clip[3],nz=clip[2]/clip[3];if(Math.abs(nx)>1||Math.abs(ny)>1||nz< -1||nz>1)return null;
  return {x:rect.left+(nx+1)*rect.width/2,y:rect.top+(1-ny)*rect.height/2,fontSize:Math.max(18,Math.min(44,105/distance))};
}

export async function createWarningRoomVisual(renderer,world,{door,container=globalThis.document?.body,canvas=renderer?.canvas}={}){
  const source=world?.sources?.get('assets/models/level0.glb');if(!source)throw Error('Backrooms VR source not loaded');
  if(!container?.appendChild||!canvas?.getBoundingClientRect||!globalThis.document)throw Error('Warning label host unavailable');
  const signsModel=await renderer.load('assets/models/warning-signs-set.glb'),catalog=await loadWarningSignCatalog(signsModel),signs=buildWarningRoomSigns(catalog);
  const leaf=door||await loadWarningDoor(renderer,source);
  const label=document.createElement('div');label.textContent='入るな';label.setAttribute('aria-hidden','true');
  Object.assign(label.style,{position:'fixed',display:'none',pointerEvents:'none',zIndex:'4',transform:'translate(-50%,-50%)',color:'#982b1f',fontFamily:'"Yu Gothic UI", sans-serif',fontWeight:'900',letterSpacing:'.12em',whiteSpace:'nowrap',textShadow:'0 1px 2px #160600, 0 0 5px #2a0800'});container.appendChild(label);
  let disposed=false;
  return {models:door?[...signs]:[leaf,...signs],door:leaf,signs,catalog,label,update(camera,visible=true){if(disposed)return;const p=visible?projectWarningLabel(camera,canvas.getBoundingClientRect()):null;
      if(!p){label.style.display='none';return}label.style.display='block';label.style.left=`${p.x}px`;label.style.top=`${p.y}px`;label.style.fontSize=`${p.fontSize}px`},
    dispose(){if(disposed)return;for(const m of signs)m.visible=false;if(!door)leaf.visible=false;label.remove();disposed=true}};
}
