import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {Renderer} from '../engine.js';
import {GLResources,readGLB,materialImageSources} from '../renderer-resources.js';

const bustSource='https://sketchfab.com/3d-models/sculpture-bust-of-roza-loewenfeld-fc6e731a0131471ba8e45511c7ea9996';
const indices=json=>[...materialImageSources(json)].sort((a,b)=>a-b);

test('material selection retains shared colour/emission images and ignores unsampled maps',()=>{
 const json={textures:[{source:3},{source:0},{source:1},{source:2}],materials:[
  {pbrMetallicRoughness:{baseColorTexture:{index:2},metallicRoughnessTexture:{index:3}},normalTexture:{index:1},emissiveTexture:{index:0},emissiveFactor:[0,0,0]},
  {pbrMetallicRoughness:{baseColorTexture:{index:0}},normalTexture:{index:0}},
 ]};
 assert.deepEqual(indices(json),[1,3]);
 assert.deepEqual(indices({}),[]);
});

test('approved bust legacy diffuse is retained with existing PBR precedence',()=>{
 const material={extensions:{KHR_materials_pbrSpecularGlossiness:{diffuseTexture:{index:0},specularGlossinessTexture:{index:1}}}};
 const json={asset:{extras:{source:bustSource}},textures:[{source:2},{source:0},{source:1}],materials:[material]};
 assert.deepEqual(indices(json),[2]);
 assert.deepEqual(indices({...json,asset:{}}),[]);
 material.pbrMetallicRoughness={baseColorTexture:{index:2}};
 assert.deepEqual(indices(json),[1]);
});

function fixture(){
 const chunks=[],bufferViews=[];let length=0;
 const add=bytes=>{const view=bufferViews.length;bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});const padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);padded.set(bytes);chunks.push(padded);length+=padded.length;return view};
 for(const tag of [11,22,33,44])add(Buffer.from([tag]));
 const positions=add(Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer));
 const uv=add(Buffer.from(new Float32Array([0,0,1,0,0,1]).buffer));
 const json={asset:{version:'2.0'},buffers:[{byteLength:length}],bufferViews,
  images:[0,1,2,3].map(bufferView=>({bufferView,mimeType:'image/png'})),
  textures:[{source:3},{source:0},{source:1},{source:2}],
  materials:[{pbrMetallicRoughness:{baseColorTexture:{index:2},metallicRoughnessTexture:{index:3}},normalTexture:{index:1},emissiveTexture:{index:0},emissiveFactor:[1,1,1]}],
  accessors:[{bufferView:positions,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:uv,componentType:5126,count:3,type:'VEC2'}],
  meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},material:0}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
 const text=Buffer.from(JSON.stringify(json));const padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);padded.set(text);
 const header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
 header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+length,8);
 jsonHeader.writeUInt32LE(padded.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);binHeader.writeUInt32LE(length);binHeader.writeUInt32LE(0x004e4942,4);
 const raw=Buffer.concat([header,jsonHeader,padded,binHeader,...chunks]);return raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
}

async function withRenderer(failUpload,check){
 const previousFetch=globalThis.fetch,previousBitmap=globalThis.createImageBitmap;
 const records={decoded:[],closed:[],uploads:[],deletedTextures:[],mipmaps:0};let bound,id=0;
 const gl={TEXTURE0:33984,TEXTURE_2D:3553,RGBA:6408,UNSIGNED_BYTE:5121,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,LINEAR_MIPMAP_LINEAR:9987,LINEAR:9729,ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,STATIC_DRAW:35044,TRIANGLES:4,
  createTexture(){return {id:++id}},deleteTexture(t){records.deletedTextures.push(t)},createBuffer(){return {id:++id}},deleteBuffer(){},createVertexArray(){return {id:++id}},deleteVertexArray(){},
  activeTexture(){},bindTexture(_target,texture){bound=texture},texImage2D(...args){assert.deepEqual(args.slice(0,5),[3553,0,6408,6408,5121]);const bitmap=args[5];records.uploads.push({tag:bitmap.tag,texture:bound});if(bitmap.tag===failUpload)throw Error('upload failed')},generateMipmap(){records.mipmaps++},texParameteri(){},bindVertexArray(){},bindBuffer(){},bufferData(){},enableVertexAttribArray(){},disableVertexAttribArray(){},vertexAttribPointer(){},vertexAttrib3f(){},vertexAttrib2f(){}};
 const renderer={gl,_assertActive(){},_pendingLoads:new Set(),_resources:new GLResources(gl),bounds:{},white:{white:true}};
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>fixture()});
 globalThis.createImageBitmap=async(blob,options)=>{assert.deepEqual(options,{premultiplyAlpha:'none',colorSpaceConversion:'none'});const tag=new Uint8Array(await blob.arrayBuffer())[0];records.decoded.push(tag);return {tag,close(){records.closed.push(tag)}}};
 try{await check(renderer,records)}finally{renderer._resources.dispose();globalThis.fetch=previousFetch;globalThis.createImageBitmap=previousBitmap}
}

test('load keeps sparse source indices, decoded pixels and bitmap ownership intact',async()=>{
 await withRenderer(null,async(renderer,r)=>{
  const model=await Renderer.prototype.load.call(renderer,'fixture');
  assert.deepEqual(r.decoded,[22,44],'normal/roughness images must not be decoded');
  assert.deepEqual(r.closed,[22,44]);assert.equal(r.mipmaps,2);
  assert.equal(model.meshes[0].material.texture,r.uploads[0].texture);
  assert.equal(model.meshes[0].material.emissiveTexture,r.uploads[1].texture);
  assert.deepEqual(model.meshes[0].material.emissive,[.18,.18,.18]);
  assert.equal(model.meshes[0].count,3);assert.equal(renderer._pendingLoads.size,0);
  assert.equal(renderer._resources.handles.get('Texture').size,2);
 });
});

test('a selected image upload failure closes bitmaps and releases partial GPU allocations',async()=>{
 await withRenderer(44,async(renderer,r)=>{
  await assert.rejects(Renderer.prototype.load.call(renderer,'fixture'),/upload failed/);
  assert.deepEqual(r.decoded,[22,44]);assert.deepEqual(r.closed,[22,44]);
  assert.equal(r.deletedTextures.length,2);assert.equal(renderer._pendingLoads.size,0);
  assert.equal(renderer._resources.handles.size,0);
 });
});

test('all shipped GLBs retain their actual base/emissive image roles',()=>{
 const expected={
  'almond-water':[0],bacteria:[],'baked-room-original':[0],'cardboard-box':[0],dreamcore:[0,1],'electrical-box':[0],flashlight:[0,3],hazmat:[1],level0:Array.from({length:27},(_,i)=>i),locker:[0],'office-chair':[0],'original-backrooms':[0,1,2,3,4],'sculpture-bust-roza':[0],skinstealer:[0],vent:[0],'warning-signs-set':[0],
 };
 let before=0,after=0;
 for(const [name,selected]of Object.entries(expected)){
  const raw=readFileSync(new URL(`../assets/models/${name}.glb`,import.meta.url));
  const {json}=readGLB(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  assert.deepEqual(indices(json),selected,name);
  before+=(json.images||[]).length;after+=selected.length;
 }
 assert.equal(before,68);assert.equal(after,47);
});
