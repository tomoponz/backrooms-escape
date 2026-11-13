import {M} from './engine.js';

// The inventory owns the flashlight. This module owns only the switch state;
// model placement and registration are supplied by the game.
export const FLASHLIGHT_ID='flashlight';
export const FLASHLIGHT_PICKUP_RANGE=.9;
export const FLASHLIGHT_FLOOR_SCALE=2;

// Uniformly enlarge the approved model, keeping its centre and lowest point
// aligned to the pickup location and the supporting floor.
export function flashlightFloorMatrix(model,position,floorHeight=0){
  const {min,max}=model||{};
  if(!min||!max||!Array.isArray(position)||position.length!==2||![...min,...max,...position,floorHeight].every(Number.isFinite)||max[1]<=min[1])
    throw new TypeError('Flashlight requires finite model bounds and a valid floor position');
  const anchor=[(min[0]+max[0])/2,min[1],(min[2]+max[2])/2];
  return M.mul(M.pose(position[0],floorHeight+.003,position[1],0,FLASHLIGHT_FLOOR_SCALE),M.trs(anchor.map(v=>-v)));
}
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

/** `acquire` must synchronously add one flashlight to the shared inventory.
 * `setVisible` is the supplied model adapter; no geometry is created here.
 * Reset inventory before calling reset() to restore the pickup for a new run.
 */
export function createFlashlightPickup({nav,inventory,acquire,setVisible=()=>{},position,range=FLASHLIGHT_PICKUP_RANGE}={}){
  if(!nav||!['canWalk','visible','nearest','path','point','floorAt'].every(k=>typeof nav[k]==='function')||
     !inventory||!['count','subscribe'].every(k=>typeof inventory[k]==='function')||typeof acquire!=='function'||
     typeof setVisible!=='function'||!Number.isFinite(range)||range<=0)throw new TypeError('Flashlight requires navigation, inventory, acquisition callback and a model adapter');
  const spawn=nav.point(nav.start);
  if(!valid(spawn))throw new RangeError('Flashlight requires a valid spawn point');
  // The source world's initial look points east. This spot is on clear floor,
  // ahead and to the left, with space from the first almond water pickup.
  const p=position??[spawn[0]+1.68,spawn[1]-1.6];
  if(!valid(p)||!nav.canWalk(...p)||!Number.isFinite(nav.floorAt(...p))||!nav.visible(spawn,p))
    throw new RangeError('Flashlight must be on visible, supported floor near spawn');
  const index=nav.nearest(...p);
  if(index<0||!nav.path(nav.start,index).length)throw new RangeError('Flashlight is unreachable');
  const location=Object.freeze([...p]),floor=nav.floorAt(...location);
  let on=false,visible,disposed=false;
  const owned=()=>inventory.count(FLASHLIGHT_ID)>0;
  function sync(){
    const has=owned();if(!has)on=false;
    const next=!has;
    if(!disposed&&visible!==next){visible=next;setVisible(next)}
    return has;
  }
  const unsubscribe=inventory.subscribe(sync);sync();
  const state=()=>{const has=sync();return Object.freeze({owned:has,on:has&&on,position:location,floor,visible:!has})};
  function nearest(player){return !sync()&&valid(player)&&distance(player,location)<=range&&nav.visible(player,location)?{id:FLASHLIGHT_ID,position:location}:null}
  function collect(player){
    if(sync())return {ok:false,reason:'already-owned',...state()};
    if(!nearest(player))return {ok:false,reason:'not-near',...state()};
    let result;try{result=acquire()}catch{return {ok:false,reason:'acquire-failed',...state()}}
    if(!result?.ok||!sync())return {ok:false,reason:result?.reason??'acquire-failed',...state()};
    return {ok:true,...state()};
  }
  function toggle(){if(!sync())return {ok:false,reason:'missing',...state()};on=!on;return {ok:true,...state()}}
  function reset(){on=false;return state()}
  function dispose(){if(disposed)return;disposed=true;unsubscribe()}
  return Object.freeze({nearest,collect,toggle,reset,dispose,get state(){return state()}});
}
