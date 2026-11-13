// In-world route guidance. A short run of chevrons lies on the actual floor
// along the walkable route to the current objective and flows toward it; the
// objective itself carries a light column and a floor ring. The marks are drawn
// by the render pipeline's blended overlay pass, so walls hide them correctly.
// This module owns no DOM and no GPU objects: it returns overlay descriptors
// and the numbers the HUD compass needs.

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const GUIDANCE_COLORS = Object.freeze({
  exit: [.36, 1, .62], breaker: [1, .74, .28], escape: [.62, .92, 1], item: [.95, .9, .7],
});
export const GUIDANCE_RULES = Object.freeze({lookAhead: 96, trailStart: 1.5, trailLength: 15, spacing: 1.3, flowSpeed: 1.25, beaconRange: 34});

/** Reduce a cell route to its corners with collision-checked straight runs. */
export function simplifyRoute(nav, points, maxCorners = 14) {
  if (points.length < 3) return points.map(p => [...p]);
  const corners = [[...points[0]]];
  let anchor = 0;
  while (anchor < points.length - 1 && corners.length < maxCorners) {
    // Gallop forward while the straight run stays walkable, then refine.
    let reach = anchor + 1, stride = 4;
    while (reach + stride < points.length && nav.visible(points[anchor], points[reach + stride])) { reach += stride; stride = Math.min(stride * 2, 32); }
    while (stride > 1) {
      stride >>= 1;
      if (reach + stride < points.length && nav.visible(points[anchor], points[reach + stride])) reach += stride;
    }
    corners.push([...points[reach]]);
    anchor = reach;
  }
  return corners;
}

export function createGuidance({nav}) {
  let key = '', corners = [], steps = -1, lengths = [0];

  function refresh(player, target) {
    const cell = nav.nearest(...player);
    const next = `${nav.topologyVersion ?? 0}|${cell}|${target.i}`;
    if (next === key) return;
    key = next;
    const cells = nav.open(cell) ? nav.descend(cell, target.i, GUIDANCE_RULES.lookAhead) : [];
    steps = cells.length ? nav.pathSteps(cell, target.i) : -1;
    corners = cells.length > 1 ? simplifyRoute(nav, cells.map(i => nav.point(i))) : [];
    lengths = [0];
    for (let i = 1; i < corners.length; i++) lengths.push(lengths[i - 1] + distance(corners[i - 1], corners[i]));
  }

  // Position and heading at an arc length measured from the player's own
  // position, so the trail does not jump when the route's first cell changes.
  // The collision-checked runs start at the centre of the player's cell. From
  // the player's exact position the first corner may be just clipped by a wall
  // end, so pass through that cell centre whenever the direct line is not clear.
  let firstCorner = 1;
  function sample(player, s) {
    if (corners.length < 2) return null;
    let previous = player, travelled = 0;
    for (let i = firstCorner; i < corners.length; i++) {
      const segment = distance(previous, corners[i]);
      if (segment > 1e-4 && travelled + segment >= s) {
        const t = (s - travelled) / segment;
        return {point: [previous[0] + (corners[i][0] - previous[0]) * t, previous[1] + (corners[i][1] - previous[1]) * t],
          heading: [(corners[i][0] - previous[0]) / segment, (corners[i][1] - previous[1]) / segment]};
      }
      travelled += segment; previous = corners[i];
    }
    return null;
  }

  /**
   * update({player, target:{i, position, id}, kind, time, camera, enabled}) →
   * {items, distance, aim, hasRoute}. `aim` is a point a few metres along the
   * route for the HUD compass; `distance` is walking distance in metres.
   */
  function update({player, target, kind = 'exit', time = 0, camera, enabled = true, strength = 1}) {
    const empty = {items: [], distance: null, aim: null, hasRoute: false};
    if (!enabled || !target || !Array.isArray(player) || !nav.open(target.i)) { key = ''; return empty; }
    refresh(player, target);
    firstCorner = corners.length > 1 && !nav.visible(player, corners[1]) ? 0 : 1;
    const color = GUIDANCE_COLORS[kind] ?? GUIDANCE_COLORS.exit, items = [];
    const straight = distance(player, target.position), walk = steps >= 0 ? steps * nav.step : null;
    const routeLength = corners.length > 1 ? (firstCorner === 0 ? distance(player, corners[0]) + lengths.at(-1) : distance(player, corners[1]) + (lengths.at(-1) - lengths[1])) : 0;
    // Stop the trail short of the objective, where the beacon takes over.
    const end = Math.min(GUIDANCE_RULES.trailLength, routeLength - .6, (walk ?? routeLength) - 1.2);
    const offset = (time * GUIDANCE_RULES.flowSpeed) % GUIDANCE_RULES.spacing;
    for (let s = GUIDANCE_RULES.trailStart + offset; s < end; s += GUIDANCE_RULES.spacing) {
      const at = sample(player, s);
      if (!at) break;
      const fadeIn = Math.min(1, (s - GUIDANCE_RULES.trailStart) / 1.1), fadeOut = Math.min(1, (end - s) / 3.5);
      const alpha = .78 * strength * fadeIn * fadeOut;
      if (alpha < .02) continue;
      const floor = nav.floorAt(...at.point);
      if (!Number.isFinite(floor)) continue;
      const [hx, hz] = at.heading, size = .4;
      items.push({kind: 0, center: [at.point[0], floor + .028, at.point[1]], u: [-hz * size, 0, hx * size], v: [hx * size, 0, hz * size],
        color: [color[0], color[1], color[2], alpha], additive: .85});
    }
    if (straight < GUIDANCE_RULES.beaconRange) {
      const floor = nav.floorAt(...target.position);
      if (Number.isFinite(floor)) {
        const pulse = (time * .55) % 1, near = Math.min(1, straight / 3.5);
        items.push({kind: 1, center: [target.position[0], floor + .03, target.position[1]], u: [.7, 0, 0], v: [0, 0, .7],
          color: [color[0], color[1], color[2], .7 * strength], additive: .9, phase: pulse});
        if (camera) {
          // Upright column facing the viewer around the vertical axis.
          const rx = Math.cos(camera.yaw), rz = Math.sin(camera.yaw), height = 1.25;
          items.push({kind: 3, center: [target.position[0], floor + height, target.position[1]], u: [rx * .2, 0, rz * .2], v: [0, height, 0],
            color: [color[0], color[1], color[2], .5 * strength * near], additive: 1});
        }
      }
    }
    // The compass aims a few metres along the route, but never through a wall
    // end: take the farthest of a few route points with a clear straight walk.
    let aimAt = null;
    for (const ahead of [4.5, 3.2, 2.2, 1.4, .8, .4]) {
      const at = sample(player, Math.min(ahead, Math.max(.3, routeLength - .3)));
      if (at && nav.visible(player, at.point)) { aimAt = at; break; }
      aimAt ??= at;
    }
    return {items, distance: walk ?? (Number.isFinite(straight) ? straight : null), aim: aimAt?.point ?? target.position, hasRoute: corners.length > 1 || straight < 1};
  }

  return {update, reset() { key = ''; corners = []; steps = -1; lengths = [0]; }, get corners() { return corners.map(p => [...p]); }};
}

/** Signed bearing (radians, + is to the right) from the view direction to a point. */
export function relativeBearing(player, yaw, point) {
  const angle = Math.atan2(point[0] - player[0], -(point[1] - player[1])) - yaw;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
