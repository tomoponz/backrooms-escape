import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {SOURCE_WORLD_LAYOUT} from '../source-world-layout.js';
import {createForbiddenRoomNavigation} from '../forbidden-room-navigation.js';
import {createSetDressing,BOX_SEARCH_RANGE} from '../set-dressing.js';
import {selectAlmondWaterPositions} from '../almond-water.js';
import {createSkinstealerDirector} from '../skinstealer-director.js';

const data=JSON.parse(readFileSync(new URL('../assets/source-world-navigation.json',import.meta.url),'utf8'));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function fixture(){
 const layout=structuredClone(SOURCE_WORLD_LAYOUT);
 const {nav,lockers}=createForbiddenRoomNavigation(data,layout);
 // Rendering bounds are immaterial to the physical stand/search calculation.
 const dressing=createSetDressing({nav,props:layout.props,models:{box:{min:[-.5,0,-.5],max:[.5,1,.5]}}});
 return {layout,nav,lockers,dressing,box:dressing.find('crowbar')};
}
function routeSamples(nav,route,speed,dt=.1){
 assert(route.length>0,'route must exist');
 const points=route.map(i=>nav.point(i)),samples=[];
 let player=[...points[0]],index=1;
 samples.push([...player]);
 while(index<points.length){
  let budget=speed*dt;
  while(budget>1e-8&&index<points.length){
   const next=points[index],length=distance(player,next),travel=Math.min(length,budget);
   if(length)player=player.map((value,k)=>value+(next[k]-value)*travel/length);
   budget-=travel;
   if(length<=travel+1e-8)index++;
  }
  samples.push([...player]);
 }
 return samples;
}

test('crowbar has a reachable, collision-aligned search stand without competing interactions',()=>{
 const {layout,nav,lockers,dressing,box}=fixture();
 assert.equal(layout.props.filter(p=>p.contains==='crowbar').length,1);
 assert.deepEqual(box.position,[-69.6,59.4]);
 assert.equal(nav.regionIds[nav.regionAt(...box.stand.position)],'original-far-south-southwest');
 assert(nav.canWalk(...box.stand.position));
 assert(distance(box.position,box.stand.position)<BOX_SEARCH_RANGE);
 assert(!nav.canWalk(...box.position),'the box remains solid');
 assert(nav.canWalk(-80.4,-7.4),'the temporary far-west box location is clear');
 assert.equal(nav.setGateOpen('prop:box-crowbar',true),false);
 assert(!nav.canWalk(...box.position),'a prop cannot be opened as a door');
 const maintenance=nav.nearest(-24.05,14.1);
 const water=selectAlmondWaterPositions(nav,maintenance);
 for(const p of water)assert(distance(box.stand.position,p)>2,'water cannot intercept E at the box');
 const spawn=nav.point(nav.start),flashlight=[spawn[0]+1.68,spawn[1]-1.6];
 assert(distance(box.stand.position,flashlight)>2);
 for(const locker of lockers)assert(distance(box.stand.position,locker.approach)>1.35);
 for(const point of [nav.point(nav.exit),nav.point(maintenance),...layout.breakers.map(b=>b.stand)]){
  assert(distance(box.stand.position,point)>1.7);
  const end=nav.nearest(...point);
  assert(nav.path(box.stand.i,end).length>0,'the box must retain routes to every breaker and exit');
 }
 assert(nav.path(nav.start,box.stand.i).length>0);
 // All existing interior joins remain passable with the restored footprint.
 for(const join of layout.joins.filter(j=>j.id!=='outdoor-threshold')){
  const index=nav.nearest((join.min[0]+join.max[0])/2,(join.min[2]+join.max[2])/2);
  assert(nav.path(box.stand.i,index).length>0,join.id);
 }
 nav.setGateOpen('outdoor-door',true);
 assert(nav.path(box.stand.i,nav.escape).length>0,'the final outdoor destination remains reachable');
 assert.equal(dressing.nearestBox(box.stand.position)?.id,'box-crowbar');
 assert.equal(dressing.search(box.stand.position).contains,'crowbar');
 assert.equal(dressing.find('crowbar'),null);
 dressing.reset();
 assert.equal(dressing.find('crowbar').stand.i,box.stand.i,'retry restores the same guidance destination');
});

