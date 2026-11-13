// Locker state is separate from rendering, movement, and the enemy brains.
// A sighting is a fixed observation of the entrance, never a live hidden target.
export const LOCKER_RULES = Object.freeze({
  interactionRange: 1.35, enterSeconds: .55, exitSeconds: .45,
  captureRange: .8
});
const valid = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const copy = p => [p[0],p[1]];

/**
 * Locker definitions: {id, approach:[x,z], exit?:[x,z]}. The approach is the
 * fixed reachable point outside the door and the enemy's witnessed target.
 * The default exit is the approach; camera/geometry belong to the renderer.
 *
 * An observer is {id, position:[x,z], seesPlayer, active?}. Supply an actual
 * sight result for the current entry position (not chase or memory state).
 * During entering, update observers every physics step. After the door closes,
 * new witnesses cannot be added. Witnesses remain until the player exits or
 * cancels entry; arrival at the observed door catches the hidden player.
 *
 * `interact` returns a code; `update` returns {phase, hidden, movementLocked,
 * locker, witnesses, caughtBy, exitPosition}. Apply exitPosition to the player
 * once returned, and use witnesses to direct those enemies to their fixed goal.
 * `hidden` means suppress normal enemy sight, hearing and contact for this
 * player. Witness capture is deliberately separate from those normal sensors.
 */
export function createLockerHiding({nav, lockers, enterSeconds=LOCKER_RULES.enterSeconds,
  exitSeconds=LOCKER_RULES.exitSeconds}={}) {
  if (!nav || !['canWalk','visible','move'].every(k=>typeof nav[k]==='function'))
    throw new TypeError('Locker hiding requires physical navigation');
  if (!Array.isArray(lockers) || !lockers.every(l=>l && typeof l.id==='string' && l.id && valid(l.approach) && (!l.exit || valid(l.exit))) ||
      new Set(lockers.map(l=>l.id)).size!==lockers.length)
    throw new TypeError('Lockers require unique ids and valid approach/exit positions');
  if (![enterSeconds,exitSeconds].every(v=>Number.isFinite(v)&&v>0)) throw new TypeError('Locker transition times must be positive');
  const definitions=lockers.map(l=>({...l,approach:copy(l.approach),exit:copy(l.exit??l.approach)}));
  let phase='idle', locker=null, remaining=0, witnesses=new Set(), caughtBy=null;
  const active = o => o && o.active!==false && typeof o.id==='string' && valid(o.position);
  const observe = observers => {
    for (const o of observers??[]) if (active(o) && o.seesPlayer===true) witnesses.add(o.id);
  };
  const exitClear = observers => {
    if (!locker || !nav.canWalk(...locker.exit) || !nav.canWalk(...locker.approach) ||
        !nav.visible(locker.approach,locker.exit)) return false;
    const p=copy(locker.approach);
    nav.move(p,locker.exit[0]-p[0],locker.exit[1]-p[1]);
    if (distance(p,locker.exit)>.01) return false;
    return !(observers??[]).some(o=>active(o) && distance(o.position,locker.exit)<LOCKER_RULES.captureRange && nav.visible(o.position,locker.exit));
  };
  function snapshot(exitPosition=null) {
    return {phase,hidden:phase==='hidden'||phase==='exiting',movementLocked:phase!=='idle',
      locker,remaining,witnesses:[...witnesses].map(id=>({id,position:copy(locker.approach)})),caughtBy,
      exitPosition:exitPosition?copy(exitPosition):null};
  }
  function reset(){phase='idle';locker=null;remaining=0;witnesses.clear();caughtBy=null;return snapshot();}
  function nearest(position) {
    if (!valid(position)) return null;
    return definitions.filter(l=>distance(position,l.approach)<=LOCKER_RULES.interactionRange && nav.visible(position,l.approach))
      .sort((a,b)=>distance(position,a.approach)-distance(position,b.approach))[0]??null;
  }
  function interact({position,observers=[]}={}) {
    if (caughtBy) return {code:'caught',...snapshot()};
    if (phase==='idle') {
      const selected=nearest(position);if(!selected)return {code:'not-near',...snapshot()};
      if(!nav.canWalk(...selected.approach) || !nav.canWalk(...selected.exit))return {code:'blocked',...snapshot()};
      locker=selected;phase='entering';remaining=enterSeconds;witnesses.clear();observe(observers);
      return {code:'entering',...snapshot()};
    }
    if (phase==='entering') {reset();return {code:'entry-cancelled',...snapshot()};}
    if (phase==='exiting') {phase='hidden';remaining=0;return {code:'exit-cancelled',...snapshot()};}
    if (!exitClear(observers)) return {code:'exit-blocked',...snapshot()};
    phase='exiting';remaining=exitSeconds;return {code:'exiting',...snapshot()};
  }
  function update({dt,observers=[]}={}) {
    if (!Number.isFinite(dt)||dt<=0||phase==='idle'||caughtBy) return snapshot();
    if (phase==='entering') observe(observers);
    remaining=Math.max(0,remaining-dt);
    if (phase==='entering' && remaining===0) phase='hidden';
    if ((phase==='hidden'||phase==='exiting') && witnesses.size) {
      const captor=observers.find(o=>active(o) && witnesses.has(o.id) &&
        distance(o.position,locker.approach)<LOCKER_RULES.captureRange && nav.visible(o.position,locker.approach));
      if (captor) caughtBy=captor.id;
    }
    if (phase==='exiting' && remaining===0 && !caughtBy) {
      if (!exitClear(observers)) {phase='hidden';return snapshot();}
      const p=copy(locker.exit);reset();return snapshot(p);
    }
    return snapshot();
  }
  return Object.freeze({interact,update,reset,nearest,get state(){return snapshot();}});
}
