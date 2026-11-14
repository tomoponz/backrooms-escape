import assert from 'node:assert/strict';
import test from 'node:test';
import {createAdaptiveResolution} from '../adaptive-resolution.js';

test('sustained slow frames reduce scene resolution, including frames below 4 FPS',()=>{
 for(const seconds of [1/20,.25,1,5]){
  const adaptive=createAdaptiveResolution();let scale;
  for(let i=0;i<160;i++)scale=adaptive.sample(seconds);
  assert.equal(scale,.5,`frame time ${seconds}`);
 }
});
test('loading, hidden tabs and first resumed frames do not lower resolution',()=>{
 const adaptive=createAdaptiveResolution();
 for(let i=0;i<100;i++)assert.equal(adaptive.sample(5,false),1);
 assert.equal(adaptive.sample(300,true),1);
 for(let i=0;i<120;i++)assert.equal(adaptive.sample(1/60),1);
 adaptive.sample(300,false);
 assert.equal(adaptive.sample(300,true),1);
 for(const seconds of [0,-1,NaN,Infinity])assert.equal(adaptive.sample(seconds),1);
});
test('resolution recovers gradually after sustained fast frames and stays within bounds',()=>{
 const adaptive=createAdaptiveResolution();let scale;
 for(let i=0;i<160;i++)scale=adaptive.sample(.25);
 assert.equal(scale,.5);
 for(let i=0;i<240;i++)scale=adaptive.sample(1/60);
 assert.equal(scale,.5,'hold prevents immediate oscillation');
 let previous=scale;
 for(let i=0;i<2000;i++){
  scale=adaptive.sample(1/60);assert.ok(scale>=.5&&scale<=1);
  assert.ok(scale-previous<=.040001);previous=scale;
 }
 assert.equal(scale,1);
});
