import assert from 'node:assert/strict';
import test from 'node:test';
import {beginModelLoadBatch,endModelLoadBatch,loadModelBuffer} from '../model-source.js';

const model='assets/models/hazmat.glb';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const bytes=value=>new Uint8Array([value]).buffer;
const response=buffer=>({ok:true,arrayBuffer:async()=>buffer});
async function withFetch(fetcher,check){
 const previous=globalThis.fetch;
 globalThis.fetch=fetcher;
 try{await check()}finally{endModelLoadBatch();globalThis.fetch=previous}
}

test('renderer and rig share one in-flight request and one body read',async()=>{
 const network=deferred(),body=bytes(1);let requests=0,bodyReads=0;
 await withFetch(()=>{requests++;return network.promise},async()=>{
  beginModelLoadBatch([model]);
  const renderer=loadModelBuffer(model),rig=loadModelBuffer(model);
  assert.equal(renderer,rig);
  assert.equal(requests,1);
  network.resolve({ok:true,arrayBuffer:async()=>{bodyReads++;return body}});
  assert.deepEqual(await Promise.all([renderer,rig]),[body,body]);
  assert.equal(bodyReads,1);
 });
});

test('sequential readers share bytes, then release the model after its second reader',async()=>{
 let requests=0;
 await withFetch(async()=>response(bytes(++requests)),async()=>{
  beginModelLoadBatch([model]);
  const renderer=await loadModelBuffer(model),rig=await loadModelBuffer(model);
  assert.equal(renderer,rig);
  assert.equal(requests,1);
  assert.notEqual(await loadModelBuffer(model),renderer);
  assert.notEqual(await loadModelBuffer(model),renderer);
  assert.equal(requests,3,'subsequent reads must not retain another cached pair');
 });
});

test('ending a batch releases an unused second read and disables caching',async()=>{
 let requests=0;
 await withFetch(async()=>response(bytes(++requests)),async()=>{
  beginModelLoadBatch([model]);
  const first=await loadModelBuffer(model);
  endModelLoadBatch();
  endModelLoadBatch();
  assert.notEqual(await loadModelBuffer(model),first);
  assert.notEqual(await loadModelBuffer(model),first);
  assert.equal(requests,3);
 });
});

test('models outside the startup list and calls outside a batch remain uncached',async()=>{
 let requests=0;
 await withFetch(async()=>response(bytes(++requests)),async()=>{
  beginModelLoadBatch([model]);
  const other='assets/models/dreamcore.glb';
  const [a,b]=await Promise.all([loadModelBuffer(other),loadModelBuffer(other)]);
  assert.notEqual(a,b);
  endModelLoadBatch();
  const [c,d]=await Promise.all([loadModelBuffer(model),loadModelBuffer(model)]);
  assert.notEqual(c,d);
  assert.equal(requests,4);
 });
});

test('HTTP failure is not retained and a retry can still serve both readers',async()=>{
 let requests=0,failedBodyRead=false;
 await withFetch(async()=>++requests===1?{ok:false,status:503,arrayBuffer(){failedBodyRead=true}}:response(bytes(2)),async()=>{
  beginModelLoadBatch([model]);
  await assert.rejects(loadModelBuffer(model),/hazmat\.glb: HTTP 503/);
  assert.equal(failedBodyRead,false);
  const renderer=loadModelBuffer(model),rig=loadModelBuffer(model);
  assert.equal(renderer,rig);
  assert.equal(await renderer,await rig);
  assert.equal(requests,2);
 });
});

test('network and body-read rejections allow a fresh request',async()=>{
 for(const phase of ['network','body']){
  let requests=0;const failure=new Error(`${phase} failed`);
  await withFetch(async()=>{
   requests++;
   if(requests>1)return response(bytes(2));
   if(phase==='network')throw failure;
   return {ok:true,arrayBuffer:async()=>{throw failure}};
  },async()=>{
   beginModelLoadBatch([model]);
   await assert.rejects(loadModelBuffer(model),error=>error===failure);
   assert.deepEqual(new Uint8Array(await loadModelBuffer(model)),new Uint8Array([2]));
   assert.equal(requests,2);
  });
 }
});

test('two readers of a failed in-flight request can retry after rejection',async()=>{
 const network=deferred();let requests=0;
 await withFetch(()=>++requests===1?network.promise:Promise.resolve(response(bytes(2))),async()=>{
  beginModelLoadBatch([model]);
  const renderer=loadModelBuffer(model),rig=loadModelBuffer(model);
  const results=Promise.allSettled([renderer,rig]);
  network.reject(new Error('connection lost'));
  assert.deepEqual((await results).map(result=>result.status),['rejected','rejected']);
  assert.deepEqual(new Uint8Array(await loadModelBuffer(model)),new Uint8Array([2]));
  assert.equal(requests,2);
 });
});

test('late completion or rejection from a closed batch cannot affect a new batch',async()=>{
 for(const rejectOld of [false,true]){
  const oldNetwork=deferred();let requests=0;
  await withFetch(()=>++requests===1?oldNetwork.promise:Promise.resolve(response(bytes(requests))),async()=>{
   beginModelLoadBatch([model]);
   const old=loadModelBuffer(model),oldResult=Promise.allSettled([old]);
   endModelLoadBatch();
   beginModelLoadBatch([model]);
   const current=await loadModelBuffer(model);
   if(rejectOld)oldNetwork.reject(new Error('obsolete failure'));
   else oldNetwork.resolve(response(bytes(1)));
   await oldResult;
   assert.equal(await loadModelBuffer(model),current);
   assert.equal(requests,2);
   assert.notEqual(await loadModelBuffer(model),current);
   assert.equal(requests,3);
  });
 }
});

test('startup finally cleanup releases bytes when a later parser fails',async()=>{
 let requests=0;
 await withFetch(async()=>response(bytes(++requests)),async()=>{
  await assert.rejects((async()=>{
   beginModelLoadBatch([model]);
   try{await loadModelBuffer(model);throw new Error('invalid rig')}
   finally{endModelLoadBatch()}
  })(),/invalid rig/);
  await loadModelBuffer(model);
  assert.equal(requests,2);
 });
});