test('every sampled search position has a clear view through the actual room geometry',()=>{
 const {layout,nav,dressing,box}=fixture();
 // Remove only this box's own solid footprint. Walls, furniture, lockers and
 // door barriers remain: the box itself must not make every sight test fail.
 const withoutBox=structuredClone(layout);
 withoutBox.props=withoutBox.props.filter(prop=>prop.id!==box.id);
 const clear=createForbiddenRoomNavigation(data,withoutBox).nav;
 assert(clear.canWalk(...box.position),'box centre must stand on actual open floor');
 const floor=clear.floorAt(...box.position);
 assert(Number.isFinite(floor));
 // A conservative 70cm square encloses the approved 36cm-high box's rotated
 // base (58.7cm x 65.9cm at yaw .4), including its complete interior.
 for(let x=-.35;x<=.3501;x+=.05)for(let z=-.35;z<=.3501;z+=.05){
  const p=[box.position[0]+x,box.position[1]+z];
  assert(clear.canWalk(...p),'the entire model base must clear the room geometry');
  assert(Math.abs(clear.floorAt(...p)-floor)<.001,'the base must rest on level supported floor');
 }
 let checked=0;
 const check=player=>{
  if(!nav.canWalk(...player)||dressing.nearestBox(player)?.id!==box.id)return;
  checked++;
  assert(clear.visible(player,box.position),`wall-through search from ${player}`);
 };
 for(let x=-BOX_SEARCH_RANGE;x<=BOX_SEARCH_RANGE+.0001;x+=.025)
  for(let z=-BOX_SEARCH_RANGE;z<=BOX_SEARCH_RANGE+.0001;z+=.025)
   if(Math.hypot(x,z)<=BOX_SEARCH_RANGE)check([box.position[0]+x,box.position[1]+z]);
 // Also cover the circular boundary between grid samples, where a tiny sliver
 // of floor behind an obstacle could otherwise be missed.
 for(const radius of [BOX_SEARCH_RANGE-.001,BOX_SEARCH_RANGE-.01])
  for(let angle=0;angle<Math.PI*2;angle+=Math.PI/360)
   check([box.position[0]+Math.cos(angle)*radius,box.position[1]+Math.sin(angle)*radius]);
 assert(checked>5000,'exercise the actual walkable search area');
});

for(const difficulty of ['normal','easy'])test(`${difficulty} preserves the full transformation and retreat windows`,()=>{
 const {nav}=fixture(),director=createSkinstealerDirector({nav});
 director.reset(difficulty);
 const origin=director.state.position;
 let state=director.update({dt:.05,player:origin});
 assert.equal(state.phase,'transforming');
 for(let tick=1;tick<=80;tick++){
  state=director.update({dt:.05,player:origin});
  assert.deepEqual(state.position,origin,'the actor stays still throughout both windows');
  assert.equal(state.caught,false,'even overlapping the actor cannot capture during grace');
  assert.equal(state.phase,tick<36?'transforming':tick<80?'grace':'monster');
 }
 assert.equal(director.update({dt:.05,player:origin}).caught,true);
 assert.equal(director.update({dt:.05,player:origin}).caught,false,'capture fires only once');

 // An actual supported retreat route remains usable at ordinary walking pace.
 director.reset(difficulty);
 const route=nav.path(nav.nearest(-83,-5),nav.nearest(-86,1));
 const retreat=routeSamples(nav,route,3.4,.05);
 let player=retreat[0];
 assert.equal(director.update({dt:.05,player}).phase,'transforming');
 for(let tick=1;tick<=80;tick++){
  player=retreat[Math.min(tick,retreat.length-1)];
  assert(nav.canWalk(...player));
  state=director.update({dt:.05,player});
  assert.equal(state.caught,false);
 }
 assert.equal(state.phase,'monster');
 assert(distance(player,state.position)>6,'walking during the unchanged grace creates escape distance');
});

test('Bacteria suppression and Explore keep the human encounter disabled when required',()=>{
 const {nav}=fixture(),director=createSkinstealerDirector({nav});
 for(let tick=0;tick<100;tick++){
  const state=director.update({dt:.05,player:director.state.position,mayNotice:false});
  assert.equal(state.phase,'human');
  assert.equal(state.caught,false);
 }
 assert.equal(director.update({dt:.05,player:director.state.position,mayNotice:true}).phase,'transforming');
 const initial=director.reset('explore');
 for(let tick=0;tick<100;tick++){
  const state=director.update({dt:.05,player:initial.position,running:true});
  assert.equal(state.phase,'disabled');
  assert.equal(state.caught,false);
  assert.deepEqual(state.position,initial.position);
 }
});
