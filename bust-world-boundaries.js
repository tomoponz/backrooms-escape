// Local, bounded physics enclosure for the approved bust scene.  Collision
// walls come from the same world-space source geometry as the game's nav;
// they are only an approximation of visual triangles, not a replacement for
// the player's existing navigation or a guarantee for arbitrary map regions.
import * as CANNON from './vendor/cannon-es-0.20.0/cannon-es.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const round=x=>Math.round(x*100)/100;

// Liang-Barsky: clip the infinite-area source segments to this small scene.
function clipSegment(s,minX,maxX,minZ,maxZ){
  const [x0,z0,x1,z1]=s,dx=x1-x0,dz=z1-z0;let lo=0,hi=1;
  for(const [p,q] of [[-dx,x0-minX],[dx,maxX-x0],[-dz,z0-minZ],[dz,maxZ-z0]]){
    if(Math.abs(p)<1e-12){if(q<0)return null;continue}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return null;
  }
  return [x0+lo*dx,z0+lo*dz,x0+hi*dx,z0+hi*dz];
}

/**
 * Add a finite floor, geometry-derived walls and four distant containment
 * barriers. `center` is [x,z], coordinates are metres in the game's world.
 * The caller owns stepping and dynamic bodies, and may call dispose to reset.
 * A flat local floor is required; this must never cover a pit or mixed levels.
 */
