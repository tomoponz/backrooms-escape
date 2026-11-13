// Bacteria's decisions use observed positions, never an unseen live target.
// Coordinates and yaw match the existing nav/model: yaw 0 faces positive Z.
export const ENEMY_BEHAVIOR = Object.freeze({
  sightRange: 15, viewAngle: 110 * Math.PI / 180, chaseViewAngle: 135 * Math.PI / 180,
  closeAwareness: 1.35, visualMemory: 2.3, hearingRange: 14,
  hearingInterval: .65, occlusionPenalty: 4, occlusionMultiplier: 1.35,
  investigateDuration: 6, searchDuration: 5.5, searchRadius: 3.2,
  chaseRepath: .45, otherRepath: 1.4, captureRange: .8, witnessReach: .65
});

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pointValid = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const copy = p => [p[0], p[1]];
const turn = (yaw, target, amount) => yaw + Math.max(-amount, Math.min(amount, Math.atan2(Math.sin(target-yaw), Math.cos(target-yaw))));

/**
 * createEnemyDirector({nav, enemy, seed?}) keeps the game's existing enemy object.
 * Call activate() after positioning it. Activation knows no player position.
 * update({dt, player, running, speeds:{patrol,chase}}) handles movement and returns
 * {mode, previousMode, alert, caught, sees, heard, distance}. No audio/render work.
 * Test canSeePlayer before entry. While hidden, pass witnessTarget only for an
 * actual witness: its copied doorway is retained until hidden becomes false.
 * witnessReached reports a nearby, unobstructed approach; hidden distance is Infinity.
 * Call update only while playing; game physics supplies steps <= .05 seconds.
 * enemy.mode is patrol / investigate / chase / search (dormant until activation).
 */
