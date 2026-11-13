import {M} from './engine.js';

export const ALMOND_WATER_ID = 'almond_water';
export const ALMOND_WATER_MODEL_URL = 'assets/models/almond-water.glb';
export const ALMOND_WATER_RESTORE = 60;
export const ALMOND_WATER_MAX_STACK = 3;
export const ALMOND_WATER_HEIGHT = .36;
export const ALMOND_WATER_PICKUP_RANGE = 1.6;

// The game remains responsible for stamina and sprint readiness. This effect
// only requests ordinary stamina restoration; it grants no other player state.
export function registerAlmondWater(inventory) {
  return inventory.register({
    id: ALMOND_WATER_ID,
    name: 'アーモンドウォーター',
    description: 'スタミナを最大60回復する。数字で選択しQで使用。所持上限3個。',
    maxStack: ALMOND_WATER_MAX_STACK,
    available: true,
    effect(context) {
      if(typeof context?.getStamina !== 'function' || typeof context?.restoreStamina !== 'function')
        return {ok:false,message:'今は使えません。'};
      const before = context.getStamina();
      if(!Number.isFinite(before)) return {ok:false,message:'今は使えません。'};
      if(before >= 100) return {ok:false,message:'スタミナは満タンです。'};
      if(context.restoreStamina(ALMOND_WATER_RESTORE) !== true)
        return {ok:false,message:'今は使えません。'};
      return {ok:true,message:'アーモンドウォーターを飲んで、スタミナが回復した。'};
    }
  }, {replace:true});
}

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
// These optional caches belong to the expanded source-model rooms. They use
// the already approved bottle, not additional models or a collection quota.
// Absence of a region leaves older maps unchanged. Coordinates are only
// candidates: floor support, clearance, region and an actual path must agree.
const SIDE_ROOM_CACHES = Object.freeze([
  {region:'original-far-west', centre:[-75.6,0]},
  {region:'original-southwest', centre:[-50.4,25.2]},
  {region:'original-far-southwest', centre:[-75.6,25.2]},
  {region:'original-southeast', centre:[0,17.1]},
  {region:'original-far-southeast', centre:[0,42.3]},
  {region:'original-south', centre:[-25.2,50.4]},
  {region:'original-south-southwest', centre:[-50.4,50.4]},
  {region:'original-far-south-southwest', centre:[-75.6,50.4]},
]);
function routeLeg(nav,from,to) {
  const indices=nav.path(from,to),points=indices.map(i=>nav.point(i)),distances=[0];
  for(let i=1;i<points.length;i++) distances.push(distances[i-1]+distance(points[i-1],points[i]));
  return {indices,points,distances,total:distances.at(-1)};
}
function deadEndRooms(nav) {
  if(!nav.maze?.edges||!nav.cellSize) return [];
  const degree=Array(nav.maze.columns*nav.maze.rows).fill(0);
  for(const edge of nav.maze.edges) if(edge.kind!=='wall'){degree[edge.a]++;degree[edge.b]++;}
  return degree.flatMap((count,i)=>{
    if(count!==1) return [];
    const centre=[nav.minx+(i%nav.maze.columns+.5)*nav.cellSize,
      nav.minz+(Math.floor(i/nav.maze.columns)+.5)*nav.cellSize];
    const index=nav.nearest(...centre);
    return index<0?[]:[{index,position:nav.point(index)}];
  });
}

