// Quiet wrongness built only from models the owner already approved: single
// busts that turn toward the player while unobserved (one of them relocates
// behind the player once it has been noticed), and a few road signs on walls
// where no road could be. Render-only: no collision, navigation or sound.
import {M} from './engine.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const WATCHER_RULES = Object.freeze({height: .66, viewHalfAngle: 1.02, noticeDistance: 9, followMin: 5.5, followMax: 8.5, cooldown: [7, 13], activeRange: 46});
// Corners of the eastern and southern rooms; each is resolved to walkable floor.
export const WATCHER_SITES = Object.freeze([
  Object.freeze({id: 'watcher-far-southeast', position: [10.4, 32.0]}),
  Object.freeze({id: 'watcher-south', position: [-14.8, 60.6]}),
  Object.freeze({id: 'watcher-south-southwest', position: [-60.8, 60.6]}),
  Object.freeze({id: 'watcher-east', position: [10.4, -18.4]}),
  Object.freeze({id: 'follower', position: [-10.3, 27.4], follows: true}),
]);
// [type, x, y, z, yaw, size]; yaw 0 faces +Z, +PI/2 faces +X. Each centre is
// 12 mm in front of an inner wall face of an Original room.
export const STRAY_SIGNS = Object.freeze([
  ['wrong_way', -19.2, 1.55, 38.112, 0, .2],
  ['do_not_enter', -87.892, 1.5, 47.6, Math.PI / 2, .36],
  ['one_way', 12.292, 1.5, 21.2, -Math.PI / 2, .2],
  ['stop', 6.4, 1.6, 30.012, 0, .38],
  ['no_pedestrians', -50.4 + 12.292, 1.55, 44.2, -Math.PI / 2, .36],
  ['yield', -63.2 + .258, 1.6, 57.8, Math.PI / 2, .37],
].map(Object.freeze));

/** True when `point` is inside the horizontal view cone and in line of sight. */
export function observed(nav, player, yaw, point, halfAngle = WATCHER_RULES.viewHalfAngle) {
  const dx = point[0] - player[0], dz = point[1] - player[1], d = Math.hypot(dx, dz);
  if (d < .4) return true;
  const facing = (dx * Math.sin(yaw) - dz * Math.cos(yaw)) / d;
  return facing > Math.cos(halfAngle) && nav.visible(player, point);
}

export function createWatchers({model, nav, sites = WATCHER_SITES, seed = 0xB057}) {
  const {min, max} = model ?? {};
  if (!min || !max || !(max[1] > min[1]) || !nav?.visible || !nav?.canWalk) throw new TypeError('Watchers need the loaded bust model and navigation');
  const scale = WATCHER_RULES.height / (max[1] - min[1]), anchor = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
  let randomState = seed >>> 0;
  const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
  const watchers = [];
  for (const site of sites) {
    const index = nav.nearest(...site.position);
    if (!nav.open(index)) continue;
    const home = nav.point(index);
    if (distance(home, site.position) > 2.5 || !nav.canWalk(...home)) continue;
    watchers.push({id: site.id, follows: !!site.follows, home, position: [...home], yaw: 0, noticed: false, cooldown: 0, moves: 0,
      model: {...model, visible: true, matrix: M.identity(), id: site.id}});
  }
  const place = watcher => {
    const floor = nav.floorAt(...watcher.position);
    watcher.model.matrix = M.mul(M.pose(watcher.position[0], Number.isFinite(floor) ? floor : 0, watcher.position[1], watcher.yaw, scale), M.trs(anchor));
  };
  function reset() {
    randomState = seed >>> 0;
    for (const watcher of watchers) { watcher.position = [...watcher.home]; watcher.yaw = 0; watcher.noticed = false; watcher.cooldown = 0; watcher.moves = 0; place(watcher); }
  }
  /** update({dt, player, yaw, allowFollow}) — call once per displayed frame while playing. */
  function update({dt = 0, player, yaw = 0, allowFollow = true} = {}) {
    if (!Array.isArray(player)) return;
    for (const watcher of watchers) {
      const d = distance(player, watcher.position);
      if (d > WATCHER_RULES.activeRange) continue;
      const seen = observed(nav, player, yaw, watcher.position);
      if (seen && d < WATCHER_RULES.noticeDistance) watcher.noticed = true;
      watcher.cooldown = Math.max(0, watcher.cooldown - dt);
      if (seen) continue;
      // Unobserved: it is facing you the next time you look.
      watcher.yaw = Math.atan2(player[0] - watcher.position[0], player[1] - watcher.position[1]);
      if (watcher.follows && watcher.noticed && allowFollow && watcher.cooldown === 0 && d > WATCHER_RULES.followMin) {
        // Somewhere behind the player with a clear line to them, never in view.
        for (let attempt = 0; attempt < 6; attempt++) {
          const angle = yaw + Math.PI + (random() - .5) * 1.5, range = WATCHER_RULES.followMin + random() * (WATCHER_RULES.followMax - WATCHER_RULES.followMin);
          const candidate = [player[0] + Math.sin(angle) * range, player[1] - Math.cos(angle) * range];
          if (!nav.canWalk(...candidate) || !nav.visible(player, candidate) || observed(nav, player, yaw, candidate)) continue;
          watcher.position = candidate; watcher.moves++;
          watcher.yaw = Math.atan2(player[0] - candidate[0], player[1] - candidate[1]);
          break;
        }
        watcher.cooldown = WATCHER_RULES.cooldown[0] + random() * (WATCHER_RULES.cooldown[1] - WATCHER_RULES.cooldown[0]);
      }
      place(watcher);
    }
  }
  reset();
  return {models: watchers.map(w => w.model), update, reset,
    snapshot: () => watchers.map(w => ({id: w.id, position: [...w.position], yaw: w.yaw, noticed: w.noticed, moves: w.moves}))};
}

/** Extra wall signs from the approved sign set. `catalog` is the warning-sign catalogue. */
export function createStraySigns(catalog, signs = STRAY_SIGNS) {
  const models = [];
  for (const [type, x, y, z, yaw, size] of signs) {
    try { const model = catalog.create(type, {position: [x, y, z], yaw, height: size}); model.id = `stray-sign-${models.length}`; models.push(model); }
    catch { /* A sign type missing from the set is simply not shown. */ }
  }
  return models;
}
