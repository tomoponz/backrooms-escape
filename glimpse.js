// Search for a believable glimpse using the existing collision/navigation data.
// This module never moves the player or the real enemy, and creates no models.
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const finitePoint=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]);

/**
 * Returns a point where the existing Bacteria can be briefly drawn, or null.
 * The center must be navigable and in the camera cone, and the two silhouette
 * sides must differ in navigational line of sight: one seen, one concealed.
 * Navigation is a conservative 2D proxy; the normal depth buffer must remain
 * enabled so actual geometry, not this proxy, decides what is drawn.
 */
export function findGlimpseCandidate({nav,player,yaw,pitch=0}){
 if(!nav||!finitePoint(player)||!Number.isFinite(yaw)||!Number.isFinite(pitch)||Math.abs(pitch)>.55)return null;
 if(typeof nav.canWalk!=='function'||typeof nav.visible!=='function')return null;
 const angles=[0,-.19,.19,-.38,.38],distances=[7,9,11,6,12];
 for(const distance of distances)for(const offset of angles){
  const angle=yaw+offset,dx=Math.sin(angle),dz=-Math.cos(angle);
  const point=[player[0]+dx*distance,player[1]+dz*distance];
  if(!nav.canWalk(...point))continue;
  // A small lateral offset approximates the visible width of the actor.
  const side=[-dz*.60,dx*.60],left=[point[0]+side[0],point[1]+side[1]],right=[point[0]-side[0],point[1]-side[1]];
  const lv=nav.canWalk(...left)&&nav.visible(player,left),rv=nav.canWalk(...right)&&nav.visible(player,right);
  if(lv===rv)continue;
  // If the center is hidden as well, at least the exposed quarter must be in
  // view. This rejects silhouette-wide occlusion behind a thick wall.
  const exposed=lv?left:right,quarter=[(point[0]+exposed[0])/2,(point[1]+exposed[1])/2];
  if(!nav.canWalk(...quarter)||!nav.visible(player,quarter))continue;
  return {position:point,yaw:Math.atan2(player[0]-point[0],player[1]-point[1]),distance,exposed:lv?'left':'right'};
 }
 return null;
}

/** One-shot director. Caller owns display and the hum gate. */
export function createGlimpseDirector({delay=4,duration=.8,retry=1}={}){
 delay=Number.isFinite(delay)?clamp(delay,0,60):4;duration=Number.isFinite(duration)?clamp(duration,.2,3):.8;retry=Number.isFinite(retry)?clamp(retry,.1,10):1;
 let elapsed=0,next=delay,remaining=0,phase='waiting',candidate=null;
 function update({dt=0,nav,player,yaw,pitch=0,allowed=true}={}){
  dt=Number.isFinite(dt)?clamp(dt,0,1):0;
  if(phase==='finished')return {phase,event:null,candidate:null};
  if(phase==='visible'){
   if(!allowed){phase='finished';candidate=null;return {phase,event:'end',candidate:null}}
   remaining-=dt;if(remaining<=0){phase='finished';candidate=null;return {phase,event:'end',candidate:null}}
   return {phase,event:null,candidate};
  }
  elapsed+=dt;if(!allowed||elapsed<next)return {phase,event:null,candidate:null};
  next=elapsed+retry;candidate=findGlimpseCandidate({nav,player,yaw,pitch});
  if(!candidate)return {phase,event:null,candidate:null};
  phase='visible';remaining=duration;return {phase,event:'start',candidate};
 }
 return {update,reset(){elapsed=0;next=delay;remaining=0;phase='waiting';candidate=null},get phase(){return phase}};
}
