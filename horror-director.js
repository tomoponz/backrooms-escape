// Paces the atmosphere independently of enemy AI: room lighting (dips, dead
// circuits, flicker near a pursuer), picture treatment and occasional sourceless
// noises. Pure state machine — no DOM, audio or rendering. The game applies the
// returned light levels to the room models and maps each cue to an existing
// recording; nothing here synthesises sound or knows where the player is beyond
// the region name passed in.

const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const HORROR_RULES = Object.freeze({
  firstEvent: 26, eventGap: [19, 36], darkLevel: .2, emergencyLevel: .72,
  dreadFar: 24, dreadNear: 7, dipDepth: .22, blackoutSeconds: [5, 9],
});

export function createHorrorDirector({regionIds = [], outdoor = [], neighbours = {}, alwaysLit = [], seed = 0x5EED} = {}) {
  const indoor = regionIds.filter(id => !outdoor.includes(id));
  // Rooms that never lose their circuit (for example a floor with open pits).
  const protectedRooms = new Set(alwaysLit);
  let randomState = seed >>> 0;
  const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
  const between = ([lo, hi]) => lo + (hi - lo) * random();
  let time, eventClock, dread, stage, emergency, target, current, dips, pending, flickerValue, flickerGoal, flickerClock, queued, tone;

  function reset() {
    randomState = seed >>> 0;
    time = 0; eventClock = HORROR_RULES.firstEvent; dread = 0; stage = 0; emergency = false;
    target = new Map(indoor.map(id => [id, 1])); current = new Map(indoor.map(id => [id, 1]));
    dips = []; pending = []; flickerValue = 1; flickerGoal = 1; flickerClock = 0; queued = []; tone = 0;
  }
  reset();

  const dip = (regions, depth, attack, hold, release) => dips.push({regions, depth, start: time, attack, hold, release});
  const later = (delay, cue) => pending.push({at: time + delay, cue});
  function dipFactor(region) {
    let factor = 1;
    for (const d of dips) {
      if (d.regions && !d.regions.includes(region)) continue;
      const t = time - d.start;
      const amount = t < d.attack ? smooth(t / d.attack) : t < d.attack + d.hold ? 1 : 1 - smooth((t - d.attack - d.hold) / d.release);
      factor = Math.min(factor, 1 - (1 - d.depth) * clamp01(amount));
    }
    return factor;
  }

  /** World events from the objective. `region` is where it happened. */
  function notify(event, {region = null, restored = 0, total = 1} = {}) {
    if (event === 'exit-examined') {
      dip(null, .3, .12, .5, 1.4);
      queued.push({type: 'hum-drop', duration: .7});
      later(.55, {type: 'bang', volume: .34, pan: random() < .5 ? -.7 : .7});
    } else if (event === 'breaker-restored' || event === 'power-restored') {
      stage = Math.max(stage, restored);
      dip(null, .18, .08, .7, 1.8);
      queued.push({type: 'hum-drop', duration: .9});
      // The circuit that came back takes another one down: the room around the
      // breaker and one neighbour lose their lights for the rest of the run.
      const lit = indoor.filter(id => target.get(id) === 1 && !protectedRooms.has(id));
      const local = region && lit.includes(region) ? region : null;
      const around = (neighbours[region] ?? []).filter(id => lit.includes(id) && id !== local);
      const chosen = [local, around.length ? around[Math.floor(random() * around.length)] : null].filter(Boolean);
      for (const id of chosen) target.set(id, HORROR_RULES.darkLevel);
      later(.9, {type: 'bang', volume: .26, pan: random() < .5 ? -.8 : .8});
      if (event === 'power-restored' || restored >= total) {
        emergency = true;
        later(1.6, {type: 'door', volume: .3, pan: 0});
      }
    }
  }

  function ambientEvent(region, allowBlackout) {
    const roll = random();
    const pan = (random() < .5 ? -1 : 1) * (.45 + random() * .5);
    if (roll < .26) {
      dip(region ? [region] : null, HORROR_RULES.dipDepth, .1, .5 + random() * .7, 1.1);
      queued.push({type: 'hum-drop', duration: .6});
    } else if (roll < .5) queued.push({type: 'bang', volume: .1 + random() * .14, pan});
    else if (roll < .74) queued.push({type: 'steps', count: 3 + Math.floor(random() * 3), interval: .44, volume: .1 + random() * .1, pan});
    else if (roll < .86 || !allowBlackout || !region) queued.push({type: random() < .5 ? 'door' : 'latch', volume: .12 + random() * .1, pan});
    else {
      const seconds = between(HORROR_RULES.blackoutSeconds);
      dip([region], .1, .08, seconds, 1.6);
      queued.push({type: 'hum-drop', duration: Math.min(1.8, seconds)});
      later(seconds * .5, {type: 'steps', count: 4, interval: .5, volume: .16, pan});
    }
  }

  /**
   * update({dt, region, indoors, enemyDistance, chasing, calm, motion}) →
   * {regionLight: Map, light, dread, post, cues}. `calm` false suppresses new
   * ambient events (menus, hiding, cut scenes); lights keep animating.
   */
  function update({dt = 0, region = null, indoors = true, enemyDistance = Infinity, chasing = false, calm = true, motion = false} = {}) {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .25)) : 0;
    time += step;
    const proximity = clamp01((HORROR_RULES.dreadFar - enemyDistance) / (HORROR_RULES.dreadFar - HORROR_RULES.dreadNear));
    const wanted = Math.max(Math.pow(proximity, 1.25), chasing ? .78 : 0);
    dread += (wanted - dread) * (1 - Math.exp(-step * (wanted > dread ? 2.6 : 1.1)));
    // Flicker: with reduced motion the level only breathes slowly; otherwise a
    // tube stutters between a few brightness steps.
    // Never a strobe: with the motion option a tube sags and recovers a few
    // times a second, eased over ~0.1 s; without it the level only breathes.
    if (motion) {
      flickerClock -= step;
      if (flickerClock <= 0) { flickerGoal = random() < .4 + dread * .2 ? .5 + random() * .3 : 1; flickerClock = .24 + random() * .4; }
      flickerValue += (flickerGoal - flickerValue) * (1 - Math.exp(-step * 9));
    } else flickerValue = .72 + .28 * Math.sin(time * 3.1) * Math.sin(time * 1.3);
    dips = dips.filter(d => time - d.start < d.attack + d.hold + d.release);
    const cues = queued; queued = [];
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= time) { cues.push(pending[i].cue); pending.splice(i, 1); }
    if (calm && indoors) {
      eventClock -= step;
      if (eventClock <= 0 && dread < .15) {
        ambientEvent(indoor.includes(region) ? region : null, stage >= 1 && !protectedRooms.has(region));
        eventClock = Math.max(12, between(HORROR_RULES.eventGap) - stage * 4);
        for (const cue of queued) cues.push(cue);
        queued = [];
      }
    }
    const regionLight = new Map();
    for (const id of indoor) {
      const goal = target.get(id) * (emergency && target.get(id) === 1 ? HORROR_RULES.emergencyLevel : 1);
      const now = current.get(id) + (goal - current.get(id)) * (1 - Math.exp(-step * 3));
      current.set(id, now);
      // A pursuer nearby makes the lights of the player's room unstable.
      const unstable = id === region ? 1 - dread * (.3 + .5 * (1 - flickerValue)) : 1 - dread * .12;
      regionLight.set(id, Math.max(.06, now * dipFactor(id) * unstable));
    }
    const light = regionLight.get(region) ?? 1;
    const pulse = .5 + .5 * Math.sin(time * 7.5);
    // Emergency colouring belongs to the building; it eases off outdoors.
    tone += ((emergency && indoors ? 1 : 0) - tone) * (1 - Math.exp(-step * 1.4));
    const post = {
      grain: .032 + dread * .05 + stage * .004,
      aberration: .0011 + dread * .0042 + (chasing ? .0022 : 0),
      fear: chasing ? .3 + (motion ? .22 * pulse : .1) : dread * .22,
      desaturate: dread * .22 + tone * .08,
      vignette: .55 + dread * .28,
      distort: chasing ? (motion ? .05 + .03 * pulse : .03) : dread * .02,
      grade: [1 + .05 * tone, 1 - .07 * tone, 1 - .14 * tone],
    };
    return {regionLight, light, dread, post, cues, stage, emergency};
  }

  /** Lights of the given rooms (or all) sag once: used by staged moments. */
  function sag(regions = null, depth = .2, hold = .45) { dip(regions, depth, .1, hold, 1.1); }
  return {update, notify, sag, reset, get dread() { return dread; }, get stage() { return stage; },
    get darkRegions() { return indoor.filter(id => target.get(id) < 1); }};
}
