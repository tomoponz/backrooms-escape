// Lightweight route guidance. The target is selected by walking distance,
// and the immediate bearing follows a collision-checked part of that route.
// The cache is invalidated when the player enters a different navigation cell
// or collects an objective; it avoids repeated searches every HUD update.
export function createNavigationGuide(nav) {
  let cachedKey = '', cached = null;
  function route(player, targets) {
    if (!Array.isArray(player) || !player.every(Number.isFinite) || !targets?.length) return null;
    const start = nav.nearest(...player);
    if (!nav.open(start)) return null;
    const key = `${nav.topologyVersion??0}|${start}|${targets.map(t => `${t.i}:${t.k}`).join(',')}`;
    if (key !== cachedKey) {
      cachedKey = key;
      let best = null;
      for (const target of targets) {
        if (!nav.open(target.i)) continue;
        const path = nav.path(start, target.i);
        if (!path.length) continue;
        let length = 0;
        for (let n = 1; n < path.length; n++) {
          const a = nav.point(path[n - 1]), b = nav.point(path[n]);
          length += Math.hypot(b[0] - a[0], b[1] - a[1]);
        }
        if (!best || length < best.length) best = {target, path, length};
      }
      cached = best;
    }
    if (!cached) return null;
    // The cache is cell-based, but starting at the player's current location
    // keeps the line and distance responsive while moving inside that cell.
    const points = cached.path.map(i => nav.point(i));
    let next = points.at(-1), previous = player, remaining = 0;
    for (const p of points) {
      remaining += Math.hypot(p[0] - previous[0], p[1] - previous[1]);
      previous = p;
    }
    // Only skip cells while the actual navigable line is clear; stop at the
    // first turn or after five metres to avoid pointing through distant walls.
    for (const p of points) {
      if (Math.hypot(p[0]-player[0],p[1]-player[1]) > 5 || !nav.visible(player,p)) break;
      if (Math.hypot(p[0]-player[0],p[1]-player[1]) > .15) next = p;
    }
    if (!nav.visible(player,next)) next = points[0];
    return {target:cached.target, points, next, distance:remaining};
  }
  return {route, clear(){cachedKey='';cached=null}};
}

// Draws a restrained floor marking using the same built-in cube primitive as
// existing objective and exit markers. Descriptors are authored navigation
// points, not new model assets; omit any marking whose endpoints hit a wall.
export function createFloorLandmarks(renderer, M, nav, markers = []) {
  const objects=[];
  for (const marker of markers) {
    const [x,z]=marker.position || [], heading=marker.heading ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(heading)) continue;
    const pieces=[];
    for (const side of [-1,1]) {
      const angle=heading-side*Math.PI/4, cx=x+side*.15*Math.cos(heading), cz=z-side*.15*Math.sin(heading);
      const dx=Math.sin(angle)*.25,dz=Math.cos(angle)*.25;
      if (![ [cx,cz],[cx-dx,cz-dz],[cx+dx,cz+dz] ].every(p=>nav.canWalk(...p))) { pieces.length=0;break; }
      pieces.push({cx,cz,angle});
    }
    for (const {cx,cz,angle} of pieces) {
      const object=renderer.cube([.38,.72,.62,1]);
      object.matrix=M.trs([cx,nav.floorAt(cx,cz)+.025,cz],[0,Math.sin(angle/2),0,Math.cos(angle/2)],[.065,.025,.5]);
      object.meshes[0].material.emissive=[.05,.18,.14];
      objects.push(object);
    }
  }
  return objects;
}
