// Camera-relative capture motion for the existing Bacteria rig. This does not
// create or alter a model: the actor is brought into the player's view and the
// actual posed head is used to frame the final lunge before the blackout.
import {M} from './engine.js';

export const CAPTURE_DURATION = 1.9;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const finite=(x,fallback=0)=>Number.isFinite(x)?x:fallback;

// The source has no authored skin or head locator. The existing CPU rig has
// the transformed head vertices, including its lunge deformation. Bounding
// their current position avoids aiming at the old rest-pose location.
export function posedHeadCenter(animator){
 const part=animator?.rig?.parts?.find(p=>p.name?.startsWith('Head_'));
 const points=part?.posedPositions;
 if(!points?.length)return [0,5.34,.76]; // No-GPU test adapter.
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i+2<points.length;i+=3)for(let c=0;c<3;c++){
  const value=points[i+c];if(!Number.isFinite(value))return [0,5.34,.76];
  min[c]=Math.min(min[c],value);max[c]=Math.max(max[c],value);
 }
 return min.map((v,i)=>(v+max[i])/2);
}

export function captureDistance(elapsed){
 const t=clamp(finite(elapsed),0,CAPTURE_DURATION);
 // First a recognizable silhouette, then an accelerating close lunge. The
 // last near-plane-safe approach makes the existing head fill the view.
 return 2.05-1.60*smooth(.08,1.05,t)-.18*smooth(1.05,1.34,t);
}

/** Inputs use world metres and camera yaw. The returned actor matrix places
 * the posed head directly in front of the current eye without changing the
 * player, collision state, model mesh or texture. Optional motion adds only a
 * small pitch tremor; the lunge and fade remain readable with motion off. */
export function captureFrame({elapsed=0,eye=[0,1.62,0],cameraYaw=0,floorHeight=0,headCenter=[0,5.34,.76],scale=.43,motion=false}={}){
 const t=clamp(finite(elapsed),0,CAPTURE_DURATION),e=[0,1,2].map(i=>finite(eye?.[i],i===1?1.62:0));
 const h=[0,1,2].map(i=>finite(headCenter?.[i],[0,5.34,.76][i]));
 const yaw=finite(cameraYaw),s=clamp(finite(scale,.43),.1,1),distance=captureDistance(t);
 const tilt=.24*(1-smooth(.25,1.05,t))+(motion?Math.sin(t*28)*.018*smooth(.2,.6,t):0);
 const align=smooth(.12,.88,t),naturalY=finite(floorHeight)+.05+h[1]*s;
 const headY=naturalY+(e[1]+Math.tan(tilt)*distance-naturalY)*align;
 const forward=[Math.sin(yaw),-Math.cos(yaw)],headWorld=[e[0]+forward[0]*distance,headY,e[2]+forward[1]*distance];
 const actorYaw=yaw+Math.PI,c=Math.cos(actorYaw),si=Math.sin(actorYaw);
 const rootX=headWorld[0]-(c*h[0]+si*h[2])*s;
 const rootZ=headWorld[2]-(-si*h[0]+c*h[2])*s;
 const rootY=headY-h[1]*s;
 return {matrix:M.pose(rootX,rootY,rootZ,actorYaw,s),pitch:tilt,distance,blackout:smooth(1.22,1.6,t),duration:CAPTURE_DURATION,headWorld};
}
