import assert from 'node:assert/strict';
import test from 'node:test';
import {AUTO_PICKUP_RANGE,collectNearbyFloorItems} from '../floor-pickup.js';
import {createInventory} from '../inventory.js';
import {createFlashlightPickup,FLASHLIGHT_ID} from '../flashlight-pickup.js';
import {createAlmondWaterPickups,registerAlmondWater,ALMOND_WATER_ID} from '../almond-water.js';

function fixture(){
 const inventory=createInventory({definitions:[]}),blocked=new Set();
 registerAlmondWater(inventory);
 inventory.register({id:FLASHLIGHT_ID,name:'Flashlight',available:true,maxStack:1});
 const nav={
  start:0,canWalk:()=>true,floorAt:()=>0,nearest:()=>1,
  point:i=>i===0?[-3,0]:[0,0],path:()=>[0,1],
  visible:(_player,target)=>!blocked.has(target.join(',')),
 };
 return {inventory,nav,block:position=>blocked.add(position.join(',')),unblock:position=>blocked.delete(position.join(','))};
}
function flashlightFixture(){
 const context=fixture(),visibility=[];
 const pickup=createFlashlightPickup({...context,position:[0,0],
  acquire:()=>context.inventory.add(FLASHLIGHT_ID,1),setVisible:visible=>visibility.push(visible)});
 return {...context,pickup,visibility};
}
function waterFixture(positions=[[0,0]]){
 const context=fixture(),model={min:[-.1,0,-.1],max:[.1,.36,.1],meshes:[]};
 const water=createAlmondWaterPickups({...context,model,positions});
 return {...context,water};
}

test('flashlight can be picked up from two metres, but not just beyond it',()=>{
 const {pickup,inventory,visibility}=flashlightFixture();
 for(const player of [[1.99,0],[2,0],[-2,0],[0,2]])assert.equal(pickup.nearest(player)?.id,FLASHLIGHT_ID);
 assert.equal(pickup.nearest([2.0001,0]),null);
 assert.equal(pickup.collect([2.0001,0]).reason,'not-near');
 assert.equal(inventory.count(FLASHLIGHT_ID),0);
 assert.equal(pickup.state.visible,true);
 assert.equal(pickup.collect([2,0]).ok,true);
 assert.equal(inventory.count(FLASHLIGHT_ID),1);
 assert.equal(pickup.state.visible,false);
 assert.deepEqual(visibility,[true,false]);
 assert.equal(pickup.collect([0,0]).reason,'already-owned');
 assert.equal(inventory.count(FLASHLIGHT_ID),1);
 pickup.dispose();
});

test('flashlight reach never bypasses blocked line of sight',()=>{
 const {pickup,inventory,block,unblock}=flashlightFixture();
 block([0,0]);
 assert.equal(pickup.nearest([1,0]),null);
 assert.equal(pickup.collect([1,0]).reason,'not-near');
 assert.equal(inventory.count(FLASHLIGHT_ID),0);
 assert.equal(pickup.state.visible,true);
 unblock([0,0]);
 assert.equal(pickup.collect([2,0]).ok,true);
 pickup.dispose();
});

test('flashlight resets to an unlit floor pickup for another run',()=>{
 const {pickup,inventory,visibility}=flashlightFixture();
 assert.equal(pickup.collect([2,0]).ok,true);
 assert.equal(pickup.toggle().on,true);
 inventory.reset();pickup.reset();
 assert.equal(pickup.state.owned,false);
 assert.equal(pickup.state.on,false);
 assert.equal(pickup.state.visible,true);
 assert.equal(pickup.collect([-2,0]).ok,true);
 assert.equal(pickup.state.on,false);
 assert.equal(inventory.count(FLASHLIGHT_ID),1);
 assert.deepEqual(visibility,[true,false,true,false]);
 pickup.dispose();
});

