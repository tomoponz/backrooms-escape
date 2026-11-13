// Recolour only the existing Bacteria's materials, preserving its geometry,
// skinning buffers and texture references.  A very subdued neutral rim light
// makes the black silhouette legible without making the body pale.
export function applyBacteriaMaterial(actor){
 if(!actor||!Array.isArray(actor.meshes)||!actor.meshes.length)throw new TypeError('Bacteria actor has no meshes');
 if(actor.meshes.some(mesh=>!mesh?.material))throw new TypeError('Bacteria mesh has no material');
 for(const mesh of actor.meshes){
  const original=mesh.material;
  const alpha=Number.isFinite(original.color?.[3])?original.color[3]:1;
  mesh.material={...original,color:[.028,.030,.029,alpha],emissive:[.003,.003,.003],rim:.035,unlit:0};
 }
 return actor;
}
