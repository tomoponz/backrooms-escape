import { Navigation } from './core.js';
import { M } from './engine.js';
import { makeContinuousWorld } from './continuous-world.js';

// All environment meshes are the user's existing, approved local assets.
// loadWorld places them in one coordinate system with continuous corridors.
export const STAGE_DEFINITIONS = Object.freeze([
  { id:'level0',number:'01',title:'LEVEL 0',subtitle:'黄色い迷宮',modelUrl:'assets/models/level0.glb',scale:1,
    objectiveType:'fuse',objectiveLabel:'電源ヒューズ',next:'baked',enemyEnabled:true,
    intro:'濡れたカーペット。止まらない蛍光灯。3本のヒューズを回収し、保守区画への電源を復旧する。',
    exitLabel:'保守区画へ',ambient:.63,fog:[.035,.032,.018],fogNear:9,fogFar:36,
    objectiveNames:['A系統ヒューズ','B系統ヒューズ','C系統ヒューズ'],
    notes:['壁の向こうから、足音が一拍遅れて聞こえる。','非常灯は出口ではない。緑の信号だけを追え。','走る音は、あれにも届いている。'] },
  { id:'baked',number:'02',title:'MAINTENANCE',subtitle:'焼き付いた部屋',modelUrl:'assets/models/baked-room.glb',scale:3,
    objectiveType:'relay',objectiveLabel:'中継器',next:'original',enemyEnabled:true,
    intro:'光だけが焼き付いた、狭い保守区画。3台の中継器を再接続し、記憶の区画への扉を開く。',
    exitLabel:'記憶区画へ',ambient:.82,fog:[.075,.059,.024],fogNear:7,fogFar:20,
    objectiveNames:['中継器 A','中継器 B','中継器 C'],
    notes:['ここでは立ち止まる時間が長いほど危険だ。','壁の継ぎ目に、まだ電気が流れている。','信号が揃えば、次の扉が応答する。'] },
  { id:'original',number:'03',title:'THE ORIGINAL',subtitle:'見覚えのある場所',modelUrl:'assets/models/original-backrooms.glb',scale:1,
    objectiveType:'archive',objectiveLabel:'記録片',next:'dreamcore',enemyEnabled:true,
    intro:'誰もが見たことのある、誰も来たことのない場所。3枚の記録片を集め、最後の信号を繋ぐ。',
    exitLabel:'外の光へ',ambient:.54,fog:[.044,.041,.022],fogNear:8,fogFar:27,
    objectiveNames:['記録片 01','記録片 02','記録片 03'],
    notes:['同じ壁紙でも、ここは最初の部屋ではない。','記録には、外の光が写っていた。','最後の扉を閉めるまで、振り返るな。'] },
  { id:'dreamcore',number:'04',title:'AFTER THE HUM',subtitle:'蛍光灯の向こう側',modelUrl:'assets/models/dreamcore.glb',scale:1,
    objectiveType:'signal',objectiveLabel:'帰還信号',next:null,enemyEnabled:false,
    intro:'蛍光灯の音が消えた。広い草地に散らばる3つの帰還信号を集め、最後の出口へ歩く。',
    exitLabel:'帰還口',ambient:1.04,fog:[.55,.72,.74],fogNear:130,fogFar:300,
    objectiveNames:['帰還信号 01','帰還信号 02','帰還信号 03'],notes:['草は風に揺れていない。けれど、空は広い。'] }
]);

