import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readGLB,baseColorForMaterial} from '../renderer-resources.js';
import {MODEL_NAMES,optimizeGLB} from '../scripts/optimize-models.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const parse=buffer=>readGLB(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
function visit(value,callback){if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){callback(value,key,child);visit(value[key],callback)}}
function canonical({json,bytes}){
 const view=index=>{const {byteOffset,...metadata}=json.bufferViews[index];return {...metadata,payloadSha256:digest(bytes(index))}};
 const image=index=>({...json.images[index],bufferView:view(json.images[index].bufferView)});
 const texture=index=>({...json.textures[index],source:image(json.textures[index].source)});
 const result=structuredClone(json);
 for(const material of result.materials||[]){
  // These four map roles are absent from the existing renderer. Nothing else,
  // including material factors or extension metadata, may change in the copies.
  delete material.normalTexture;delete material.occlusionTexture;
  if(material.pbrMetallicRoughness)delete material.pbrMetallicRoughness.metallicRoughnessTexture;
  const legacy=material.extensions?.KHR_materials_pbrSpecularGlossiness;if(legacy)delete legacy.specularGlossinessTexture;
  visit(material,(_parent,key,value)=>{if(key.endsWith('Texture')&&Number.isInteger(value?.index))value.index=texture(value.index)});
 }
 // Resolve offsets/index rebasing before comparing the complete scene,
 // accessors, skins, animations and asset/source metadata.
 visit(result,(parent,key,value)=>{if(key==='bufferView'&&Number.isInteger(value))parent[key]=view(value)});
 delete result.bufferViews;delete result.images;delete result.textures;
 for(const buffer of result.buffers)delete buffer.byteLength;
 return result;
}

for(const name of MODEL_NAMES)test(`${name}: derived GLB keeps authored geometry, sampled pixels and material behavior`,()=>{
 const original=readFileSync(new URL(`../assets/models/${name}.glb`,import.meta.url));
 const output=readFileSync(new URL(`../assets/models/optimized/${name}.glb`,import.meta.url));
 const before=parse(original),after=parse(output),generated=optimizeGLB(original);
 assert.ok(output.length<original.length);
 assert.deepEqual(output,generated.buffer,'the checked-in artifact must be reproducible');
 assert.deepEqual(canonical(after),canonical(before),'only unused maps and their packed table entries may differ');
 const selectedSources=new Set();
 for(const material of before.json.materials)for(const slot of [baseColorForMaterial(before.json.asset,material).texture,material.emissiveTexture])if(slot)selectedSources.add(before.json.textures[slot.index].source);
 assert.deepEqual([...selectedSources].sort((a,b)=>a-b),generated.imageIndices);
 for(const [newIndex,oldIndex]of generated.viewIndices.entries())assert.deepEqual(after.bytes(newIndex),before.bytes(oldIndex),'retained binary data must be byte-identical');
 for(const index of generated.removedBufferViewIndices){
  assert.ok(before.json.images.some((image,imageIndex)=>image.bufferView===index&&!selectedSources.has(imageIndex)),'only unused image views may be removed');
  assert.ok(!before.json.accessors.some(accessor=>accessor.bufferView===index),'geometry/skin/animation accessor payloads must remain');
 }
 assert.equal(after.json.buffers[0].byteLength,after.bytes(after.json.bufferViews.length-1).byteLength+after.json.bufferViews.at(-1).byteOffset+(4-after.bytes(after.json.bufferViews.length-1).byteLength%4)%4);
});