export function createEnemyDirector({nav, enemy, seed = 0xBACA}) {
  if (!nav || !enemy || !pointValid(enemy.pos)) throw new TypeError('Enemy director requires navigation and an enemy position');
  const config = ENEMY_BEHAVIOR;
  let randomState = seed >>> 0, enabled = false, goal = null, goalCell = -1;
  let hearingClock = 0, soundPoint = null, soundAge = Infinity, investigateLeft = 0;
  let searchLeft = 0, searchPoints = [], searchPause = 0, blockedFor = 0, alertCooldown = 0;
  let patrolCursor = 0;
  let witnessedLocker = null, witnessReached = false;
  const patrol = [...new Set([nav.start, ...(nav.patrol ?? []), nav.exit].filter(i => nav.open(i)))];
  const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
  const setGoal = p => {
    goal = pointValid(p) ? copy(p) : null;
    goalCell = goal ? nav.nearest(...goal) : -1;
    enemy.target = goalCell;
    enemy.path = [];
    enemy.pathClock = 0;
    blockedFor = 0;
  };
  // A search pause belongs to that mode. Letting it survive a transition
  // stranded patrol/chase forever because only search decrements the timer.
  const mode = value => { enemy.mode = value; enemy.modeTime = 0; searchPause = 0; };

  function choosePatrol() {
    if (!patrol.length) { setGoal(null); return; }
    // The first waypoint is an authored spawn-area patrol point, not the player.
    for (let attempt = 0; attempt < patrol.length; attempt++) {
      const index = patrolCursor++ === 0 ? 0 : Math.floor(random() * patrol.length);
      const p = nav.point(patrol[index]);
      if (distance(p, enemy.pos) > 1 || attempt === patrol.length - 1) { setGoal(p); break; }
    }
  }

  function beginPatrol() {
    mode('patrol');
    enemy.memory = 0;
    enemy.lastKnown = null;
    soundPoint = null;
    soundAge = Infinity;
    searchPoints = [];
    choosePatrol();
  }

  function beginInvestigate(p, duration = config.investigateDuration) {
    if (enemy.mode !== 'investigate') mode('investigate');
    investigateLeft = duration;
    enemy.lastKnown = copy(p);
    if (!goal || distance(goal, p) > .4) setGoal(p);
  }

  function nearbySearchPoints(origin) {
    const start = nav.nearest(...origin);
    if (!nav.open(start) || !nav.neighbors) return [];
    // A small graph flood stays on the accessible side of walls and never reads
    // the player's position. Both radius and node count bound its CPU work.
    const queue = [{i:start, length:0}], seen = new Set([start]), candidates = [];
    for (let head = 0; head < queue.length && head < 192; head++) {
      const current = queue[head], p = nav.point(current.i);
      if (current.length > 1.2) candidates.push(p);
      for (const i of nav.neighbors(current.i)) {
        if (seen.has(i)) continue;
        seen.add(i);
        const length = current.length + distance(p, nav.point(i));
        if (length <= config.searchRadius) queue.push({i, length});
      }
    }
    const points = [], facing = enemy.yaw + (random() - .5) * .6;
    for (const angle of [facing, facing + 2.1, facing - 2.1]) {
      let best = null, score = -Infinity;
      for (const p of candidates) {
        if (points.some(previous => distance(previous, p) < 1.4)) continue;
        const projection = (p[0]-origin[0])*Math.sin(angle)+(p[1]-origin[1])*Math.cos(angle);
        if (projection > score) { score = projection; best = p; }
      }
      if (best) points.push(best);
    }
    return points;
  }

  function beginSearch() {
    const origin = copy(enemy.lastKnown ?? enemy.pos);
    mode('search');
    enemy.memory = 0;
    searchLeft = config.searchDuration;
    searchPause = 0;
    searchPoints = nearbySearchPoints(origin);
    setGoal(origin);
  }

  function activate() {
    enabled = true;
    randomState = seed >>> 0;
    patrolCursor = 0;
    hearingClock = 0;
    alertCooldown = 0;
    witnessedLocker = null; witnessReached = false;
    enemy.active = true;
    enemy.yaw = Number.isFinite(enemy.yaw) ? enemy.yaw : 0;
    enemy.seesPlayer = false;
    enemy.heardNoise = false;
    beginPatrol();
  }

  function canSee(player, d) {
    if (d > config.sightRange) return false;
    const angle = enemy.mode === 'chase' ? config.chaseViewAngle : config.viewAngle;
    const dx = player[0]-enemy.pos[0], dz = player[1]-enemy.pos[1];
    if (d > config.closeAwareness && (dx*Math.sin(enemy.yaw)+dz*Math.cos(enemy.yaw))/d < Math.cos(angle/2)) return false;
    return nav.visible(enemy.pos, player);
  }

  // Call immediately before hiding, while the player is still observable.
  function canSeePlayer(player) {
    return !!enemy.active && pointValid(player) && canSee(player, distance(enemy.pos, player));
  }

  function canHear(player, d, range = config.hearingRange) {
    if (d > range) return false;
    if (nav.visible(enemy.pos, player)) return true;
    // An adjacent room may be only two metres away through a wall but twenty
    // metres away through its doors. Sound follows that accessible route.
    if (d * config.occlusionMultiplier + config.occlusionPenalty > range) return false;
    const start = nav.nearest(...enemy.pos), end = nav.nearest(...player);
    if (!nav.open(start) || !nav.open(end)) return false;
    const route = nav.path(start, end);
    if (!route.length) return false;
    let length = distance(enemy.pos, nav.point(route[0])) + distance(player, nav.point(route.at(-1)));
    for (let i = 1; i < route.length; i++) {
      length += distance(nav.point(route[i-1]), nav.point(route[i]));
      if (length*config.occlusionMultiplier+config.occlusionPenalty > range) return false;
    }
    return length*config.occlusionMultiplier+config.occlusionPenalty <= range;
  }

  // A world event (door rattle or circuit trip) is one fixed observation.
  // It obeys the same navigable sound path as footsteps and cannot follow the
  // player afterwards. A visible chase takes priority over this weaker evidence.
  // `loud` marks a building-wide event (the exit release); ordinary events
  // stay capped at 60 m of navigable sound distance.
  function hearEvent({position, range = config.hearingRange, duration = config.investigateDuration, loud = false} = {}) {
    if (!enemy.active || !pointValid(position) || !Number.isFinite(range) || range <= 0 ||
        !canHear(position, distance(enemy.pos, position), Math.min(loud ? 400 : 60, range))) return false;
    soundPoint=copy(position);soundAge=0;
    if (enemy.mode !== 'chase') beginInvestigate(soundPoint, Math.min(14, Math.max(config.investigateDuration, Number.isFinite(duration)?duration:0)));
    return true;
  }

  function move(dt, speed, sees) {
    if (!goal || speed <= 0 || searchPause > 0) return;
    enemy.pathClock -= dt;
    const direct = sees && enemy.mode === 'chase' || nav.visible(enemy.pos, goal);
    if (!direct && enemy.pathClock <= 0) {
      const start = nav.nearest(...enemy.pos);
      goalCell = nav.nearest(...goal);
      enemy.target = goalCell;
      enemy.path = nav.path(start, goalCell).slice(1);
      // Recover the exact last observation after reaching its nearest cell.
      if (start === goalCell) enemy.path = [];
      enemy.pathClock = enemy.mode === 'chase' ? config.chaseRepath : config.otherRepath;
    }
    let budget = speed * dt, iterations = 0, travelled = 0;
    while (budget > 1e-6 && (direct || enemy.path.length) && iterations++ < 24) {
      const p = direct ? goal : nav.point(enemy.path[0]);
      const dx = p[0]-enemy.pos[0], dz = p[1]-enemy.pos[1], length = Math.hypot(dx, dz);
      if (length < .025) { if (direct) break; enemy.path.shift(); continue; }
      const step = Math.min(budget, length), before = copy(enemy.pos);
      nav.move(enemy.pos, dx/length*step, dz/length*step);
      const moved = distance(before, enemy.pos);
      if (moved < .00001) { enemy.pathClock = 0; break; }
      enemy.yaw = turn(enemy.yaw, Math.atan2(enemy.pos[0]-before[0], enemy.pos[1]-before[1]), dt*(enemy.mode === 'chase' ? 5.5 : 3.3));
      travelled += moved;
      budget -= step;
      if (step >= length-.001) { if (direct) break; enemy.path.shift(); }
    }
    blockedFor = travelled < .0001 && distance(enemy.pos, goal) > .55 ? blockedFor + dt : 0;
    if (blockedFor > 1) {
      if (enemy.mode === 'patrol') choosePatrol();
      else if (witnessedLocker) { enemy.pathClock = 0; blockedFor = 0; }
      else if (enemy.mode !== 'search') beginSearch();
      else { searchPoints.shift(); setGoal(searchPoints[0] ?? enemy.pos); }
    }
  }

  function update({dt, player, running = false, speeds = {patrol:1.9, chase:5.1}, hearingRange = config.hearingRange, hidden = false, witnessTarget = null}) {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0;
    const previousMode = enemy.mode ?? 'dormant';
    let sees = false, heard = false, alert = false;
    if (enemy.active && !enabled) activate();
    if (!hidden) { witnessedLocker = null; witnessReached = false; }
    else if (!witnessedLocker && pointValid(witnessTarget)) { witnessedLocker = copy(witnessTarget); witnessReached = false; }
    let d = !hidden && pointValid(player) ? distance(enemy.pos, player) : Infinity;
    if (!enemy.active || step === 0) return {mode:enemy.mode, previousMode, alert, caught:false, sees, heard, distance:d, witnessReached};
    enemy.modeTime += step;
    soundAge += step;
    hearingClock -= step;
    alertCooldown = Math.max(0, alertCooldown-step);
    sees = !hidden && pointValid(player) && canSee(player, d);
    enemy.seesPlayer = sees;
    if (hidden && witnessedLocker) {
      // An entry witnessed before hiding is a fixed observation, not access to
      // the player's concealed position. Keep the goal until exit, even if a
      // path is temporarily blocked or visual memory would normally expire.
      if (enemy.mode !== 'chase') mode('chase');
      if (!goal || distance(goal, witnessedLocker) > .001) setGoal(witnessedLocker);
      enemy.lastKnown = copy(witnessedLocker);
      enemy.memory = 0;
    } else if (sees) {
      alert = enemy.mode !== 'chase' && alertCooldown === 0;
      if (alert) alertCooldown = 3;
      if (enemy.mode !== 'chase') { mode('chase'); setGoal(player); }
      else { goal = copy(player); goalCell = nav.nearest(...goal); enemy.target = goalCell; }
      enemy.lastKnown = copy(player);
      enemy.memory = config.visualMemory;
    } else {
      enemy.memory = Math.max(0, enemy.memory-step);
      if (!hidden && running && pointValid(player) && hearingClock <= 0) {
        hearingClock = config.hearingInterval;
        // Optional encounter-level boost still uses actual navigable sound
        // distance and never grants sight or a continuously tracked position.
        const range = Number.isFinite(hearingRange) ? Math.max(0, Math.min(28, hearingRange)) : config.hearingRange;
        heard = canHear(player, d, range);
        if (heard) {
          soundPoint = nav.point(nav.nearest(...player));
          soundAge = 0;
          if (enemy.mode !== 'chase') beginInvestigate(soundPoint);
        }
      }
      if (enemy.mode === 'chase' && (enemy.memory <= 0 || goal && distance(enemy.pos, goal) < .45)) {
        if (soundPoint && soundAge < config.hearingInterval*1.6) beginInvestigate(soundPoint);
        else beginSearch();
      }
    }
    enemy.heardNoise = heard;
    if (enemy.mode === 'investigate') {
      investigateLeft -= step;
      if (investigateLeft <= 0 || goal && distance(enemy.pos, goal) < .5) beginSearch();
    }
    if (enemy.mode === 'search') {
      searchLeft -= step;
      if (searchLeft <= 0) beginPatrol();
      else {
        if (searchPause > 0) {
          searchPause = Math.max(0, searchPause-step);
          enemy.yaw += step*1.1;
          if (searchPause === 0) setGoal(searchPoints.shift() ?? enemy.pos);
        } else if (!goal || distance(enemy.pos, goal) < .45) searchPause = .55;
      }
    }
    if (enemy.mode === 'patrol' && (!goal || distance(enemy.pos, goal) < .6)) choosePatrol();
    const patrolSpeed = Number.isFinite(speeds.patrol) ? Math.max(0, speeds.patrol) : 0;
    const chaseSpeed = Number.isFinite(speeds.chase) ? Math.max(0, speeds.chase) : 0;
    const speed = enemy.mode === 'chase' ? chaseSpeed : enemy.mode === 'investigate' ? Math.min(chaseSpeed, patrolSpeed*1.5) : patrolSpeed;
    if (witnessedLocker && hidden) witnessReached = distance(enemy.pos, witnessedLocker) <= config.witnessReach && nav.visible(enemy.pos, witnessedLocker);
    if (!witnessReached) move(step, speed, sees);
    if (witnessedLocker && hidden) witnessReached = distance(enemy.pos, witnessedLocker) <= config.witnessReach && nav.visible(enemy.pos, witnessedLocker);
    d = !hidden && pointValid(player) ? distance(enemy.pos, player) : Infinity;
    const caught = !hidden && d < config.captureRange && nav.visible(enemy.pos, player);
    return {mode:enemy.mode, previousMode, alert, caught, sees, heard, distance:d, witnessReached};
  }

  return {activate, update, hearEvent, canSeePlayer};
}
