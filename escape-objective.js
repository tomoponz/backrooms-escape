// One physical cause and effect: the exit release has lost power, and its
// maintenance circuit must be restored. This module owns no world/UI objects.
import {pathDistance} from './navigation-metrics.js';
const INTERACTION_RANGE = 1.7;
const ESCAPE_ARRIVAL_RANGE = 2.5;
const CLEARANCE = .8;
const validPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

function navigationSize(nav) {
  const size = nav?.length ?? nav?.free?.length;
  if (!Number.isInteger(size) || size <= 0 || !Number.isFinite(nav?.step) || nav.step <= 0 ||
      !['open', 'point', 'neighbors', 'visible'].every(key => typeof nav?.[key] === 'function') ||
      !nav.open(nav.start) || !nav.open(nav.exit)) {
    throw new TypeError('Escape objective requires a valid connected grid navigation.');
  }
  return size;
}

function graphDistances(nav, source, size) {
  const distance = new Int32Array(size).fill(-1), queue = new Int32Array(size);
  let head = 0, tail = 0;
  distance[source] = 0;
  queue[tail++] = source;
  while (head < tail) {
    const cell = queue[head++];
    for (const next of nav.neighbors(cell)) {
      if (!Number.isInteger(next) || next < 0 || next >= size || !nav.open(next) || distance[next] >= 0) continue;
      distance[next] = distance[cell] + 1;
      queue[tail++] = next;
    }
  }
  return distance;
}

// Use two distance fields rather than thousands of path searches. The shared
// Level 0 graph has equal length edges. Exclude disconnected islands and tight
// corners, then maximise distance from BOTH spawn and the exit. Stable index
// order breaks ties, so retry/reload never moves the maintenance control.
export function selectMaintenanceLocation(nav) {
  const size = navigationSize(nav);
  const fromStart = graphDistances(nav, nav.start, size);
  const fromExit = graphDistances(nav, nav.exit, size);
  if (fromStart[nav.exit] < 0) throw new Error('The exit is unreachable from the starting position.');
  let chosen = -1, best = -1;
  for (let cell = 0; cell < size; cell++) {
    if (!nav.open(cell) || fromStart[cell] < 0 || fromExit[cell] < 0 || cell === nav.start || cell === nav.exit) continue;
    const score = Math.min(fromStart[cell], fromExit[cell]);
    if (score <= best) continue;
    const p = nav.point(cell);
    if (!validPoint(p) || ![[CLEARANCE, 0], [-CLEARANCE, 0], [0, CLEARANCE], [0, -CLEARANCE]]
      .every(([dx, dz]) => nav.visible(p, [p[0] + dx, p[1] + dz]))) continue;
    chosen = cell;
    best = score;
  }
  if (chosen < 0) throw new Error('No reachable maintenance position has safe interaction clearance.');
  return Object.freeze({
    id: 'maintenance', i: chosen, index: chosen, k: 'maintenance',
    position: Object.freeze([...nav.point(chosen)]),
    label: '出口回路の保守制御',
    sign: 'EXIT 扉回路 / TRIPPED',
    distances: Object.freeze({fromStart: fromStart[chosen] * nav.step, fromExit: fromExit[chosen] * nav.step})
  });
}

function authoredTarget(nav, anchor, defaults, allowDisconnected = false) {
  const position=validPoint(anchor?.position)?[...anchor.position]:null;
  const i=anchor?.i??anchor?.index??(position&&nav.nearest?.(...position));
  const point=position??(nav.open(i)?nav.point(i):null);
  if(!validPoint(point)||!nav.open(i)||nav.canWalk&&!nav.canWalk(...point)||!nav.visible(point,nav.point(i)))
    throw new Error(`The authored ${defaults.id} anchor must lie on reachable room geometry.`);
  const fromStart=pathDistance(nav,nav.start,i),fromExit=pathDistance(nav,nav.exit,i);
  if(!allowDisconnected&&(!Number.isFinite(fromStart)||!Number.isFinite(fromExit)))throw new Error(`The authored ${defaults.id} anchor is disconnected.`);
  return Object.freeze({...defaults,i,index:i,k:defaults.id,position:Object.freeze(point),
    distances:Object.freeze({fromStart,fromExit})});
}