// The first bottle stays near spawn. With maintenance supplied, three bottles
// support the initial search and two cover its longer branch. Prefer reachable
// dead-end rooms or side niches over putting every bottle directly on the route.
export function selectAlmondWaterPositions(nav,viaIndex) {
  const first=routeLeg(nav,nav.start,nav.exit);
  if(first.points.length<2) return [];
  if(viaIndex!==undefined&&(!Number.isInteger(viaIndex)||!nav.open(viaIndex)))
    throw new RangeError('Almond water maintenance position must be a walkable navigation index');
  const second=viaIndex===undefined?null:routeLeg(nav,nav.exit,viaIndex);
  if(second&&second.points.length<2) throw new RangeError('Almond water maintenance route must be reachable');
  const plans=[{leg:first,target:Math.min(3,first.total*.08),nearStart:true}];
  for(const fraction of second?[.42,.76]:[.28,.52,.74,.9]) plans.push({leg:first,target:first.total*fraction});
  if(second) for(const fraction of [.42,.8]) plans.push({leg:second,target:second.total*fraction});
  const protectedPoints=[nav.point(nav.exit),...(second?[nav.point(viaIndex)]:[])];
  const routePoints=[...first.points,...(second?.points??[])],rooms=deadEndRooms(nav),positions=[];
  const offRoute=p=>Math.min(...routePoints.map(q=>distance(p,q)));
  const safe=p=>nav.canWalk(...p)&&protectedPoints.every(q=>distance(p,q)>=3.5)&&
    positions.every(q=>distance(p,q)>=4)&&[[.35,0],[-.35,0],[0,.35],[0,-.35]]
      .every(([x,z])=>nav.canWalk(p[0]+x,p[1]+z));
  for(const {leg,target,nearStart} of plans) {
    const i=leg.distances.findIndex(d=>d>=target),base=leg.points[i];
    if(!base) continue;
    let chosen=null;
    if(!nearStart) {
      const branches=rooms.filter(room=>safe(room.position)&&offRoute(room.position)>=1.5).map(room=>{
        let nearest=0;
        for(let n=1;n<leg.points.length;n++) if(distance(room.position,leg.points[n])<distance(room.position,leg.points[nearest])) nearest=n;
        return {...room,nearest,along:Math.abs(leg.distances[nearest]-target)};
      }).filter(room=>room.along<=15&&distance(room.position,leg.points[room.nearest])<=10)
        .sort((a,b)=>a.along-b.along||a.index-b.index);
      for(const room of branches) {
        const detour=nav.path(leg.indices[room.nearest],room.index);
        if(detour.length>1&&(detour.length-1)*nav.step<=18){chosen=room.position;break;}
      }
      if(!chosen) {
        let best=-Infinity;
        for(const radius of [2,3,4.5]) for(let direction=0;direction<8;direction++) {
          const angle=direction*Math.PI/4,p=[base[0]+Math.cos(angle)*radius,base[1]+Math.sin(angle)*radius];
          if(!safe(p)||!nav.visible(base,p)) continue;
          const separation=offRoute(p);
          if(separation<1.5) continue;
          const walls=[[.8,0],[-.8,0],[0,.8],[0,-.8]].filter(([x,z])=>!nav.canWalk(p[0]+x,p[1]+z)).length;
          const score=walls*3+separation-radius*.25;
          if(score>best){best=score;chosen=p;}
        }
      }
    }
    if(!chosen) {
      const before=leg.points[Math.max(0,i-1)],after=leg.points[Math.min(leg.points.length-1,i+1)];
      const dx=after[0]-before[0],dz=after[1]-before[1],length=Math.hypot(dx,dz)||1;
      const side=positions.length%2?-1:1,offset=[base[0]-dz/length*.55*side,base[1]+dx/length*.55*side];
      chosen=safe(offset)&&nav.visible(base,offset)?offset:safe(base)?base:null;
    }
    if(chosen) positions.push([...chosen]);
  }
  if(Array.isArray(nav.regionIds)&&typeof nav.regionAt==='function'&&typeof nav.index==='function') {
    for(const {region,centre} of SIDE_ROOM_CACHES) {
      const regionIndex=nav.regionIds.indexOf(region);
      if(regionIndex<0) continue;
      // Search a small deterministic set of interior candidates, preferring
      // the room's outer areas instead of blocking a doorway or the main route.
      let chosen=null;
      for(const [dx,dz] of [[-7,-7],[7,7],[-7,7],[7,-7],[-5,0],[5,0],[0,-5],[0,5],[0,0]]) {
        const index=nav.index(centre[0]+dx,centre[1]+dz);
        if(!nav.open(index)) continue;
        const p=nav.point(index);
        if(nav.regionAt(...p)!==regionIndex||!safe(p)||offRoute(p)<4) continue;
        if(nav.path(nav.start,index).length<2) continue;
        chosen=p;break;
      }
      if(chosen)positions.push([...chosen]);
    }
  }
  return positions;
}

// Loader bounds already include the original GLB node transforms. Keep its
// geometry/textures intact, then centre and scale the loaded model to 36 cm.
export function almondWaterMatrix(model, position, floorHeight=0, yaw=0) {
  const {min,max}=model;
  if(!min||!max||![...min,...max,...position,floorHeight,yaw].every(Number.isFinite)||max[1]<=min[1])
    throw new TypeError('Almond water requires finite model bounds and a valid position');
  const scale=ALMOND_WATER_HEIGHT/(max[1]-min[1]);
  const centre=[(min[0]+max[0])/2,min[1],(min[2]+max[2])/2];
  return M.mul(M.pose(position[0],floorHeight+.003,position[1],yaw,scale),M.trs(centre.map(v=>-v)));
}

export function createAlmondWaterPickups({inventory,model,nav,viaIndex,positions=selectAlmondWaterPositions(nav,viaIndex)}) {
  if(!inventory?.add||!model?.meshes||!nav?.visible||!nav?.canWalk)
    throw new TypeError('Almond water pickups require an inventory, loaded model and navigation');
  const pickups=positions.map((position,index)=>{
    const p=[...position];
    if(p.length!==2||!p.every(Number.isFinite)||!nav.canWalk(...p))
      throw new RangeError('Almond water pickup must be on a walkable position');
    const instance={...model,visible:true,matrix:almondWaterMatrix(model,p,nav.floorAt(...p),index*Math.PI*.7)};
    return {id:`almond_water_${index+1}`,itemId:ALMOND_WATER_ID,position:p,model:instance,collected:false};
  });
  const models=pickups.map(p=>p.model);
  function nearest(player) {
    if(!Array.isArray(player)||player.length<2||!player.slice(0,2).every(Number.isFinite)) return null;
    let nearestPickup=null,nearestDistance=ALMOND_WATER_PICKUP_RANGE;
    for(const pickup of pickups) {
      if(pickup.collected) continue;
      const distance=Math.hypot(player[0]-pickup.position[0],player[1]-pickup.position[1]);
      if(distance<=nearestDistance&&nav.visible(player,pickup.position)) {
        nearestPickup=pickup;nearestDistance=distance;
      }
    }
    return nearestPickup;
  }
  function collect(player) {
    const pickup=nearest(player);
    if(!pickup) return {ok:false,reason:'missing',message:''};
    const result=inventory.add(ALMOND_WATER_ID,1);
    if(!result.ok) return {...result,message:result.reason==='full'?'アーモンドウォーターは3個まで持てます。':'今は拾えません。'};
    pickup.collected=true;pickup.model.visible=false;
    return {...result,pickup,message:'アーモンドウォーターを拾った。Iで所持品を開いて使える。'};
  }
  function reset() { for(const pickup of pickups){pickup.collected=false;pickup.model.visible=true;} }
  return {pickups,models,nearest,collect,reset};
}
