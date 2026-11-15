// The selected hazmat and Skinstealer are two views of one actor.  This module
// owns only navigation and encounter state; it creates no geometry or sound.
// Coordinates/yaw follow enemy-director.js: zero yaw faces positive Z.
import {createEnemyDirector} from './enemy-director.js';

export const SKINSTEALER_RULES = Object.freeze({
  noticeDistance: 4.5,
  transformSeconds: 1.8,
  retreatSeconds: 2.2,
  humanPatrolSpeed: 1.25,
  normal: Object.freeze({patrol:1.5, chase:4.4}),
  easy: Object.freeze({patrol:1.2, chase:3.4})
});
const DEFAULT_PATROL = Object.freeze([[-80,-5],[-70,-5],[-70,5],[-80,5]]);
const pointValid = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const turn = (yaw,target,amount) => yaw + Math.max(-amount,Math.min(amount,Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw))));
const copy = p => [p[0],p[1]];

/**
 * createSkinstealerDirector({nav,spawn?,patrol?,normalStation?})
 * patrol: array of world [x,z] points, defaulting to a route wholly within
 * the original-far-west room. Points resolve to physically supported cells.
 * reset('normal'|'easy'|'explore') restores a single dormant human; explore
 * disables the complete encounter. If supplied, normalStation is a stationary
 * human in standard mode, with transformation locked until powerRestored.
 * Call update only during actual gameplay.
 *
 * update({dt,player,running,mayNotice?,canCapture?}) returns an immutable snapshot with phase,
 * position, yaw, mode, movementSpeed, collapse, humanAlpha, monsterAlpha,
 * sees, heard and caught. caught fires at most once until reset. The caller
 * is responsible for drawing, reacting to capture, and disposing GPU assets.
 */