export function createEscapeObjective(nav, anchors = {}) {
  const maintenance = anchors.maintenance
    ? authoredTarget(nav,anchors.maintenance,{id:'maintenance',label:'出口回路の保守制御',sign:'EXIT 回路 / TRIPPED'})
    : selectMaintenanceLocation(nav);
  const exitPosition = nav.point(nav.exit);
  if (!validPoint(exitPosition)) throw new TypeError('The exit position must be a finite [x, z] point.');
  const exit = anchors.exit ? authoredTarget(nav,anchors.exit,{id:'exit',label:'出口',sign:'EXIT / 電源なし'}) : Object.freeze({
    id: 'exit', i: nav.exit, index: nav.exit, k: 'exit',
    position: Object.freeze([...exitPosition]), label: '出口', sign: 'EXIT / 電動解錠'
  });
  // The outdoor destination exists beyond the initially closed real doorway.
  // Its floor must be valid now; connectivity is verified after opening the gate.
  const escape = anchors.escape ? authoredTarget(nav,anchors.escape,{id:'escape',label:'扉の先の外へ',sign:'OUTSIDE'},true) : null;
  // The exit release is fed by one or more breakers. With a single breaker the
  // module behaves exactly as the earlier maintenance-control objective.
  const additional = (anchors.breakers ?? []).map((anchor, n) => {
    const id = typeof anchor.id === 'string' && anchor.id ? anchor.id : `breaker-${n + 2}`;
    if (id === 'exit' || id === 'escape' || id === 'maintenance') throw new TypeError('Breaker ids must be distinct from built-in targets.');
    return authoredTarget(nav, anchor, {id, label: anchor.label ?? '配電盤', sign: 'BREAKER / TRIPPED'});
  });
  const breakers = Object.freeze([maintenance, ...additional]);
  if (new Set(breakers.map(b => b.id)).size !== breakers.length) throw new TypeError('Duplicate breaker id.');
  const multiple = breakers.length > 1, breakerIds = new Set(breakers.map(b => b.id));
  const targets = [exit, ...breakers];
  const restored = new Set();
  let doorExamined = false, doorOpened = false, escaped = false;
  const powered = () => restored.size === breakers.length;

  function snapshot() {
    const powerRestored = powered();
    return Object.freeze({
      phase: escaped ? 'escaped' : doorOpened ? 'leave-building' : powerRestored ? 'return-exit' : doorExamined || (multiple && restored.size) ? 'restore-power' : 'find-exit',
      powerRestored, doorExamined, escaped, ...(escape?{doorOpened}:{}),
      ...(multiple?{restoredCount:restored.size,breakerCount:breakers.length,restored:Object.freeze([...restored])}:{})
    });
  }
  function inReach(player, descriptor) {
    return validPoint(player) && Math.hypot(player[0] - descriptor.position[0], player[1] - descriptor.position[1]) < INTERACTION_RANGE &&
      nav.visible(player, descriptor.position);
  }
  function describe(descriptor) {
    if(descriptor.id==='escape')return Object.freeze({...descriptor,prompt:''});
    if(descriptor.id==='exit'&&doorOpened)return Object.freeze({...descriptor,prompt:'扉は開いている。外へ歩こう'});
    const powerRestored = powered();
    let prompt;
    if (breakerIds.has(descriptor.id)) {
      prompt = multiple
        ? restored.has(descriptor.id) ? 'このブレーカーは上がっている' : '[ E 長押し ] ブレーカーを上げる'
        : powerRestored ? '出口回路は通電している' : '[ E ] EXIT 扉回路を復旧する';
    } else prompt = powerRestored ? '[ E ] 出口の扉を開く' : '[ E ] 出口の扉を調べる';
    return Object.freeze({...descriptor, prompt});
  }
  function target(player) {
    if (escaped || !validPoint(player)) return null;
    const nearby = targets.filter(descriptor => inReach(player, descriptor));
    nearby.sort((a, b) => Math.hypot(a.position[0] - player[0], a.position[1] - player[1]) -
      Math.hypot(b.position[0] - player[0], b.position[1] - player[1]));
    return nearby.length ? describe(nearby[0]) : null;
  }
  function result(handled, changed, code, message, descriptor = null) {
    return Object.freeze({handled, changed, code, message, target: descriptor ? describe(descriptor) : null, state: snapshot()});
  }
  function interact(player, targetId) {
    if (!validPoint(player)) return result(false, false, 'invalid-position', '');
    if (escaped) return result(false, false, 'completed', '');
    if (targetId !== undefined && !targets.some(descriptor => descriptor.id === targetId)) {
      return result(false, false, 'unknown-target', '');
    }
    const descriptor = targetId === undefined ? target(player) : targets.find(item => item.id === targetId);
    // Check current position even when integration has retained an earlier
    // prompt/hold target: moving away or behind a wall cancels the operation.
    if (!descriptor || !inReach(player, descriptor)) return result(false, false, 'out-of-reach', '');
    if (breakerIds.has(descriptor.id)) {
      if (restored.has(descriptor.id)) {
        return result(true, false, 'already-restored', !multiple || powered()
          ? '出口回路は通電している。出口の扉へ戻ろう。' : 'このブレーカーはもう上がっている。残りの配電盤を探そう。', descriptor);
      }
      restored.add(descriptor.id);
      if (powered()) {
        return result(true, true, 'power-restored', multiple
          ? '最後のブレーカーを上げた。出口の解錠ランプが点くはずだ。扉へ戻ろう。'
          : 'EXIT 扉回路を復旧した。出口の解錠ランプが点くはずだ。扉へ戻ろう。', descriptor);
      }
      return result(true, true, 'breaker-restored',
        `ブレーカーを上げた（${restored.size} / ${breakers.length}）。残りの配電盤を探そう。`, descriptor);
    }
    if (!powered()) {
      const changed = !doorExamined;
      doorExamined = true;
      return result(true, changed, 'exit-unpowered', multiple
        ? `扉が動かない。解錠ランプが消えている。貼り紙には「停電時は ${breakers.length} か所の配電盤でブレーカーを上げること」。`
        : '扉が動かない。解錠ランプが消えている。貼り紙には「EXIT 扉回路は保守制御で復旧」。設備の案内を探そう。', exit);
    }
    if(escape){
      if(doorOpened)return result(true,false,'already-open','扉は開いている。外の光へ進もう。',exit);
      doorOpened=true;
      return result(true,true,'exit-opened','解錠回路が動いた。開いた扉を通り、外へ歩こう。',exit);
    }
    escaped = true;
    return result(true, true, 'escaped', '通電した扉のロックが外れた。', exit);
  }
  // With several breakers the nearest one still to restore is suggested, by
  // walking distance when the navigation offers flooded distance fields.
  function nextBreaker(player) {
    const open = breakers.filter(b => !restored.has(b.id));
    if (open.length < 2 || !validPoint(player) || typeof nav.pathSteps !== 'function' || typeof nav.nearest !== 'function') return open[0] ?? null;
    const from = nav.nearest(...player);
    let best = open[0], bestSteps = Infinity;
    for (const breaker of open) {
      const steps = nav.pathSteps(from, breaker.i);
      if (steps >= 0 && steps < bestSteps) { best = breaker; bestSteps = steps; }
    }
    return best;
  }
  function guidance(player) {
    if (escaped) return null;
    if (doorOpened) return escape;
    if (powered()) return exit;
    if (!multiple) return doorExamined ? maintenance : exit;
    return doorExamined || restored.size ? nextBreaker(player) : exit;
  }
  function update(player) {
    if(!escape||!doorOpened||escaped||!validPoint(player)||
       Math.hypot(player[0]-escape.position[0],player[1]-escape.position[1])>=ESCAPE_ARRIVAL_RANGE||
       !nav.visible(player,escape.position))return null;
    escaped=true;
    return result(true,true,'escaped','蛍光灯の音が遠ざかった。自分の足で、外へ出た。',escape);
  }
  function status() {
    if(doorOpened&&!escaped)return '草地の先にある暗い場所へ歩く';
    if(escaped)return '脱出';
    if(powered())return '通電した出口へ戻る';
    if(multiple)return doorExamined||restored.size?`配電盤のブレーカーを上げる（${restored.size} / ${breakers.length}）`:'出口を探す';
    return doorExamined ? '出口回路の保守制御を探す' : '出口を探す';
  }
  function reset(restoredIds = []) {
    restored.clear();
    for (const id of restoredIds) if (breakerIds.has(id)) restored.add(id);
    doorExamined = false;
    doorOpened = false;
    escaped = false;
    return snapshot();
  }
  return Object.freeze({maintenance, exit, escape, breakers, interactionRange: INTERACTION_RANGE, get state() {return snapshot();},
    isBreaker: id => breakerIds.has(id), isRestored: id => restored.has(id), reset, target, interact, update, guidance, status});
}