export class WorldNavigation extends Navigation {
  constructor(data) { super(data); this.clearance=data.clearance??.21;this.maxSlope=data.maxSlope??.72; }
  floorAt(x,z) {
    if(!this.heights) return this.floor;
    const fx=Math.max(0,Math.min(this.width-1,(x-this.minx)/this.step));
    const fz=Math.max(0,Math.min(this.height-1,(z-this.minz)/this.step));
    const c=Math.floor(fx),r=Math.floor(fz),c1=Math.min(c+1,this.width-1),r1=Math.min(r+1,this.height-1);
    const tx=fx-c,tz=fz-r,at=(cx,rz)=>this.heights[rz*this.width+cx];
    return (at(c,r)*(1-tx)+at(c1,r)*tx)*(1-tz)+(at(c,r1)*(1-tx)+at(c1,r1)*tx)*tz;
  }
  canWalk(x,z) {
    if(!Number.isFinite(x)||!Number.isFinite(z)||!this.open(this.index(x,z)))return false;
    const bx=Math.floor(x/2),bz=Math.floor(z/2),radius2=this.clearance*this.clearance;
    for(let a=bx-1;a<=bx+1;a++)for(let b=bz-1;b<=bz+1;b++)for(const [ax,az,cx,cz] of this.buckets.get(a+','+b)||[]){
      const dx=cx-ax,dz=cz-az,den=dx*dx+dz*dz;
      if(den<1e-12)continue;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/den));
      if((x-ax-dx*t)**2+(z-az-dz*t)**2<radius2)return false;
    }
    return true;
  }
  neighboursSafe(i){return this.neighbors(i);}
  neighbors(i) {
    if(!this.open(i))return [];
    const result=super.neighbors(i);
    if(!this.heights)return result;
    return result.filter(n=>Math.abs(this.heights[n]-this.heights[i])<this.step*this.maxSlope);
  }
  path(start,end) {
    if(!this.open(start)||!this.open(end))return [];
    return super.path(start,end);
  }
  nearestSafe(x,z) {
    const initial=this.index(x,z);
    if(this.open(initial)&&this.canWalk(...this.point(initial)))return initial;
    let best=-1,distance=Infinity;
    for(let i=0;i<this.free.length;i++)if(this.open(i)){
      const p=this.point(i),d=(p[0]-x)**2+(p[1]-z)**2;
      if(d<distance&&this.canWalk(...p)){best=i;distance=d;}
    }
    return best;
  }
  nearest(x,z){return this.nearestSafe(x,z);}
  visible(a,b) {
    if(!a||!b)return false;
    const dx=b[0]-a[0],dz=b[1]-a[1],steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
    for(let i=0;i<=steps;i++)if(!this.canWalk(a[0]+dx*i/steps,a[1]+dz*i/steps))return false;
    return true;
  }
  move(pos,dx,dz) {
    if(!Number.isFinite(dx)||!Number.isFinite(dz))return pos;
    const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.065));
    for(let k=0;k<count;k++){
      const x=pos[0]+dx/count,z=pos[1]+dz/count;
      if(this.canWalk(x,pos[1]))pos[0]=x;
      if(this.canWalk(pos[0],z))pos[1]=z;
    }
    return pos;
  }
}

export function createWorld(data) {
  if(data?.version!==1||!data.stages)throw Error('Invalid world navigation data');
  const stages=STAGE_DEFINITIONS.map(def=>{
    const raw=data.stages[def.id];if(!raw)throw Error('Missing navigation: '+def.id);
    const nav=new WorldNavigation(raw),matrix=M.pose(0,0,0,0,def.scale);
    const objectives=nav.fuses.map((index,i)=>({id:`${def.id}-${i}`,index,position:nav.point(index),name:def.objectiveNames[i]??def.objectiveLabel,type:def.objectiveType}));
    const route=nav.path(nav.start,objectives[0]?.index??nav.exit);
    const spawn=nav.point(nav.start),nextPoint=nav.point(route[Math.min(4,route.length-1)]??nav.exit);
    return {...def,nav,matrix,model:{url:def.modelUrl,matrix},objectives,
      spawn,spawnYaw:Math.atan2(nextPoint[0]-spawn[0],-(nextPoint[1]-spawn[1])),
      exit:nav.point(nav.exit),hiding:nav.hiding.map(i=>nav.point(i)),patrol:nav.patrol.map(i=>nav.point(i)),
      atmosphere:{ambient:def.ambient,fog:def.fog,fogNear:def.fogNear,fogFar:def.fogFar}};
  });
  const byId=Object.fromEntries(stages.map(stage=>[stage.id,stage]));
  return {stages,byId,start:stages[0],get:id=>byId[id]??null,next:stage=>byId[typeof stage==='string'?byId[stage]?.next:stage?.next]??null};
}