export function createSkinstealerDirector({nav,spawn,patrol=DEFAULT_PATROL,normalStation}={}) {
  if (!nav || !['nearest','open','point','path','move','visible','canWalk'].every(k=>typeof nav[k]==='function'))
    throw new TypeError('Skinstealer requires physical world navigation');
  if (!Array.isArray(patrol) || !patrol.length || !patrol.every(pointValid))
    throw new TypeError('Skinstealer requires valid authored patrol positions');
  const resolve = p => {
    const i=nav.nearest(...p), q=nav.point(i);
    if (!nav.open(i) || !pointValid(q) || !nav.canWalk(...q) || distance(p,q)>2)
      throw new Error('Skinstealer patrol point has no nearby supported floor');
    // After the player breaks free: forget the latched capture, push the actor
  // back along the line away from the player (collision-checked) and report it.
  function release(player, distanceBack = 2.2) {
    captureLatched = false;
    if (pointValid(player)) {
      const dx = enemy.pos[0] - player[0], dz = enemy.pos[1] - player[1], length = Math.hypot(dx, dz) || 1;
      nav.move(enemy.pos, dx / length * distanceBack, dz / length * distanceBack);
    }
    return snapshot(false);
  }
  return {release,i,position:copy(q)};
  };
  const points=patrol.map(resolve), initial=resolve(spawn??patrol[0]);
  const station=normalStation?resolve(normalStation.position):null;
  if(station && !nav.path(station.i,initial.i).length)
    throw new Error('Skinstealer exit station is disconnected');
  // A broken authored route must not silently produce a static or teleported NPC.
  for(let i=0;i<points.length;i++) if(!nav.path(points[i].i,points[(i+1)%points.length].i).length)
    throw new Error('Skinstealer authored patrol is disconnected');
  if(!nav.path(initial.i,points[0].i).length)throw new Error('Skinstealer spawn cannot reach its patrol');
  // The independent enemy instance is never shared with Bacteria.
  const enemy={pos:copy(initial.position),yaw:0,active:false,mode:'dormant',lastKnown:null,memory:0};
  const humanPath = {cursor:0,route:[],goal:-1};
  const monsterNav=Object.create(nav);
  let brain;
  let phase='disabled',difficulty='normal',phaseTime=0,elapsed=0,lastSpeed=0,seen=false,heard=false,captureLatched=false;
  let witnessedLocker=null,witnessReached=false;
  const stationed=()=>difficulty==='normal'&&station!==null;
  function canSeePlayer(player) {
    if (!pointValid(player)) return false;
    if (phase==='human'||phase==='transforming') return distance(enemy.pos,player)<=SKINSTEALER_RULES.noticeDistance && nav.visible(enemy.pos,player);
    return (phase==='grace'||phase==='monster') && brain.canSeePlayer(player);
  }
  function setHumanTarget() {
    for(let tries=0;tries<points.length;tries++){
      humanPath.cursor=(humanPath.cursor+1)%points.length;
      const next=points[humanPath.cursor];
      if(distance(enemy.pos,next.position)<.35 && points.length>1)continue;
      humanPath.goal=next.i;humanPath.route=nav.path(nav.nearest(...enemy.pos),next.i).slice(1);return;
    }
    humanPath.goal=points[0].i;humanPath.route=[];
  }
  function reset(nextDifficulty='normal') {
    difficulty=nextDifficulty==='easy'?'easy':nextDifficulty==='explore'?'explore':'normal';
    phase=difficulty==='explore'?'disabled':'human';phaseTime=0;elapsed=0;lastSpeed=0;seen=false;heard=false;captureLatched=false;
    witnessedLocker=null;witnessReached=false;
    const origin=stationed()?station:initial;
    enemy.pos=copy(origin.position);enemy.yaw=stationed()?(normalStation.yaw??0):0;enemy.active=false;enemy.mode='dormant';enemy.lastKnown=null;enemy.memory=0;
    monsterNav.start=origin.i;monsterNav.exit=origin.i;monsterNav.patrol=stationed()?[]:points.map(x=>x.i);
    brain=createEnemyDirector({nav:monsterNav,enemy,seed:0x51A57E});
    humanPath.cursor=0;humanPath.route=[];humanPath.goal=-1;
    if(phase==='human'&&!stationed())setHumanTarget();
    return snapshot(false);
  }
  function patrolStep(dt) {
    if(humanPath.goal<0 || (!humanPath.route.length && distance(enemy.pos,nav.point(humanPath.goal))<.4))setHumanTarget();
    let budget=SKINSTEALER_RULES.humanPatrolSpeed*dt,travelled=0,steps=0;
    while(budget>1e-6 && humanPath.route.length && steps++<24){
      const p=nav.point(humanPath.route[0]),dx=p[0]-enemy.pos[0],dz=p[1]-enemy.pos[1],d=Math.hypot(dx,dz);
      if(d<.025){humanPath.route.shift();continue;}
      const n=Math.min(d,budget),old=copy(enemy.pos);nav.move(enemy.pos,dx/d*n,dz/d*n);
      const moved=distance(old,enemy.pos);if(moved<1e-6){humanPath.route=[];humanPath.goal=-1;break;}
      enemy.yaw=turn(enemy.yaw,Math.atan2(enemy.pos[0]-old[0],enemy.pos[1]-old[1]),dt*4);
      travelled+=moved;budget-=n;if(n>=d-.001)humanPath.route.shift();
    }
    return dt>0?travelled/dt:0;
  }
  function snapshot(caught) {
    const collapse=phase==='transforming'?Math.min(1,phaseTime/SKINSTEALER_RULES.transformSeconds):phase==='grace'||phase==='monster'?1:0;
    const humanAlpha=phase==='disabled'?0:1-collapse;
    const monsterAlpha=phase==='disabled'||phase==='human'?0:Math.max(0,Math.min(1,(collapse-.35)/.65));
    return Object.freeze({phase,position:copy(enemy.pos),yaw:enemy.yaw,mode:phase==='human'?'patrol':enemy.mode,
      collapse,humanAlpha,monsterAlpha,movementSpeed:lastSpeed,sees:seen,heard,caught,elapsed,
      lastKnown:pointValid(enemy.lastKnown)?copy(enemy.lastKnown):null,witnessReached});
  }
  function update({dt,player,running=false,mayNotice=true,hidden=false,witnessTarget=null,canCapture=true,powerRestored=false}={}) {
    if(!Number.isFinite(dt)||dt<=0||phase==='disabled')return snapshot(false);
    if(!hidden){witnessedLocker=null;witnessReached=false;}
    else if(!witnessedLocker&&pointValid(witnessTarget))witnessedLocker=copy(witnessTarget);
    const step=Math.min(dt,.1);elapsed+=step;phaseTime+=step;lastSpeed=0;seen=false;heard=false;
    let caught=false;
    if(phase==='human'){
      // The person notices only an actually reachable, visible nearby player.
      // A stationary human may wait for both restored power and a safe
      // moment to reveal. The full collapse and escape grace still apply.
      const ready=mayNotice&&(!stationed()||powerRestored);
      if(ready&&(hidden&&witnessedLocker||!hidden&&canSeePlayer(player))){
        // Face the actually observed player once. During collapse and after
        // sight is broken this angle is not updated from hidden positions.
        const observed=hidden?witnessedLocker:player;
        enemy.yaw=Math.atan2(observed[0]-enemy.pos[0],observed[1]-enemy.pos[1]);
        phase='transforming';phaseTime=0;enemy.mode='transforming';
      } else if(!stationed()) lastSpeed=patrolStep(step);
    } else if(phase==='transforming'){
      if(phaseTime>=SKINSTEALER_RULES.transformSeconds){phase='grace';phaseTime=0;brain.activate();}
    } else if(phase==='grace'||phase==='monster'){
      const before=copy(enemy.pos),speeds=phase==='grace'?{patrol:0,chase:0}:SKINSTEALER_RULES[difficulty];
      const result=brain.update({dt:step,player,running,speeds,hidden,witnessTarget:witnessedLocker});
      witnessReached=result.witnessReached;
      seen=result.sees;heard=result.heard;lastSpeed=distance(before,enemy.pos)/step;
      // Grace is a full time window, including when the player overlaps.
      if(phase==='grace' && phaseTime>=SKINSTEALER_RULES.retreatSeconds){phase='monster';phaseTime=0;}
      else if(phase==='monster'&&canCapture&&result.caught&&!captureLatched){caught=true;captureLatched=true;}
    }
    return snapshot(caught);
  }
  reset('normal');
  return Object.freeze({reset,update,canSeePlayer,get state(){return snapshot(false)}});
}
