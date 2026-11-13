import {M} from './engine.js';
import {World,Body,Box,Vec3,SAPBroadphase,Material,ContactMaterial} from './vendor/cannon-es-0.20.0/cannon-es.js';

export const BUST_POSITION=Object.freeze([-82,-4]);
export const BUST_HEIGHT=.5;
const FIXED_STEP=1/120, MAX_SPEED=8, MAX_ANGULAR=12, PLAYER_RADIUS=.20;

// A continuous horizontal sweep against a body AABB, expanded by the same
// player radius as the navigation system. This prevents missed contacts when
// the player's position advances by more than the width of one object.
function sweptContact(a,b,box,r){
 let lo=0,hi=1;
 for(let axis=0;axis<2;axis++){
  const min=(axis?box.lowerBound.z:box.lowerBound.x)-r;
  const max=(axis?box.upperBound.z:box.upperBound.x)+r;
  const start=a[axis],d=b[axis]-start;
  if(Math.abs(d)<1e-9){if(start<min||start>max)return null;continue}
  let l=(min-start)/d,h=(max-start)/d;if(l>h)[l,h]=[h,l];
  lo=Math.max(lo,l);hi=Math.min(hi,h);if(lo>hi)return null;
 }
 return lo;
}
function capVector(v,max){const n=v.length();if(n>max)v.scale(max/n,v)}