// The legacy campaign factory above remains a historical fixture. Runtime
// rendering and navigation now share the authored original-model layout.
export async function loadWorld(url='assets/source-world-navigation.json') {
  const [{SOURCE_WORLD_LAYOUT:layout},{createForbiddenRoomNavigation}]=await Promise.all([
    import('./source-world-layout.js'),import('./forbidden-room-navigation.js')
  ]);
  const response=await fetch(url);
  if(response.ok===false)throw Error(`${url}: HTTP ${response.status}`);
  const {nav,lockers}=createForbiddenRoomNavigation(await response.json(),layout);
  const instances=layout.instances;
  const regionIds=nav.regionIds??[...new Set(instances.map(instance=>instance.regionId??instance.id))];
  const anchorPoint=anchor=>anchor?.position?.length===3?[anchor.position[0],anchor.position[2]]:anchor?.position;
  const anchorIndex=(name,fallback)=>{
    if(nav.open(fallback))return fallback;
    const point=anchorPoint(layout.anchors?.[name]);
    const index=point?nav.nearest(...point):-1;
    if(!nav.open(index))throw Error(`Missing walkable source-world ${name} anchor`);
    return index;
  };
  const maintenanceIndex=anchorIndex('maintenance',nav.maintenance);
  const escapeIndex=anchorIndex('escape',nav.escape);
  const breakers=(layout.breakers??[]).map(breaker=>{
    const index=nav.nearest(...breaker.stand);
    if(!nav.open(index))throw Error(`Missing walkable floor for ${breaker.id}`);
    return {id:breaker.id,label:breaker.label,i:index,position:nav.point(index)};
  });
  const targets={exit:{i:nav.exit,position:nav.point(nav.exit)},maintenance:{i:maintenanceIndex,position:nav.point(maintenanceIndex)},escape:{i:escapeIndex,position:nav.point(escapeIndex)},...(breakers.length?{breakers}:{})};
  const regionTitles={vr:'蛍光灯の区画','original-west':'西側の部屋','original-middle':'中央の部屋','original-east':'東側の部屋',baked:'窪んだ床の部屋',dreamcore:'外の景色'};
  for(const instance of instances)if(instance.label&&/[^\x00-\x7f]/.test(instance.label))regionTitles[instance.id]??=instance.label;
  const stages=regionIds.map((id,index)=>{
    const metadata=layout.regions?.find?.(region=>region.id===id)??{};
    const instance=instances.find(item=>(item.regionId??item.id)===id)??instances[0];
    const modelName=String(instance.model??instance.asset??id);
    const source=STAGE_DEFINITIONS.find(item=>modelName.includes(item.id))??STAGE_DEFINITIONS[0];
    const authored=anchorPoint(metadata.spawn)??anchorPoint(instance.spawn)??(instance.translation?[instance.translation[0],instance.translation[2]]:null);
    const spawnIndex=index===0?nav.start:authored?nav.nearest(...authored):-1;
    const spawn=nav.open(spawnIndex)&&nav.regionAt(...nav.point(spawnIndex))===index?nav.point(spawnIndex):null;
    return {...source,id,number:String(index+1).padStart(2,'0'),title:regionTitles[id]??metadata.title??instance.label??source.title,
      nav,spawn,spawnYaw:layout.anchors?.spawn?.yaw??0,objectives:[],hiding:[],patrol:[],
      atmosphere:metadata.atmosphere??layout.atmospheres?.[instance.atmosphere]??{ambient:source.ambient,fog:[...source.fog],fogNear:source.fogNear,fogFar:source.fogFar}};
  });
  const byId=Object.fromEntries(stages.map(stage=>[stage.id,stage]));
  const returnSide=nav.metadata?.joins?.find(join=>join.id==='vr-middle')?.sides?.find(side=>side.regionId==='vr');
  const returnIndex=returnSide?nav.nearest(...returnSide.resolved):-1;
  const returnVia=nav.open(returnIndex)?{id:'marked-return-route',i:returnIndex,position:nav.point(returnIndex),regionIndex:nav.regionAt(...nav.point(returnIndex)),optional:true}:null;
  return {returnVia,id:'original-world-v1',layout,stages,nav,lockers,start:stages[0],targets,byId,get:id=>byId[id]??null,next:()=>null};
}
