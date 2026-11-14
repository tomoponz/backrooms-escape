// Repack optional runtime copies; never overwrite the authored source GLBs.
// Keep every geometry/animation buffer view and every image sampled by the
// renderer. Only unused material maps and their unreferenced payloads are cut.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readGLB,baseColorForMaterial} from '../renderer-resources.js';

export const MODEL_NAMES=Object.freeze(['flashlight','hazmat','skinstealer','warning-signs-set','office-chair','electrical-box','sculpture-bust-roza','vent']);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const arrayBuffer=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const textureInfo=(key,value)=>key.endsWith('Texture')&&value&&typeof value==='object'&&Number.isInteger(value.index);
// JSON.stringify normalizes authored -0 matrix entries to 0. Keep every parsed
// numeric value, including signed zero, when rewriting only the packed tables.
function serializeJSON(value){
 if(typeof value==='number'&&Object.is(value,-0))return '-0';
 if(Array.isArray(value))return '['+value.map(serializeJSON).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+':'+serializeJSON(item)).join(',')+'}';
 return JSON.stringify(value);
}
function walk(value,visit){
 if(!value||typeof value!=='object')return;
 for(const [key,child]of Object.entries(value)){visit(value,key,child);walk(value[key],visit)}
}

export function optimizeGLB(input){
 const sourceBytes=input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
 const sourceBuffer=arrayBuffer(sourceBytes),{json:source,bytes}=readGLB(sourceBuffer);
 assert.equal(source.buffers.length,1,'Only the existing single embedded buffer is supported');
 const json=structuredClone(source),removedMaterialMaps=[];
 for(const [index,material]of (json.materials||[]).entries()){
  const keep=new Set([baseColorForMaterial(json.asset,material).texture,material.emissiveTexture].filter(Boolean));
  walk(material,(parent,key,value)=>{if(textureInfo(key,value)&&!keep.has(value)){removedMaterialMaps.push({material:index,slot:key,texture:value.index});delete parent[key]}});
 }
 const selectedTextureIndices=new Set();
 for(const material of json.materials||[])walk(material,(_parent,key,value)=>{if(textureInfo(key,value))selectedTextureIndices.add(value.index)});
 const textureIndices=[...selectedTextureIndices].sort((a,b)=>a-b),textureMap=new Map(textureIndices.map((old,index)=>[old,index]));
 const imageIndices=[...new Set(textureIndices.map(index=>{
  const image=source.textures[index]?.source;assert.ok(Number.isInteger(image)&&source.images[image],'Selected texture needs an embedded source image');return image;
 }))].sort((a,b)=>a-b),imageMap=new Map(imageIndices.map((old,index)=>[old,index]));
 for(const material of json.materials||[])walk(material,(_parent,key,value)=>{if(textureInfo(key,value))value.index=textureMap.get(value.index)});
 json.textures=textureIndices.map(index=>({...structuredClone(source.textures[index]),source:imageMap.get(source.textures[index].source)}));
 json.images=imageIndices.map(index=>structuredClone(source.images[index]));
 const referencedViews=new Set();
 walk(json,(_parent,key,value)=>{if(key==='bufferView'){assert.ok(Number.isInteger(value));referencedViews.add(value)}});
 const unusedImageViews=new Set((source.images||[]).flatMap((image,index)=>!imageMap.has(index)&&Number.isInteger(image.bufferView)?[image.bufferView]:[]));
 const viewIndices=source.bufferViews.map((_view,index)=>index).filter(index=>!unusedImageViews.has(index)||referencedViews.has(index));
 const viewMap=new Map(viewIndices.map((old,index)=>[old,index]));
 const parts=[];let offset=0;
 const views=viewIndices.map(index=>{
  const payload=bytes(index),padded=new Uint8Array(Math.ceil(payload.byteLength/4)*4);padded.set(payload);parts.push(padded);
  const view={...structuredClone(source.bufferViews[index]),byteOffset:offset};offset+=padded.byteLength;return view;
 });
 // Current files use standard bufferView references (accessors/images/skins).
 // Remap each reference, including sparse-accessor references if ever present.
 walk(json,(parent,key,value)=>{if(key==='bufferView'){assert.ok(viewMap.has(value),'A retained reference must not lose its buffer view');parent[key]=viewMap.get(value)}});
 json.bufferViews=views;json.buffers[0].byteLength=offset;
 const binary=new Uint8Array(offset);let p=0;for(const part of parts){binary.set(part,p);p+=part.length}
 const text=Buffer.from(serializeJSON(json)),jsonChunk=Buffer.alloc(Math.ceil(text.length/4)*4,32);jsonChunk.set(text);
 // Preserve any unknown GLB chunks byte-for-byte, replacing only JSON and BIN.
 const chunks=[];const inputView=new DataView(sourceBuffer);
 for(let start=12;start<sourceBytes.byteLength;){
  const length=inputView.getUint32(start,true),kind=inputView.getUint32(start+4,true);
  const payload=kind===0x4e4f534a?jsonChunk:kind===0x004e4942?binary:sourceBytes.slice(start+8,start+8+length);
  const header=Buffer.alloc(8);header.writeUInt32LE(payload.length);header.writeUInt32LE(kind,4);chunks.push(header,payload);start+=8+length;
 }
 const header=Buffer.alloc(12),length=12+chunks.reduce((sum,chunk)=>sum+chunk.length,0);
 header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(length,8);
 const output=Buffer.concat([header,...chunks]);const checked=readGLB(arrayBuffer(output));
 for(const [old,index]of viewMap)assert.deepEqual(checked.bytes(index),bytes(old),'Retained view bytes must match');
 return {buffer:output,json,removedMaterialMaps,textureIndices,imageIndices,viewIndices,
  removedImageIndices:(source.images||[]).map((_image,index)=>index).filter(index=>!imageMap.has(index)),
  removedBufferViewIndices:source.bufferViews.map((_view,index)=>index).filter(index=>!viewMap.has(index))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const flag=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1]};
 const root=fileURLToPath(new URL('../',import.meta.url)),outputDir=resolve(flag('--output')||resolve(root,'assets/models/optimized'));
 assert.notEqual(outputDir,resolve(root,'assets/models'),'Do not overwrite source models');mkdirSync(outputDir,{recursive:true});
 const results=[];
 for(const name of MODEL_NAMES){
  const original=readFileSync(resolve(root,`assets/models/${name}.glb`)),result=optimizeGLB(original),target=resolve(outputDir,`${name}.glb`);
  writeFileSync(target,result.buffer);
  results.push({name,source:`assets/models/${name}.glb`,target:`assets/models/optimized/${name}.glb`,output:target,
   originalBytes:original.length,optimizedBytes:result.buffer.length,reductionPercent:100*(1-result.buffer.length/original.length),
   originalGzipBytes:gzipSync(original,{level:6}).length,optimizedGzipBytes:gzipSync(result.buffer,{level:6}).length,
   originalSha256:hash(original),optimizedSha256:hash(result.buffer),removedMaterialMaps:result.removedMaterialMaps,
   retainedTextureIndices:result.textureIndices,retainedImageIndices:result.imageIndices,retainedBufferViewIndices:result.viewIndices,
   removedImageIndices:result.removedImageIndices,removedBufferViewIndices:result.removedBufferViewIndices});
 }
 const total=key=>results.reduce((sum,row)=>sum+row[key],0);
 const report={generator:'node scripts/optimize-models.mjs',notes:['Original files remain unchanged.','Only maps unused by the current renderer are removed; visible images are copied without re-encoding.','All retained binary buffer views, including geometry, skin and animation data, are byte-identical.','gzip figures are deterministic local level6 estimates; actual HTTP transfer must be verified after deployment.'],models:results,
  totals:Object.fromEntries(['originalBytes','optimizedBytes','originalGzipBytes','optimizedGzipBytes'].map(key=>[key,total(key)]))};
 if(flag('--report')){mkdirSync(dirname(resolve(flag('--report'))),{recursive:true});writeFileSync(resolve(flag('--report')),JSON.stringify(report,null,2)+'\n')}
 console.log(JSON.stringify({models:results.map(({name,originalBytes,optimizedBytes,reductionPercent})=>({name,originalBytes,optimizedBytes,reductionPercent})),totals:report.totals},null,2));
}
