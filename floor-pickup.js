// Automatic collection is deliberately closer than the existing manual reach.
// The pickup adapters retain ownership, inventory limits and line-of-sight checks.
export const AUTO_PICKUP_RANGE=1;

export function collectNearbyFloorItems(player,{flashlight,water,canCarryWater=true}={}){
  const collect=(pickup)=>{
    const target=pickup?.nearest(player);
    if(!target||Math.hypot(player[0]-target.position[0],player[1]-target.position[1])>AUTO_PICKUP_RANGE)return null;
    const result=pickup.collect(player);
    return result.ok?result:null;
  };
  const light=collect(flashlight);
  const drink=canCarryWater?collect(water):null;
  return {light,drink};
}
