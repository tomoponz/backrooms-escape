import {M} from './engine.js';
import {SOURCE_WORLD_LAYOUT} from './source-world-layout.js';

const identity = M.identity;
const finiteBounds = {min:[-10000,-10000,-10000],max:[10000,10000,10000]};

function transformFor(instance) {
  const half=instance.yaw/2,scale=instance.uniformScale??1;
  return M.trs(instance.translation,[0,Math.sin(half),0,Math.cos(half)],[scale,scale,scale]);
}

function transformedBounds(source,matrix) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let corner=0;corner<8;corner++){
    const x=corner&1?source.max[0]:source.min[0],y=corner&2?source.max[1]:source.min[1],z=corner&4?source.max[2]:source.min[2];
    for(let axis=0;axis<3;axis++){
      const value=matrix[axis]*x+matrix[axis+4]*y+matrix[axis+8]*z+matrix[axis+12];
      min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);
    }
  }
  return {min,max};
}

function intersection(a,b) {
  const min=a.min.map((v,i)=>Math.max(v,b.min[i])),max=a.max.map((v,i)=>Math.min(v,b.max[i]));
  return min.some((v,i)=>v>max[i])?null:{min,max};
}

function applicableHoles(instance,material) {
  return (instance.holes??[]).filter(hole=>!hole.materials||hole.materials.includes(material.name));
}

/** Keep original VAOs, textures, material parameters, UVs and node transforms.
 * The only spatial changes are instance placement and the layout's explicit
 * small apertures/ownership overlaps. Multiple copies share GPU model data. */
export async function createSourceWorldVisual(renderer,layout=SOURCE_WORLD_LAYOUT,onProgress=()=>{}) {
  const sources=new Map(),paths=[...new Set(layout.instances.map(instance=>instance.model))];
  for(const [index,path] of paths.entries()){
    sources.set(path,await renderer.load(path));
    onProgress(index+1,paths.length,path);
  }
  const models=[],instances=[];
  for(const definition of layout.instances){
    const source=sources.get(definition.model),matrix=transformFor(definition),worldBounds=transformedBounds(source,matrix);
    const instanceModels=[];
    for(const [clipIndex,clip] of (definition.clipRegions??[finiteBounds]).entries()){
      const bounds=intersection(worldBounds,clip);if(!bounds)continue;
      // Material-scoped floor ownership removes only overlapping carpet at
      // Baked's existing mouth. Architectural meshes retain their own holes.
      const groups=new Map();
      for(const mesh of source.meshes){
        const holes=applicableHoles(definition,mesh.material),key=JSON.stringify(holes);
        if(!groups.has(key))groups.set(key,{holes,meshes:[]});
        groups.get(key).meshes.push({...mesh,matrix:M.mul(matrix,mesh.matrix)});
      }
      for(const [groupIndex,group] of [...groups.values()].entries()){
        if(group.holes.length>8)throw new Error(`Too many apertures in ${definition.id}; renderer supports eight.`);
        const model={id:`${definition.id}:${clipIndex}:${groupIndex}`,instanceId:definition.id,visible:true,
          matrix:identity(),meshes:group.meshes,min:[...bounds.min],max:[...bounds.max],
          clipOrigin:[0,0,0],holes:group.holes.map(h=>({min:[...h.min],max:[...h.max]})),
          worldClipBounds:{min:[...clip.min],max:[...clip.max]},sourceModel:definition.model,
          atmosphere:layout.atmospheres?.[definition.atmosphere]};
        models.push(model);instanceModels.push(model);
      }
    }
    instances.push({id:definition.id,definition,models:instanceModels,bounds:worldBounds});
  }

  // This is the only generated environment surface: the short, specified
  // threshold into the existing grass slope. Its exact triangles also feed
  // collision generation. No replacement room walls or floors are generated.
  const seamGroups=new Map();
  for(const surface of layout.seamSurfaces??[]){
    const key=JSON.stringify(surface.materialSource);
    if(!seamGroups.has(key))seamGroups.set(key,{surface,triangles:[]});
    seamGroups.get(key).triangles.push(...surface.triangles);
  }
  let seamTriangleCount=0;
  for(const {surface,triangles} of seamGroups.values()){
    const reference=layout.instances.find(instance=>instance.id===surface.materialSource.instanceId);
    const material=sources.get(reference?.model)?.meshes.find(mesh=>mesh.material.name===surface.materialSource.name)?.material;
    if(!material)throw new Error('The approved threshold surface material is unavailable.');
    const positions=[],normals=[],uvs=[];
    for(const [a,b,c] of triangles){
      const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
      const normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
      const length=Math.hypot(...normal)||1;
      for(const point of [a,b,c]){positions.push(...point);normals.push(...normal.map(v=>v/length));uvs.push(point[0]*.5,point[2]*.5)}
    }
    const model=renderer.createGeometry(positions,normals,uvs,material);
    model.id='outdoor-threshold';model.instanceId=surface.regionId;
    model.atmosphere=layout.atmospheres?.dreamcore;
    models.push(model);seamTriangleCount+=triangles.length;
  }
  const gates=new Map();
  for(const definition of layout.gates??[]){
    const source=sources.get(definition.sourceModel);
    if(!source)throw new Error('The approved exit-door source was not loaded.');
    const selected=source.meshes.filter(mesh=>definition.sourceMaterials.includes(mesh.material.name));
    if(!selected.length)throw new Error('The authored exit-door geometry is unavailable.');
    const half=definition.yaw/2,scale=definition.uniformScale??1;
    const placement=M.mul(M.trs(definition.position,[0,Math.sin(half),0,Math.cos(half)],[scale,scale,scale]),
      M.pose(...definition.sourceAnchor.map(value=>-value)));
    const clip=transformedBounds(definition.sourceBounds,placement);
    const model={id:definition.id,instanceId:definition.instanceId,visible:true,matrix:placement,
      meshes:selected,min:[...definition.sourceBounds.min],max:[...definition.sourceBounds.max],
      worldClipBounds:clip,clipOrigin:[0,0,0],holes:[],sourceModel:definition.sourceModel,
      atmosphere:layout.atmospheres?.original};
    let open=false;
    const gate={definition,model,get open(){return open},setOpen(value){
      open=!!value;model.holes=open?[{min:[...definition.opening.min],max:[...definition.opening.max]}]:[];
    }};
    gate.setOpen(definition.initiallyOpen);gates.set(definition.id,gate);models.push(model);
  }
  return {models,instances,sources,gates,stats:{sourceFiles:sources.size,sourceInstances:instances.length,
    originalMeshInstances:instances.reduce((sum,instance)=>sum+instance.models.reduce((count,model)=>count+model.meshes.length,0),0),
    seamTriangleCount,joins:layout.joins.length,authoredGates:gates.size}};
}
