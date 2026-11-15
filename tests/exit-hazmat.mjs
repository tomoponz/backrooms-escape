import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {SOURCE_WORLD_LAYOUT} from '../source-world-layout.js';
import {createForbiddenRoomNavigation} from '../forbidden-room-navigation.js';
import {createSkinstealerDirector,SKINSTEALER_RULES} from '../skinstealer-director.js';

const layout=structuredClone(SOURCE_WORLD_LAYOUT);
const data=JSON.parse(readFileSync(new URL('../assets/source-world-navigation.json',import.meta.url),'utf8'));
const {nav}=createForbiddenRoomNavigation(data,layout);
const anchor=layout.anchors.exitHazmat;
const pos=[anchor.position[0],anchor.position[2]];
const exit=nav.point(nav.exit);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const make=()=>createSkinstealerDirector({nav,normalStation:{position:pos,yaw:anchor.yaw}});

test('exit hazmat is indoors and off every tested return path; those paths allow the encounter',()=>{
 const actor=make().reset('normal').position;
 assert(nav.canWalk(...actor));
 assert.equal(nav.regionIds[nav.regionAt(...actor)],'original-east');
 assert(nav.visible(exit,actor));
 assert(distance(exit,actor)>2&&distance(exit,actor)<SKINSTEALER_RULES.noticeDistance);
 const maintenance=layout.anchors.maintenance.position;
 const returnStarts=[nav.start,nav.nearest(maintenance[0],maintenance[2]),...layout.breakers.map(b=>nav.nearest(...b.stand))];
 for(const start of returnStarts){
  const route=nav.path(start,nav.exit).map(i=>nav.point(i));
  assert(route.length>1);
  assert(route.every(p=>distance(p,actor)>1),'keep the authored position out of the walking line');
  assert(route.slice(0,-1).some(p=>distance(p,actor)<=SKINSTEALER_RULES.noticeDistance&&nav.visible(p,actor)),'the return path sees the actor before reaching the door');
 }
});

test('only powered standard stages the stationary human encounter, with unchanged grace',()=>{
 const actor=make();
 const human=actor.reset('normal');
 for(let i=0;i<200;i++)assert.deepEqual(actor.update({dt:.05,player:exit}).position,human.position);
 assert.equal(actor.state.phase,'human');
 assert.equal(actor.update({dt:.05,player:nav.point(nav.start),powerRestored:true}).phase,'human');
 // While an active Bacteria chase suppresses notice, the same human waits
 // in place. The existing transform/retreat begins as soon as notice is allowed.
 assert.equal(actor.update({dt:.05,player:exit,powerRestored:true,mayNotice:false}).phase,'human');
 assert.deepEqual(actor.state.position,human.position);
 assert.equal(actor.update({dt:.05,player:exit,powerRestored:true}).phase,'transforming');
 for(let i=1;i<=80;i++){
  const s=actor.update({dt:.05,player:human.position,powerRestored:true});
  assert.deepEqual(s.position,human.position);
  assert.equal(s.caught,false);
  assert.equal(s.phase,i<36?'transforming':i<80?'grace':'monster');
 }
 const s=actor.update({dt:.05,player:human.position,powerRestored:true,canCapture:false});
 assert.equal(s.phase,'monster');
 assert.equal(s.caught,false);
 assert.equal(actor.update({dt:.05,player:human.position,powerRestored:true}).caught,true);
 assert.deepEqual(actor.reset('normal').position,human.position);
});

test('easy retains prior west patrol and explore has no Skinstealer',()=>{
 const legacy=createSkinstealerDirector({nav});
 const actor=make();
 assert.deepEqual(actor.reset('easy'),legacy.reset('easy'));
 const player=nav.point(nav.start);
 for(let i=0;i<50;i++)assert.deepEqual(actor.update({dt:.05,player,powerRestored:true}),legacy.update({dt:.05,player}));
 assert.equal(actor.reset('explore').phase,'disabled');
 assert.equal(actor.update({dt:.05,player:exit,powerRestored:true}).phase,'disabled');
});
