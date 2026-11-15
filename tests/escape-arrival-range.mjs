import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {loadWorld} from '../world.js';
import {createEscapeObjective} from '../escape-objective.js';

// Exercise the production world factory, authored layout, physical gates and
// shipped geometry-derived grid. Substitute file transport only, not navigation.
const navigationJSON=readFileSync(new URL('../assets/source-world-navigation.json',import.meta.url),'utf8');
const originalFetch=globalThis.fetch;
let world;
try{
 globalThis.fetch=async url=>{
  assert.equal(url,'assets/source-world-navigation.json');
  return {ok:true,json:async()=>JSON.parse(navigationJSON)};
 };
 world=await loadWorld();
}finally{globalThis.fetch=originalFetch}

function fixture(targets=world.targets){
 world.nav.setGateOpen('outdoor-door',false);
 return {nav:world.nav,objective:createEscapeObjective(world.nav,targets)};
}
function restorePower(objective){
 for(const breaker of objective.breakers){
  const result=objective.interact([...breaker.position],breaker.id);
  assert(result.changed);
 }
 assert.equal(objective.state.powerRestored,true);
}
function openExit({nav,objective}){
 restorePower(objective);
 assert.equal(objective.interact([...objective.exit.position],'exit').code,'exit-opened');
 assert.equal(objective.state.doorOpened,true);
 assert.equal(objective.state.escaped,false,'opening the building door is not the outdoor goal');
 // The game applies this physical gate change when it handles exit-opened.
 nav.setGateOpen('outdoor-door',true);
}
function approach(objective,dx,dz=0){
 return [objective.escape.position[0]+dx,objective.escape.position[1]+dz];
}
function assertReachableVisible(nav,objective,player){
 assert(nav.canWalk(...player),'the test approach must stand on real supported floor');
 assert(nav.visible(player,objective.escape.position),'range test must have clear line of sight');
 assert(nav.path(nav.start,nav.nearest(...player)).length>0,'approach must connect to the actual spawn');
}

test('the actual outdoor goal cannot clear before the exit door opens',()=>{
 const {nav,objective}=fixture(),player=approach(objective,-2);
 assert(nav.canWalk(...player));
 assert(nav.visible(player,objective.escape.position));
 assert.equal(nav.path(nav.start,objective.escape.i).length,0,'closed building door blocks the outdoor route');
 assert.equal(objective.update(player),null);
 assert.equal(objective.update([...objective.escape.position]),null);
 assert.equal(objective.interact([...objective.exit.position],'exit').code,'exit-unpowered');
 restorePower(objective);
 assert.equal(objective.state.doorOpened,false);
 assert.equal(objective.update(player),null,'restored power alone must not clear');
 assert.equal(objective.state.escaped,false);
});

test('real outdoor approaches outside and exactly on the 2.5 metre boundary do not clear',()=>{
 const context=fixture(),{nav,objective}=context;
 openExit(context);
 for(const offset of [-3,-2.51,-2.5,2.5]){
  const player=approach(objective,offset);
  assertReachableVisible(nav,objective,player);
  const distance=Math.hypot(player[0]-objective.escape.position[0],player[1]-objective.escape.position[1]);
  assert(distance>=2.5);
  if(Math.abs(offset)===2.5)assert.equal(distance,2.5,'exercise the exact strict boundary');
  assert.equal(objective.update(player),null,`arrival at ${distance} metres must not clear`);
  assert.equal(objective.state.escaped,false);
 }
});

test('entering the expanded outdoor range clears once from reachable approaches',()=>{
 for(const [dx,dz] of [[-2.499,0],[2,0],[0,-2.49]]){
  const context=fixture(),{nav,objective}=context;
  openExit(context);
  const player=approach(objective,dx,dz);
  assertReachableVisible(nav,objective,player);
  const distance=Math.hypot(dx,dz);
  assert(distance>.75&&distance<2.5,'these approaches were outside the previous goal range');
  const arrived=objective.update(player);
  assert.equal(arrived?.code,'escaped');
  assert.equal(arrived.changed,true);
  assert.equal(arrived.target.id,'escape');
  assert.equal(objective.state.escaped,true);
  assert.equal(objective.update(player),null,'remaining in range cannot emit a second clear');
  assert.equal(objective.update([...objective.escape.position]),null);
 }
});

test('a real shipped wall still blocks an in-range arrival with the exit open',()=>{
 // The outdoor goal is in open terrain: a 2.5cm scan found no walkable,
 // occluded point in its new radius. Use a separate authored-target fixture
 // across an existing West-room partition to exercise the same LOS guard.
 // No wall is added, and neither nav.visible nor movement is mocked.
 const target=[-54.8,-7.4],player=[-53.37,-7.29];
 const context=fixture({...world.targets,escape:{position:target,i:world.nav.nearest(...target)}});
 const {nav,objective}=context;
 openExit(context);
 assert(nav.canWalk(...target));
 assert(nav.canWalk(...player));
 assert(nav.path(nav.start,nav.nearest(...player)).length>0);
 assert(nav.path(nav.start,objective.escape.i).length>0);
 assert(Math.hypot(player[0]-target[0],player[1]-target[1])<2.5);
 assert.equal(nav.visible(player,target),false,'the actual partition separates these floor points');
 assert.equal(objective.update(player),null);
 assert.equal(objective.state.escaped,false);
 assert.equal(objective.update([...target])?.code,'escaped','approaching on the correct side still works');
});