export function createBustWorldBoundaries({world,nav,center,halfExtent=5,material}={}){
  if(!world?.addBody||!world?.removeBody||!nav?.canWalk||!nav?.floorAt||!Array.isArray(nav.segments)||
     !Array.isArray(center)||center.length!==2||!center.every(Number.isFinite)||
     !Number.isFinite(halfExtent)||halfExtent<2||halfExtent>8)throw new TypeError('Invalid bust physics enclosure');
  const [cx,cz]=center;if(!nav.canWalk(cx,cz))throw new RangeError('Bust center must be walkable');
  const floor=nav.floorAt(cx,cz);if(!Number.isFinite(floor))throw new RangeError('Bust floor is unavailable');
  // Verify every open sampled cell is supported at the same elevation. The
  // specific far-west site has no pits; do not reuse this on sloped/holey maps.
  let checked=0;
  for(let dx=-halfExtent;dx<=halfExtent+1e-9;dx+=.5)for(let dz=-halfExtent;dz<=halfExtent+1e-9;dz+=.5){
    const x=cx+dx,z=cz+dz;if(!nav.canWalk(x,z))continue;
    const y=nav.floorAt(x,z);if(!Number.isFinite(y)||Math.abs(y-floor)>.08)throw new RangeError('Bust enclosure must have one flat floor');checked++;
  }
  if(checked<9)throw new RangeError('Insufficient floor support');
  const bodies=[];
  const box=(half,position,yaw=0,tag='wall')=>{
    const body=new CANNON.Body({mass:0,material});
    body.addShape(new CANNON.Box(new CANNON.Vec3(...half)));
    body.position.set(...position);if(yaw)body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),yaw);
    body.userData={bustBoundary:tag};world.addBody(body);bodies.push(body);return body;
  };
  // Limited box, not an infinite plane. Top surface is the verified floor.
  box([halfExtent,.05,halfExtent],[cx,floor-.05,cz],0,'floor');
  const minX=cx-halfExtent,maxX=cx+halfExtent,minZ=cz-halfExtent,maxZ=cz+halfExtent;
  let wallCount=0;const seen=new Set();
  for(const s of nav.segments){
    if(!Array.isArray(s)||s.length<6||!s.slice(0,6).every(Number.isFinite)||s[5]<floor+.03||s[4]>floor+3)continue;
    if(Math.max(s[0],s[2])<minX||Math.min(s[0],s[2])>maxX||Math.max(s[1],s[3])<minZ||Math.min(s[1],s[3])>maxZ)continue;
    const t=clipSegment(s,minX,maxX,minZ,maxZ);if(!t)continue;
    const [ax,az,bx,bz]=t,dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.08)continue;
    const y0=clamp(s[4],floor-.04,floor+3),y1=clamp(s[5],floor-.04,floor+3);if(y1<y0)continue;
    const a=[round(ax),round(az)],b=[round(bx),round(bz)];
    const pair=(a[0]<b[0]||a[0]===b[0]&&a[1]<=b[1])?[...a,...b]:[...b,...a];
    const key=[...pair,round(y0),round(y1)].join(',');if(seen.has(key))continue;seen.add(key);
    // A small thickness and endpoint overlap reduce tunnelling/cracks. The
    // caller should use substeps and cap speeds for fast moving bodies.
    box([len/2+.04,Math.max((y1-y0)/2,.025),.06],[(ax+bx)/2,(y0+y1)/2,(az+bz)/2],-Math.atan2(dz,dx),'source-wall');wallCount++;
  }
  // Stop pieces escaping the finite simulation/floor. These are invisible
  // local safety barriers, not asserted to be authored map geometry.
  const r=halfExtent,t=.08,h=1.6;
  box([t,h,r],[minX-t,floor+h,cz],0,'limit');box([t,h,r],[maxX+t,floor+h,cz],0,'limit');
  box([r+2*t,h,t],[cx,floor+h,minZ-t],0,'limit');box([r+2*t,h,t],[cx,floor+h,maxZ+t],0,'limit');
  // A source-wall segment is a projection of the original geometry, not the
  // exact visual triangles.  Enforce a second conservative sweep through the
  // same navigation grid the player uses.  Pass the body's pre-step X/Z and,
  // when possible, its pre-step quaternion.  The return value says whether a
  // safe pose was found; callers should reset the scene if valid is false.
  function constrainBody(body,previousXZ,previousQuaternion=body?.previousQuaternion){
    const invalid=()=>{
      if(body?.position&&Array.isArray(previousXZ)&&previousXZ.length===2&&previousXZ.every(Number.isFinite)&&
         previousXZ[0]>=minX&&previousXZ[0]<=maxX&&previousXZ[1]>=minZ&&previousXZ[1]<=maxZ&&nav.canWalk(...previousXZ)){
        body.position.x=previousXZ[0];body.position.z=previousXZ[1];body.aabbNeedsUpdate=true;
      }
      if(body?.quaternion&&previousQuaternion&&[previousQuaternion.x,previousQuaternion.y,previousQuaternion.z,previousQuaternion.w].every(Number.isFinite))body.quaternion.copy(previousQuaternion);
      if(body?.velocity){body.velocity.x=0;body.velocity.z=0}
      body?.angularVelocity?.setZero?.();
      return {valid:false,blocked:true,hitX:false,hitZ:false,rotationReverted:false};
    };
    if(!body?.position||!body?.velocity||!body?.updateAABB||!nav.move||
       !Array.isArray(previousXZ)||previousXZ.length!==2||!previousXZ.every(Number.isFinite)||
       !Number.isFinite(body.position.x)||!Number.isFinite(body.position.z))return invalid();
    const desired=[body.position.x,body.position.z],clearance=Number.isFinite(nav.clearance)?nav.clearance:.2;
    function extents(){
      body.aabbNeedsUpdate=true;body.updateAABB();const a=body.aabb,p=body.position;
      if(![a.lowerBound.x,a.lowerBound.z,a.upperBound.x,a.upperBound.z].every(Number.isFinite))return null;
      // nav.canWalk already applies its own 0.2m clearance.  Only extend the
      // sample envelope by the portion of the body's AABB exceeding that.
      return [Math.min(0,a.lowerBound.x-p.x+clearance),Math.max(0,a.upperBound.x-p.x-clearance),
        Math.min(0,a.lowerBound.z-p.z+clearance),Math.max(0,a.upperBound.z-p.z-clearance)];
    }
    function safeAt(x,z,e){
      if(!e)return false;
      for(const [ox,oz] of [[0,0],[e[0],e[2]],[e[0],e[3]],[e[1],e[2]],[e[1],e[3]]]){
        const px=x+ox,pz=z+oz;
        if(px<minX||px>maxX||pz<minZ||pz>maxZ||!nav.canWalk(px,pz))return false;
        const y=nav.floorAt(px,pz);if(!Number.isFinite(y)||Math.abs(y-floor)>.08)return false;
      }
      return true;
    }
    let e=extents(),rotationReverted=false;
    if(!safeAt(...previousXZ,e)){
      if(!previousQuaternion||![previousQuaternion.x,previousQuaternion.y,previousQuaternion.z,previousQuaternion.w].every(Number.isFinite))return invalid();
      body.quaternion.copy(previousQuaternion);body.angularVelocity?.scale?.(.15,body.angularVelocity);
      e=extents();rotationReverted=true;
      if(!safeAt(...previousXZ,e))return invalid();
    }
    const origin=[...previousXZ],delta=[desired[0]-origin[0],desired[1]-origin[1]];
    const centerTarget=nav.move([...origin],delta[0],delta[1]);
    if(!Array.isArray(centerTarget)||!centerTarget.slice(0,2).every(Number.isFinite))return invalid();
    const dx=centerTarget[0]-origin[0],dz=centerTarget[1]-origin[1];
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.04));
    if(steps>256)return invalid();
    let x=origin[0],z=origin[1],hitX=Math.abs(centerTarget[0]-desired[0])>1e-6,hitZ=Math.abs(centerTarget[1]-desired[1])>1e-6;
    for(let i=0;i<steps;i++){
      if(safeAt(x+dx/steps,z,e))x+=dx/steps;else hitX=true;
      if(safeAt(x,z+dz/steps,e))z+=dz/steps;else hitZ=true;
    }
    body.position.x=x;body.position.z=z;body.aabbNeedsUpdate=true;
    if(hitX)body.velocity.x*=body.velocity.x*(desired[0]-x)>0?-.15:.35;
    if(hitZ)body.velocity.z*=body.velocity.z*(desired[1]-z)>0?-.15:.35;
    return {valid:true,blocked:hitX||hitZ||rotationReverted,hitX,hitZ,rotationReverted};
  }
  return {floor,wallCount,checkedFloorSamples:checked,bounds:{minX,maxX,minZ,maxZ},bodies,constrainBody,
    dispose(){for(const body of bodies)world.removeBody(body);bodies.length=0}};
}