export function createBustPyramid({model,nav,position=BUST_POSITION,addBounds=()=>{}}){
 if(!model?.min||!model?.max||!Array.isArray(model.meshes)||!nav?.floorAt||!nav?.canWalk)throw Error('Bust pyramid requires model bounds and navigation');
 const min=model.min,max=model.max,height=max[1]-min[1];
 if(!(height>0)||!min.every(Number.isFinite)||!max.every(Number.isFinite))throw Error('Invalid bust model bounds');
 const scale=BUST_HEIGHT/height,half=new Vec3((max[0]-min[0])*scale/2,BUST_HEIGHT/2,(max[2]-min[2])*scale/2);
 const localCenter=min.map((v,i)=>(v+max[i])/2),floor=nav.floorAt(...position);
 if(!Number.isFinite(floor)||!nav.canWalk(...position))throw Error('Bust location is not walkable');
 const world=new World({gravity:new Vec3(0,-9.81,0),allowSleep:true});world.broadphase=new SAPBroadphase(world);
 world.solver.iterations=15;world.defaultContactMaterial.friction=.48;world.defaultContactMaterial.restitution=.04;
 const material=new Material('bust');world.addContactMaterial(new ContactMaterial(material,material,{friction:.48,restitution:.04}));
 const boundaries=addBounds({world,nav,position,floor,material});
 const bodies=[],models=[],initial=[];
 const dx=half.x*2+.004,dz=half.z*2+.004;
 for(let level=0;level<4;level++){
  const count=4-level,offset=[0,1,1,2][level];
  for(let z=0;z<count;z++)for(let x=0;x<count;x++){
   const p=[position[0]+(x+offset-1.5)*dx,floor+half.y+level*(half.y*2+.001),position[1]+(z+offset-1.5)*dz];
   const body=new Body({mass:1.4,position:new Vec3(...p),material,linearDamping:.24,angularDamping:.42,allowSleep:true,sleepSpeedLimit:.16,sleepTimeLimit:1.2});
   // Approximate the measured pedestal, neck, shoulders, head and hair cap.
   // Multiple boxes let an upper pedestal touch the actual head rather than
   // resting on an invisible box spanning the whole bust.
   for(const [h,y] of [[[.082,.04,.081],-.21],[[.055,.035,.05],-.135],[[half.x,.08,half.z],-.02],[[.115,.075,.10],.145],[[.035,.015,.034],.235]])
    body.addShape(new Box(new Vec3(...h)),new Vec3(0,y,0));
   world.addBody(body);body.sleep();bodies.push(body);initial.push(p);
   models.push({...model,matrix:M.identity(),visible:true});
  }
 }
 if(bodies.length!==30)throw Error('Incorrect bust count');
 let touched=false,cooldown=0,accumulator=0;
 function sync(){for(let i=0;i<bodies.length;i++){
  const b=bodies[i],q=b.quaternion;
  models[i].matrix=M.mul(M.trs([b.position.x,b.position.y,b.position.z],[q.x,q.y,q.z,q.w],[scale,scale,scale]),M.trs(localCenter.map(v=>-v)));
 }}
 function reset(){touched=false;cooldown=0;accumulator=0;for(let i=0;i<bodies.length;i++){
  const b=bodies[i];b.position.set(...initial[i]);b.previousPosition.copy(b.position);b.interpolatedPosition.copy(b.position);
  b.quaternion.set(0,0,0,1);b.previousQuaternion.copy(b.quaternion);b.interpolatedQuaternion.copy(b.quaternion);
  b.velocity.setZero();b.angularVelocity.setZero();b.force.setZero();b.torque.setZero();b.aabbNeedsUpdate=true;b.sleep();
 }world.broadphase.dirty=true;sync()}
 function update(dt,previous,current){
  if(!Number.isFinite(dt)||dt<=0||!Array.isArray(previous)||!Array.isArray(current))return;
  const step=Math.min(.05,dt),delta=[current[0]-previous[0],current[1]-previous[1]],distance=Math.hypot(...delta);
  cooldown=Math.max(0,cooldown-step);
  if(distance>1e-5&&Math.min(Math.hypot(previous[0]-position[0],previous[1]-position[1]),Math.hypot(current[0]-position[0],current[1]-position[1]))<8){
   let nearest=null;
   for(const body of bodies){
    body.updateAABB();if(body.aabb.upperBound.y<floor||body.aabb.lowerBound.y>floor+1.65)continue;
    const t=sweptContact(previous,current,body.aabb,PLAYER_RADIUS);
    if(t===0&&Math.hypot(current[0]-body.position.x,current[1]-body.position.z)>Math.hypot(previous[0]-body.position.x,previous[1]-body.position.z))continue;
    if(t!==null&&(!nearest||t<nearest.t))nearest={body,t};
   }
   if(nearest){
    const safe=Math.max(0,nearest.t-.002/distance);
    current[0]=previous[0]+delta[0]*safe;current[1]=previous[1]+delta[1]*safe;
    if(cooldown===0){
     if(!touched){touched=true;for(const body of bodies)body.wakeUp()}
     const speed=Math.min(7.2,distance/step),force=Math.min(18,speed*2.5);
     nearest.body.wakeUp();nearest.body.applyImpulse(new Vec3(delta[0]/distance*force,.03*force,delta[1]/distance*force),new Vec3(0,.12,0));cooldown=.12;
    }
   }
  }
  if(touched&&bodies.some(b=>b.sleepState!==Body.SLEEPING)){
   accumulator=Math.min(accumulator+step,.05);
   while(accumulator+1e-9>=FIXED_STEP){
    const safe=bodies.map(b=>({xz:[b.position.x,b.position.z],rotation:b.quaternion.clone()}));
    world.step(FIXED_STEP);accumulator-=FIXED_STEP;
    for(let i=0;i<bodies.length;i++){
     const b=bodies[i];capVector(b.velocity,MAX_SPEED);capVector(b.angularVelocity,MAX_ANGULAR);
     const result=boundaries?.constrainBody?.(b,safe[i].xz,safe[i].rotation);
     if(result&&!result.valid){b.position.x=safe[i].xz[0];b.position.z=safe[i].xz[1];b.quaternion.copy(safe[i].rotation);b.velocity.setZero();b.angularVelocity.setZero();b.aabbNeedsUpdate=true}
    }
   }
   sync();
  }
 }
 function snapshot(){return {position:[...position],floor,touched,count:bodies.length,initial:initial.map(p=>[...p]),bodies:bodies.map(b=>({position:[b.position.x,b.position.y,b.position.z],rotation:[b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w],velocity:[b.velocity.x,b.velocity.y,b.velocity.z],sleepState:b.sleepState}))}}
 // Fastest moving bust in m/s; lets the game time the fall recording without reading every body.
 function energy(){let most=0;for(const b of bodies)if(b.sleepState!==Body.SLEEPING)most=Math.max(most,Math.hypot(b.velocity.x,b.velocity.y,b.velocity.z));return most}
 reset();return {world,bodies,models,update,reset,snapshot,energy,scale,half};
}
