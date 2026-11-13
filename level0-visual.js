import {M} from './engine.js';
async function loadTexture(renderer,url){
 const response=await fetch(url);if(!response.ok)throw Error('Wallpaper unavailable: '+response.status);
 const image=await createImageBitmap(await response.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'}),g=renderer.gl,texture=g.createTexture();
 g.bindTexture(g.TEXTURE_2D,texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,image);g.generateMipmap(g.TEXTURE_2D);
 g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
 g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.REPEAT);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.REPEAT);image.close();return texture;
}
function createMesh(renderer,values,material){
 if(!values.positions.length)return null;
 const g=renderer.gl,vao=g.createVertexArray();g.bindVertexArray(vao);
 for(const [data,loc,width] of [[values.positions,0,3],[values.normals,1,3],[values.uvs,2,2]]){
  g.bindBuffer(g.ARRAY_BUFFER,g.createBuffer());g.bufferData(g.ARRAY_BUFFER,new Float32Array(data),g.STATIC_DRAW);
  g.enableVertexAttribArray(loc);g.vertexAttribPointer(loc,width,g.FLOAT,false,0,0);
 }
 g.bindVertexArray(null);return {vao,count:values.positions.length/3,mode:g.TRIANGLES,matrix:M.identity(),material};
}
function material(texture,color=[1,1,1,1],emissive=[0,0,0]){
 return {texture,color,emissive,unlit:0,cutoff:0,uv:[0,0,1,1],rotation:0};
}
function quad(group,points,normal,uv){
 for(const i of [0,1,2,0,2,3]){group.positions.push(...points[i]);group.normals.push(...normal);group.uvs.push(...uv[i])}
}
function group(){return {positions:[],normals:[],uvs:[]}}
export async function createLevel0Visual(renderer,nav,baked,originalLevel){
 const wallpaper=await loadTexture(renderer,'assets/textures/level0-wallpaper.jpg');
 const existingCarpet=baked?.meshes.find(m=>m.material?.name==='Existing carpet sample')?.material;
 const existingCeiling=originalLevel?.meshes.find(m=>m.material?.name==='Ceiling_1')?.material;
 if(!existingCarpet||!existingCeiling)throw Error('The existing carpet or ceiling texture is unavailable');
 const wallMat=material(wallpaper,[.88,.88,.84,1]);
 // Reuse the approved Baked Room carpet and the Level 0 ceiling material.
 const floorMat={...existingCarpet,color:[.88,.86,.78,1],uv:[0,0,1,1],rotation:0,emissive:[0,0,0]};
 const ceilingMat={...existingCeiling,color:[.85,.85,.80,1],uv:[0,0,1,1],rotation:0,tileRect:[.385,.05,.05,.07],emissive:[0,0,0]};
 const lightMat=material(renderer.white,[.86,.86,.72,1],[.12,.12,.09]);
 const chunks=new Map(),span=nav.cellSize*2,low=nav.minx,side=nav.columns/2;
 function chunk(x,z){let cx=Math.max(0,Math.min(side-1,Math.floor((x-low)/span))),cz=Math.max(0,Math.min(side-1,Math.floor((z-low)/span))),key=cx+','+cz;
  if(!chunks.has(key))chunks.set(key,{cx,cz,w:group(),f:group(),c:group(),l:group()});return chunks.get(key)}
 // Floor and ceiling align on world coordinates, eliminating cracks between tiles.
 for(let z=0;z<nav.rows;z++)for(let x=0;x<nav.columns;x++){
  const x0=low+x*nav.cellSize,z0=low+z*nav.cellSize,x1=x0+nav.cellSize,z1=z0+nav.cellSize,p=chunk((x0+x1)/2,(z0+z1)/2);
  const uv=[[x0/2,z0/2],[x1/2,z0/2],[x1/2,z1/2],[x0/2,z1/2]];
  quad(p.f,[[x0,0,z0],[x1,0,z0],[x1,0,z1],[x0,0,z1]],[0,1,0],uv);
  quad(p.c,[[x0,3,z0],[x0,3,z1],[x1,3,z1],[x1,3,z0]],[0,-1,0],[[x0/2,z0/2],[x0/2,z1/2],[x1/2,z1/2],[x1/2,z0/2]]);
  // Simple luminous panels are part of the authorized basic ceiling, not a model asset.
  if((x*7+z*11)%5!==0){
   let cx=(x0+x1)/2,cz=(z0+z1)/2;quad(p.l,[[cx-.72,2.985,cz-.19],[cx-.72,2.985,cz+.19],[cx+.72,2.985,cz+.19],[cx+.72,2.985,cz-.19]],[0,-1,0],[[0,0],[0,1],[1,1],[1,0]]);
  }
 }
 for(const [x0,z0,x1,z1] of nav.walls){
  // Split even long boundary walls at culling chunk boundaries, so no part of
  // a wall disappears when the camera leaves the wall's midpoint chunk.
  let dx=x1-x0,dz=z1-z0,ts=[0,1];
  for(let i=1;i<side;i++){
   let edge=low+i*span;
   if(Math.abs(dx)>1e-9){let t=(edge-x0)/dx;if(t>0&&t<1)ts.push(t)}
   if(Math.abs(dz)>1e-9){let t=(edge-z0)/dz;if(t>0&&t<1)ts.push(t)}
  }
  ts.sort((a,b)=>a-b);
  for(let i=1;i<ts.length;i++){
   let ax=x0+dx*ts[i-1],az=z0+dz*ts[i-1],bx=x0+dx*ts[i],bz=z0+dz*ts[i],len=Math.hypot(bx-ax,bz-az);
   if(len<1e-7)continue;let p=chunk((ax+bx)/2,(az+bz)/2),normal=[-(bz-az)/len,0,(bx-ax)/len];
   const u0=(Math.abs(dx)>Math.abs(dz)?ax:az)/2,u1=(Math.abs(dx)>Math.abs(dz)?bx:bz)/2,thickness=.05,nx=normal[0]*thickness,nz=normal[2]*thickness;
   // Both surfaces and the exposed edges belong to the same collision
   // centerline; .25 m clearance includes the .05 m half-thickness.
   for(const side of [-1,1])quad(p.w,[[ax+nx*side,0,az+nz*side],[bx+nx*side,0,bz+nz*side],[bx+nx*side,3,bz+nz*side],[ax+nx*side,3,az+nz*side]],normal.map(v=>v*side),[[u0,0],[u1,0],[u1,1.5],[u0,1.5]]);
   const tangent=[(bx-ax)/len,0,(bz-az)/len];
   quad(p.w,[[ax-nx,0,az-nz],[ax+nx,0,az+nz],[ax+nx,3,az+nz],[ax-nx,3,az-nz]],tangent.map(v=>-v),[[0,0],[.05,0],[.05,1.5],[0,1.5]]);
   quad(p.w,[[bx-nx,0,bz-nz],[bx+nx,0,bz+nz],[bx+nx,3,bz+nz],[bx-nx,3,bz-nz]],tangent,[[0,0],[.05,0],[.05,1.5],[0,1.5]]);
  }
 }
 const result=[];
 for(const p of chunks.values()){
  let meshes=[[p.w,wallMat],[p.f,floorMat],[p.c,ceilingMat],[p.l,lightMat]].map(([g,m])=>createMesh(renderer,g,m)).filter(Boolean);
  let x=low+p.cx*span,z=low+p.cz*span;
  result.push({visible:true,matrix:M.identity(),meshes,min:[x-.1,-.1,z-.1],max:[x+span+.1,3.1,z+span+.1]});
 }
 return result;
}
// Reuse one already-approved Original Backrooms socket mesh as a restrained
// wall detail. Its source model contains no room-sized geometry in this mesh.
export function createExistingWallDetails(original,nav){
 const socket=original?.meshes?.find(mesh=>mesh.material?.name==='PlugSocket');
 if(!socket)return [];
 const origin=[-8.9625,.3725,1.8585],objects=[],placed=[];
 for(const [ax,az,bx,bz] of nav.walls){
  if(Math.abs(ax-bx)>.001||Math.abs(bz-az)<1.8)continue;
  const z=(az+bz)/2,west=nav.canWalk(ax-.6,z),east=nav.canWalk(ax+.6,z);
  if(!west&&!east)continue;
  if(placed.some(p=>Math.hypot(p[0]-ax,p[1]-z)<5))continue;
  const x=ax+(east?.055:-.055),target=[x,.44,z];
  const transform=M.mul(M.pose(...target),M.pose(-origin[0],-origin[1],-origin[2]));
  objects.push({visible:true,matrix:transform,meshes:[socket],min:[-8.98,.30,1.80],max:[-8.94,.45,1.92]});placed.push([ax,z]);
  if(objects.length>=16)break;
 }
 return objects;
}