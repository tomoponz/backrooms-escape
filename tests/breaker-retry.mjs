import assert from 'node:assert/strict';
import {createEscapeObjective} from '../escape-objective.js';
import {createHorrorDirector} from '../horror-director.js';

const nav={
  length:6,step:2,start:0,exit:4,open:i=>Number.isInteger(i)&&i>=0&&i<6,
  visible:()=>true,point:i=>[i*2,0],
  neighbors:i=>[i-1,i+1].filter(j=>j>=0&&j<6),
  path:(from,to)=>Array.from({length:Math.abs(to-from)+1},(_,i)=>from+i*Math.sign(to-from)),
};
const objective=createEscapeObjective(nav,{
  maintenance:{i:1},breakers:[{id:'second',i:2}],escape:{i:5},
});
const interact=id=>objective.interact([...objective.breakers.find(b=>b.id===id).position],id);
assert.equal(interact('second').code,'breaker-restored');
const partial=objective.state.restored;
objective.reset(partial);
assert.equal(objective.state.restoredCount,1);
assert.equal(objective.guidance().id,'maintenance');
assert.equal(interact('second').code,'already-restored');
assert.equal(interact('maintenance').code,'power-restored');
const complete=objective.state.restored;
assert.equal(objective.interact(nav.point(nav.exit),'exit').code,'exit-opened');
assert.equal(objective.update(nav.point(5)).code,'escaped');
objective.reset(complete);
assert.equal(objective.state.powerRestored,true);
assert.equal(objective.state.doorOpened,false);
assert.equal(objective.state.escaped,false);
assert.equal(objective.guidance().id,'exit');
objective.reset();
assert.equal(objective.state.restoredCount,0);
assert.equal(objective.state.phase,'find-exit');
objective.reset(['invalid','second','second']);
assert.deepEqual(objective.state.restored,['second']);

const single=createEscapeObjective(nav,{maintenance:{i:1}});
single.reset(['maintenance']);
assert.equal(single.state.powerRestored,true);
single.reset();
assert.equal(single.state.powerRestored,false);

const mood=createHorrorDirector({regionIds:['a','b'],neighbours:{a:['b']}});
mood.notify('power-restored',{region:'a',restored:2,total:2,quiet:true});
assert.equal(mood.stage,2);
assert.ok(mood.darkRegions.includes('a'));
assert.equal(mood.update(0.1,{}).cues.length,0);
console.log('Breaker retry regression checks passed.');
