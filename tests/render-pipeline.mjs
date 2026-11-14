import assert from 'node:assert/strict';
import test from 'node:test';
import {planResolution} from '../render-pipeline.js';

test('lightweight quality avoids MSAA while standard quality keeps four samples',()=>{
 for(const viewport of [
  {cssWidth:960,cssHeight:720,dpr:1},
  {cssWidth:1920,cssHeight:1080,dpr:2},
  {cssWidth:390,cssHeight:844,dpr:3},
 ])for(const scale of [1,.75,.5]){
  const high=planResolution({...viewport,quality:'high',scale});
  const low=planResolution({...viewport,quality:'low',scale});
  assert.equal(high.samples,4);
  assert.equal(high.bloom,.55);
  assert.equal(low.samples,0);
  assert.equal(low.bloom,0);
  assert(high.width>0&&high.height>0&&low.width>0&&low.height>0);
  assert(low.outputWidth*low.outputHeight<=1600*900);
  assert(high.outputWidth*high.outputHeight<=2560*1440);
 }
});

test('default and unknown qualities retain standard rendering and invalid sizes stay disabled',()=>{
 const viewport={cssWidth:960,cssHeight:720,dpr:1};
 assert.deepEqual(planResolution(viewport),planResolution({...viewport,quality:'high'}));
 assert.deepEqual(planResolution({...viewport,quality:'unknown'}),planResolution(viewport));
 assert.equal(planResolution({...viewport,cssWidth:0,quality:'low'}),null);
 assert.equal(planResolution({...viewport,cssHeight:0,quality:'high'}),null);
});