test('water can be picked up from two metres, but not just beyond it',()=>{
 const {water,inventory}=waterFixture();
 for(const player of [[1.99,0],[2,0],[-2,0],[0,2]])assert.equal(water.nearest(player),water.pickups[0]);
 assert.equal(water.nearest([2.0001,0]),null);
 assert.equal(water.collect([2.0001,0]).reason,'missing');
 assert.equal(inventory.count(ALMOND_WATER_ID),0);
 assert.equal(water.collect([2,0]).ok,true);
 assert.equal(inventory.count(ALMOND_WATER_ID),1);
 assert.equal(water.pickups[0].collected,true);
 assert.equal(water.models[0].visible,false);
 assert.equal(water.collect([0,0]).reason,'missing');
 assert.equal(inventory.count(ALMOND_WATER_ID),1);
});

test('water chooses the nearest visible bottle and cannot collect through an obstruction',()=>{
 const {water,inventory,block,unblock}=waterFixture([[.5,0],[1.9,0],[1.8,0],[2.0001,0]]);
 block([.5,0]);
 assert.equal(water.nearest([0,0]),water.pickups[2]);
 assert.equal(water.collect([0,0]).pickup,water.pickups[2]);
 assert.equal(water.collect([0,0]).pickup,water.pickups[1]);
 assert.equal(water.nearest([0,0]),null);
 assert.equal(water.collect([0,0]).reason,'missing');
 assert.equal(water.pickups[0].collected,false);
 assert.equal(water.pickups[0].model.visible,true);
 assert.equal(water.pickups[3].collected,false);
 assert.equal(inventory.count(ALMOND_WATER_ID),2);
 unblock([.5,0]);
 assert.equal(water.collect([0,0]).pickup,water.pickups[0]);
});

test('a full inventory leaves water on the floor and reset allows another run',()=>{
 const {water,inventory}=waterFixture();
 inventory.add(ALMOND_WATER_ID,3);
 const full=water.collect([2,0]);
 assert.equal(full.ok,false);
 assert.equal(full.reason,'full');
 assert.equal(inventory.count(ALMOND_WATER_ID),3);
 assert.equal(water.pickups[0].collected,false);
 assert.equal(water.models[0].visible,true);
 inventory.reset();
 assert.equal(water.collect([2,0]).ok,true);
 assert.equal(water.models[0].visible,false);
 inventory.reset();water.reset();
 assert.equal(water.pickups[0].collected,false);
 assert.equal(water.models[0].visible,true);
 assert.equal(water.collect([2,0]).ok,true);
 assert.equal(inventory.count(ALMOND_WATER_ID),1);
});

test('automatic flashlight collection waits for approach, checks walls and does not turn it on',()=>{
 const {pickup,nav,block,unblock,inventory}=flashlightFixture();
 const items={flashlight:pickup};
 assert.equal(collectNearbyFloorItems(nav.point(nav.start),items).light,null);
 assert.equal(collectNearbyFloorItems([AUTO_PICKUP_RANGE+.01,0],items).light,null);
 block([0,0]);
 assert.equal(collectNearbyFloorItems([.6,0],items).light,null);
 unblock([0,0]);
 assert.equal(collectNearbyFloorItems([AUTO_PICKUP_RANGE,0],items).light?.ok,true);
 assert.equal(pickup.state.on,false);
 assert.equal(collectNearbyFloorItems([0,0],items).light,null);
 assert.equal(inventory.count(FLASHLIGHT_ID),1);
 pickup.dispose();
});

test('automatic water respects capacity and leaves bottles on the floor behind walls',()=>{
 const {water,inventory,block,unblock}=waterFixture();
 const pick=()=>collectNearbyFloorItems([0,0],{
   water,canCarryWater:inventory.count(ALMOND_WATER_ID)<3,
 }).drink;
 inventory.add(ALMOND_WATER_ID,3);
 assert.equal(pick(),null);
 assert.equal(water.pickups[0].collected,false);
 inventory.reset();
 block([0,0]);
 assert.equal(pick(),null);
 unblock([0,0]);
 assert.equal(pick()?.ok,true);
 assert.equal(pick(),null);
 assert.equal(inventory.count(ALMOND_WATER_ID),1);
});
