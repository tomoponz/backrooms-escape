import assert from 'node:assert/strict';
import test from 'node:test';
import {createSourceWorldNavigation} from '../source-world-navigation.js';

function fixture(){
 const width=7,height=5,length=width*height;
 return createSourceWorldNavigation({version:1,step:1,minx:0,minz:0,width,height,
  free:'1'.repeat(length),heights:Array(length).fill(0),regions:Array(length).fill(0),edges:Array(length).fill(15),regionIds:['test'],
  clearance:0,anchors:{spawn:[0,2],exit:[6,2],enemy:[0,0]},
  gates:[{id:'door',barrier:{min:[2.9,-.1,-1],max:[3.1,2.4,5]},initiallyOpen:true}]});
}
function shortestLength(nav,start,end){
 if(!nav.open(start)||!nav.open(end))return 0;
 const queue=[[start,1]],seen=new Set([start]);
 for(let n=0;n<queue.length;n++){
  const [i,length]=queue[n];if(i===end)return length;
  for(const j of nav.neighbors(i))if(!seen.has(j)){seen.add(j);queue.push([j,length+1]);}
 }
 return 0;
}

test('repeated searches preserve shortest valid paths across disconnected and reopened gates',()=>{
 const nav=fixture();
 for(const open of [true,false,true,false,true]){
  nav.setGateOpen('door',open);
  // More than the 48 cached routes forces fresh searches with different origins.
  for(let start=0;start<nav.length;start+=2)for(let end=0;end<nav.length;end+=3){
   const route=nav.path(start,end);
   assert.equal(route.length,shortestLength(nav,start,end),`${start}->${end}, door open=${open}`);
   if(route.length){
    assert.equal(route[0],start);assert.equal(route.at(-1),end);
    for(let i=1;i<route.length;i++)assert(nav.neighbors(route[i-1]).includes(route[i]));
   }
  }
  assert.deepEqual(nav.path(nav.start,nav.exit),open?[14,15,16,17,18,19,20]:[]);
 }
 assert.deepEqual(nav.path(-1,nav.exit),[]);
 assert.deepEqual(nav.path(nav.start,nav.length),[]);
 assert.deepEqual(nav.path(nav.start,nav.start),[nav.start]);
});

test('returned routes remain independent after cache hits and subsequent searches',()=>{
 const nav=fixture(),first=nav.path(nav.start,nav.exit),expected=[...first];
 first.fill(-1);
 assert.deepEqual(nav.path(nav.start,nav.exit),expected);
 const retained=nav.path(nav.start,nav.exit);
 for(let start=0;start<nav.length;start++)nav.path(start,0);
 assert.deepEqual(retained,expected);
 nav.setGateOpen('door',false);
 assert.deepEqual(nav.path(nav.start,nav.exit),[]);
 nav.setGateOpen('door',true);
 assert.deepEqual(nav.path(nav.start,nav.exit),expected);
});
