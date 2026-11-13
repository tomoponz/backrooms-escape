// Stages a single occluded encounter. After activation only the enemy director
// moves the actor. Objective events carry a fixed world sound, never a live target.
import {routeGeometry} from './navigation-metrics.js';
export const ENCOUNTER_RULES = Object.freeze({minimumRoute:26, easyMinimumRoute:34, maximumRoute:38, minimumDistance:14, reactionSeconds:2, idleSeconds:75, initialHearingRange:28, initialHearingSeconds:8});
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);

export function createEncounterDirector({nav, enemy, director, exit, maintenance}) {
  let pending = null, activation = null, firstContact = false, reactionRemaining = 0, initialHearingRemaining = 0;

  // `origin` is the fixture that made the noise (a specific breaker when there
  // are several); without it the single maintenance control is assumed.
  function notify(code, origin) {
    if (code !== 'exit-unpowered' && code !== 'power-restored' && code !== 'breaker-restored') return false;
    const valid = origin && Array.isArray(origin.position) && Number.isInteger(origin.i);
    const source = code === 'exit-unpowered' ? exit : valid ? origin : maintenance;
    // A breaker slamming home carries through the whole floor; the dead exit
    // only rattles locally.
    if (enemy.active) return code === 'exit-unpowered' ? director.hearEvent({position:source.position, range:38})
      : director.hearEvent({position:source.position, range:400, duration:14, loud:true});
    // Repeated interaction cannot continually move/reset a dormant encounter.
    pending ??= {code, source, destination:code === 'exit-unpowered' ? maintenance : exit};
    return true;
  }
  // A building-wide noise at a fixed fixture. It never carries the player's
  // position and is ignored while the actor is already chasing by sight.
  function alarm(target) {
    if (!enemy.active || !target || !Array.isArray(target.position)) return false;
    return director.hearEvent({position:target.position, range:400, duration:14, loud:true});
  }

  function stage(player, elapsed, difficulty) {
    if (enemy.active || difficulty === 'explore') return false;
    if (!pending && elapsed < ENCOUNTER_RULES.idleSeconds) return false;
    const origin = pending?.source.position ?? nav.point(nav.start);
    const route = pending ? nav.path(pending.source.i, pending.destination.i) : [nav.enemy];
    const geometry=routeGeometry(nav,route);
    const candidates = [];
    if(pending){
      // Prefer an existing side patrol rather than placing the actor in the
      // middle of the player's only marked corridor. It investigates the fixed
      // door sound from that branch and must physically reach the junction.
      for(const i of new Set([nav.enemy,...(nav.patrol??[])])){
        if(!nav.open(i))continue;
        const p=nav.point(i),routeDistance=routeGeometry(nav,nav.path(pending.source.i,i)).length;
        if(routeDistance<ENCOUNTER_RULES.minimumRoute||routeDistance>ENCOUNTER_RULES.maximumRoute||
          distance(player,p)<ENCOUNTER_RULES.minimumDistance||nav.visible(player,p))continue;
        if(geometry.points.some(point=>distance(point,p)<3.5))continue;
        candidates.push({p,routeDistance,placement:'patrol-branch'});
      }
      candidates.sort((a,b)=>a.routeDistance-b.routeDistance);
    }
    const hasBranch=candidates.length>0;
    for (let n=0;n<route.length;n++) {
      if(hasBranch)break;
      const p=geometry.points[n],routeDistance=pending?geometry.distances[n]:distance(player,p);
      // Easy gives more approach distance before its slower investigation
      // intersects the route. All distances follow the existing connected floor.
      const minimumRoute=difficulty==='easy'?ENCOUNTER_RULES.easyMinimumRoute:ENCOUNTER_RULES.minimumRoute;
      if (pending && (routeDistance < minimumRoute || routeDistance > ENCOUNTER_RULES.maximumRoute)) continue;
      if (distance(player,p) < ENCOUNTER_RULES.minimumDistance || nav.visible(player,p)) continue;
      candidates.push({p,routeDistance,placement:pending?'route':'idle-patrol'});
    }
    if (!candidates.length) return false;
    const candidate=candidates[0];
    enemy.pos=[...candidate.p];
    const toward=nav.path(nav.nearest(...enemy.pos),nav.nearest(...origin));
    const facing=toward.length>1?nav.point(toward[1]):origin;
    enemy.yaw=Math.atan2(facing[0]-enemy.pos[0],facing[1]-enemy.pos[1]);
    director.activate();
    initialHearingRemaining = pending?.code === 'exit-unpowered' ? ENCOUNTER_RULES.initialHearingSeconds : 0;
    if (pending) director.hearEvent({position:origin,range:60,duration:14});
    activation={cause:pending?.code??'idle-patrol',placement:candidate.placement,elapsed,position:[...enemy.pos],playerDistance:distance(player,enemy.pos),routeDistance:candidate.routeDistance};
    pending=null;
    return true;
  }

  function update({dt, player, running, speeds, hidden=false, witnessTarget=null}) {
    // During first contact the actor stops for a full, once-only reaction window.
    // Sensor updates continue, but this never gives it unseen player positions.
    const held=reactionRemaining>0;
    const hearingRange = !firstContact && initialHearingRemaining > 0 ? ENCOUNTER_RULES.initialHearingRange : undefined;
    initialHearingRemaining=Math.max(0,initialHearingRemaining-Math.max(0,Number.isFinite(dt)?dt:0));
    const result=director.update({dt,player,running,hidden,witnessTarget,hearingRange,speeds:held?{...speeds,patrol:0,chase:0}:speeds});
    let firstAlert=false;
    // Sight is sampled before movement, contact after movement. A corner can
    // therefore produce real visible contact in the same step that began out
    // of sight. That first physical contact must receive the same grace.
    if (!firstContact && (result.alert || result.sees || result.caught)) {
      firstContact=true;reactionRemaining=ENCOUNTER_RULES.reactionSeconds;firstAlert=true;
    } else reactionRemaining=Math.max(0,reactionRemaining-dt);
    return {...result,firstAlert,caught:result.caught&&!held&&!firstAlert};
  }

  return {notify,alarm,stage,update,get captureReady(){return firstContact&&reactionRemaining<=0;},get reactionRemaining(){return reactionRemaining;},get state(){return {pending:pending?.code??null,activation:activation?{...activation,position:[...activation.position]}:null,firstContact,reactionRemaining};}};
}
