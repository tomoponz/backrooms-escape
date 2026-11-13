// Collision and doorway crossing for the existing dead-end VR room. The fixed
// box bounds the approved source door leaf in its half-open rendered pose.
import {createLockerNavigation} from './locker-navigation.js';
import {dressingBarriers} from './set-dressing.js';
export const FORBIDDEN_ROOM=Object.freeze({
  id:'forbidden-room-door',
  hinge:Object.freeze([-1.30,0,-24.31]),
  // The renderer's transformed existing leaf bounds (no source GLB changes).
  barrier:Object.freeze({min:Object.freeze([-1.363,0,-24.316]),max:Object.freeze([-.683,2.173,-23.530])}),
  doorway:Object.freeze({z:-24.31,minX:-1.313,maxX:1.021}),
  safeOutside:Object.freeze([.25,-23.1]),safeInside:Object.freeze([.25,-25.5]),
});
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
/** Construct before path caches are populated; the door is permanently solid. */
export function createForbiddenRoomNavigation(data,layout={}){
  const gates=data?.gates??layout.gates??[];
  if(gates.some(g=>g.id===FORBIDDEN_ROOM.id))throw new TypeError('Forbidden room collision id conflicts with authored gate');
  const gate={id:FORBIDDEN_ROOM.id,barrier:FORBIDDEN_ROOM.barrier,initiallyOpen:false};
  // Chairs and boxes from the layout are solid, exactly like the lockers.
  const props=dressingBarriers(layout.props),fixed=new Set(props.map(g=>g.id));
  const result=createLockerNavigation({...data,gates:[...gates,gate,...props]},layout),setGateOpen=result.nav.setGateOpen;
  result.nav.setGateOpen=(id,value)=>id===FORBIDDEN_ROOM.id||fixed.has(id)?false:setGateOpen(id,value);
  return result;
}
/** Continuous segment crossing, only outside to inside; returning is never an entry. */
export function enteredForbiddenRoom(before,after){
  if(!valid(before)||!valid(after))return false;
  const {z,minX,maxX}=FORBIDDEN_ROOM.doorway;
  if(before[1]<z||after[1]>=z)return false;
  const t=(before[1]-z)/(before[1]-after[1]),x=before[0]+(after[0]-before[0])*t;
  return x>=minX-1e-8&&x<=maxX+1e-8;
}
