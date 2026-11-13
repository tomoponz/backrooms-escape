// Ambient light and fog are spatial properties of the continuous world.
// Across each connector they blend between the two actual room atmospheres,
// so reversing direction or pausing never changes the target at a location.
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const mix = (a,b,t) => a + (b-a)*t;
const sourceLinks = new WeakMap();

function atmosphereLinks(world) {
  if(world.nav.links?.length)return world.nav.links;
  if(!world.layout)return [];
  if(sourceLinks.has(world.nav))return sourceLinks.get(world.nav);
  const links=[];
  for(const join of world.nav.metadata?.joins??[]){
    if(join.sides?.length!==2)continue;
    const [a,b]=join.sides,regions=[a,b].map(side=>world.stages.findIndex(stage=>stage.id===side.regionId));
    if(regions.some(index=>index<0))continue;
    links.push({ap:a.resolved,bp:b.resolved,regions,source:true,
      outdoor:[a,b].some(side=>world.layout.instances.some(instance=>instance.id===side.regionId&&instance.outdoor))});
  }
  sourceLinks.set(world.nav,links);return links;
}

export function atmosphereAt(world, x, z) {
  const nav=world.nav;
  const links=atmosphereLinks(world);
  for (let i=0;i<links.length;i++) {
    const link=links[i],a=link.ap,b=link.bp;
    const dx=b[0]-a[0],dz=b[1]-a[1],length2=dx*dx+dz*dz;
    if (!Number.isFinite(x)||!Number.isFinite(z)||length2<1e-9) continue;
    const length=Math.sqrt(length2),along=((x-a[0])*dx+(z-a[1])*dz)/length;
    const perpendicular=Math.abs((x-a[0])*dz-(z-a[1])*dx)/length;
    // A shared doorway is now under a metre deep. Fade across the adjoining
    // rooms instead of changing the light over that very short threshold.
    const before=link.source?(link.outdoor?3:2.5):i===2?1.2:2.5;
    const after=link.source?(link.outdoor?3:2.5):i===2?3:2.5;
    if(along< -before||along>length+after||perpendicular>1.45)continue;
    const w=smooth((along+before)/(length+before+after));
    const from=world.stages[link.regions[0]].atmosphere;
    const to=world.stages[link.regions[1]].atmosphere;
    return {ambient:mix(from.ambient,to.ambient,w),fogNear:mix(from.fogNear,to.fogNear,w),fogFar:mix(from.fogFar,to.fogFar,w),fog:from.fog.map((v,k)=>mix(v,to.fog[k],w))};
  }
  const index=Number.isFinite(x)&&Number.isFinite(z)?nav.regionAt(x,z):0;
  const a=world.stages[index]?.atmosphere??world.stages[0].atmosphere;
  return {ambient:a.ambient,fogNear:a.fogNear,fogFar:a.fogFar,fog:[...a.fog]};
}
