// Wall writing uses only transparent 2D ink on the existing approved rooms.
// The tiny render-only quads are never added to navigation or collision.
export const WALL_WRITING_SITES=Object.freeze([
  Object.freeze({id:'vr-wall-writing',center:[-30.225010,1.35,-20.189],normal:[1,0,0],right:[0,0,-1],width:2.2,height:1.2,offset:.01,texture:'assets/wall-writing/sparse.png'}),
  Object.freeze({id:'central-wall-writing',center:[-20.869,1.35,-5.312516],normal:[0,0,-1],right:[-1,0,0],width:2.2,height:1.2,offset:.01,texture:'assets/wall-writing/dense.png'}),
]);
const validEye=eye=>Array.isArray(eye)&&eye.length===3&&eye.every(Number.isFinite);
async function loadBitmap(url){
  const response=await fetch(url);if(!response.ok)throw Error(`Wall writing image HTTP ${response.status}`);
  return createImageBitmap(await response.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
}
function vertices(site){
  const {center:c,normal:n,right:r,width:w,height:h,offset}=site;
  const point=(x,y)=>[c[0]+n[0]*offset+r[0]*x*w/2,c[1]+y*h/2,c[2]+n[2]*offset+r[2]*x*w/2];
  const a=point(-1,-1),b=point(1,-1),d=point(-1,1),e=point(1,1);
  return {positions:[...a,...b,...e,...a,...e,...d],normals:Array(6).fill(n).flat(),
    // Canvas/image rows are uploaded top-to-bottom. UV zero is the top row.
    uvs:[0,1,1,1,1,0,0,1,1,0,0,0]};
}
/** Loads the two 2D images and creates transparent-mask overlays. Append models
 * after the room geometry in the render list. Call update(camera.eye) before
 * each render: the renderer draws both faces, so this prevents rear visibility.
 * dispose() releases the two textures; geometry remains renderer-owned.
 */
export async function createWallWriting(renderer,{loadImage=loadBitmap}={}){
  const gl=renderer?.gl;
  if(!gl||typeof renderer.createGeometry!=='function'||typeof loadImage!=='function')throw new TypeError('Wall writing requires a renderer and image loader');
  const models=[],textures=[];let disposed=false;
  try{
    for(const site of WALL_WRITING_SITES){
      const bitmap=await loadImage(site.texture);let texture;
      try{
        texture=gl.createTexture();if(!texture)throw Error('Cannot allocate wall writing texture');textures.push(texture);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      }finally{bitmap?.close?.()}
      const v=vertices(site),model=renderer.createGeometry(v.positions,v.normals,v.uvs,
        {texture,color:[1,1,1,1],emissive:[0,0,0],unlit:0,cutoff:.12,uv:[0,0,1,1],rotation:0});
      model.id=site.id;model.visible=false;models.push(model);
    }
  }catch(error){for(const model of models)model.visible=false;for(const texture of textures)gl.deleteTexture(texture);throw error}
  function update(eye){
    for(let i=0;i<models.length;i++){
      const s=WALL_WRITING_SITES[i];
      models[i].visible=!disposed&&validEye(eye)&&s.normal.reduce((sum,n,k)=>sum+n*(eye[k]-s.center[k]),0)>s.offset;
    }
  }
  function dispose(){if(disposed)return;disposed=true;for(const model of models)model.visible=false;for(const texture of textures)gl.deleteTexture(texture)}
  return Object.freeze({models,update,dispose});
}
