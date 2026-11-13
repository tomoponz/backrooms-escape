// The journal remembers observed floor and landmarks. It never supplies a
// complete map, unseen pickup locations, or a collection target.
const validPoint = point => Array.isArray(point) && point.length >= 2 &&
  Number.isFinite(point[0]) && Number.isFinite(point[1]);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const validSize = size => Number.isFinite(size) && size > 0;
const REVEAL_RADIUS = 6;
const MAX_PENDING_SCANS = 32;

export function createExplorationJournal({nav, objective, water, explored = new Set(), discovered = new Set()}) {
  const providedCells = typeof nav?.revealCells === 'function';
  const required = providedCells ? ['point', 'visible'] : ['nearest', 'point', 'index', 'open', 'visible'];
  if (!nav || !required.every(name => typeof nav[name] === 'function')) {
    throw new TypeError('Exploration journal requires navigation.');
  }
  // Source-model regions can use different cell widths and floor heights. The
  // visibility provider owns that geometry; remembered cells retain its size.
  // Only the caller's explored set controls which records are actually drawn.
  const cellMetadata = new Map();
  const targets = () => [objective?.exit, ...(objective?.breakers ?? [objective?.maintenance])].filter(Boolean);
  const supplies = () => water?.pickups ?? [];
  const availableSupplies = () => supplies().filter(pickup => !pickup.collected && discovered.has(pickup.id));
  const pendingScans = [];
  const scanStats = {lastAdvanceMs:0, maxAdvanceMs:0, maxCandidates:0, totalCandidates:0, completedScans:0, cancelledScans:0, coalescedRequests:0, omittedScans:0};
  let rememberedSize = explored.size, pendingTopology = nav.topologyVersion ?? 0;

  function cancelPending() {
    scanStats.cancelledScans += pendingScans.length;
    pendingScans.length = 0;
    rememberedSize = explored.size;
    pendingTopology = nav.topologyVersion ?? 0;
  }

  function syncPending() {
    if (explored.size < rememberedSize || pendingTopology !== (nav.topologyVersion ?? 0)) cancelPending();
    rememberedSize = explored.size;
  }

  function remember(cell, position, size) {
    if (!Number.isInteger(cell) || cell < 0 || !validPoint(position) || !validSize(size)) return;
    explored.add(cell);
    cellMetadata.set(cell, {position: [position[0], position[1]], size});
    rememberedSize = explored.size;
  }

  function reveal(player) {
    if (!validPoint(player)) return;
    syncPending();
    if (providedCells) {
      // Contract: a bounded local iterable of walkable, actually visible cells,
      // {i, position:[x,z], size}. The caller-owned set lets providers skip
      // known floor before visibility work and also respects external resets.
      for (const cell of nav.revealCells(player, REVEAL_RADIUS, explored)) {
        if (cell) remember(cell.i, cell.position, cell.size ?? nav.cellSizeAt?.(cell.i));
      }
    } else {
      // Compatibility with the original single-grid Level 0. A local cell-size
      // accessor can supply the spacing when there is no global nav.step.
      const start = nav.nearest(...player);
      if (start < 0) return;
      const step = nav.cellSizeAt?.(start) ?? nav.step;
      if (validSize(step)) {
        const center = nav.point(start), steps = Math.ceil(REVEAL_RADIUS / step);
        for (let x = -steps; x <= steps; x++) for (let z = -steps; z <= steps; z++) {
          if (x * x + z * z > steps * steps) continue;
          const point = [center[0] + x * step, center[1] + z * step], cell = nav.index(...point);
          if (nav.open(cell) && !explored.has(cell) && nav.visible(player, point)) {
            remember(cell, nav.point(cell), nav.cellSizeAt?.(cell) ?? step);
          }
        }
      }
    }
    revealLandmarks(player);
  }

  function revealLandmarks(player) {
    for (const target of targets()) {
      if (distance(target.position, player) < 7 && nav.visible(player, target.position)) discovered.add(target.id);
    }
    for (const pickup of supplies()) {
      if (!pickup.collected && distance(pickup.position, player) < 5 && nav.visible(player, pickup.position)) {
        discovered.add(pickup.id);
      }
    }
  }

  function requestReveal(player) {
    if (!validPoint(player)) return;
    if (typeof nav.scanRevealCells !== 'function') {reveal(player); return;}
    syncPending();
    // Nearby controls and supplies remain immediate; only map floor is queued.
    revealLandmarks(player);
    const previous = pendingScans.at(-1);
    if (previous && previous.player[0] === player[0] && previous.player[1] === player[1]) {scanStats.coalescedRequests++; return;}
    // Under sustained overload keep the active observation and recent visits.
    // Omitting an old waiting scan only leaves the map less complete; it cannot
    // invent observed floor or leave an ever-growing survey backlog.
    if (pendingScans.length >= MAX_PENDING_SCANS) {pendingScans.splice(1, 1); scanStats.omittedScans++;}
    pendingScans.push({player:[player[0], player[1]], iterator:null});
  }

  function advanceReveal({budgetMs = 3, maxCandidates = 256, now = () => performance.now()} = {}) {
    syncPending();
    const budget = Math.min(4, Math.max(0, Number.isFinite(budgetMs) ? budgetMs : 3));
    const limit = Math.min(256, Math.max(0, Number.isFinite(maxCandidates) ? Math.floor(maxCandidates) : 256));
    const started = now();
    let processed = 0;
    while (pendingScans.length && processed < limit && now() - started < budget) {
      const scan = pendingScans[0];
      scan.iterator ??= nav.scanRevealCells(scan.player, REVEAL_RADIUS, explored);
      const next = scan.iterator.next();
      if (next.done) {pendingScans.shift(); scanStats.completedScans++; continue;}
      processed++;
      const cell = next.value;
      if (cell) remember(cell.i, cell.position, cell.size ?? nav.cellSizeAt?.(cell.i));
    }
    // A single visibility call is indivisible; the deadline is checked before
    // the next candidate. The count limit also bounds work with mocked clocks.
    scanStats.lastAdvanceMs = Math.max(0, now() - started);
    scanStats.maxAdvanceMs = Math.max(scanStats.maxAdvanceMs, scanStats.lastAdvanceMs);
    scanStats.maxCandidates = Math.max(scanStats.maxCandidates, processed);
    scanStats.totalCandidates += processed;
    return {processed, pending:pendingScans.length > 0};
  }

  function draw(canvas, player, yaw) {
    const context = canvas?.getContext('2d');
    if (!context || !validPoint(player)) return false;
    const scale = Math.min(canvas.width / (nav.maxx - nav.minx), canvas.height / (nav.maxz - nav.minz));
    const offsetX = (canvas.width - (nav.maxx - nav.minx) * scale) / 2;
    const offsetZ = (canvas.height - (nav.maxz - nav.minz) * scale) / 2;
    const xy = point => [offsetX + (point[0] - nav.minx) * scale, offsetZ + (point[1] - nav.minz) * scale];
    const dot = (point, color, radius) => {
      const [x, z] = xy(point);
      context.fillStyle = color;
      context.beginPath(); context.arc(x, z, radius, 0, Math.PI * 2); context.fill();
    };
    const label = (point, text) => {
      const [x, z] = xy(point);
      context.fillStyle = '#ece8d0'; context.font = '12px sans-serif';
      context.fillText(text, Math.max(8, Math.min(canvas.width - 68, x + 10)), Math.max(16, z - 9));
    };

    context.fillStyle = '#10170f'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#46503b';
    for (const cell of explored) {
      const saved = cellMetadata.get(cell);
      const position = saved?.position ?? nav.point(cell), size = saved?.size ?? nav.cellSizeAt?.(cell) ?? nav.step;
      if (!validPoint(position) || !validSize(size)) continue;
      const [x, z] = xy(position);
      context.fillRect(x, z, Math.max(1, size * scale), Math.max(1, size * scale));
    }
    for (const pickup of availableSupplies()) {
      dot(pickup.position, '#d9ba84', 3);
      label(pickup.position, '飲料');
    }
    for (const target of targets()) if (discovered.has(target.id)) {
      dot(target.position, target.id === 'exit' ? '#a6d8b9' : '#e5bd79', 6);
      label(target.position, target.id === 'exit' ? '出口' : (objective?.breakers?.length ?? 1) > 1 ? '配電盤' : '保守制御');
    }
    dot(player, '#8ee9f2', 5);
    const [x, z] = xy(player);
    context.strokeStyle = '#8ee9f2'; context.beginPath(); context.moveTo(x, z);
    context.lineTo(x + Math.sin(yaw) * 14, z - Math.cos(yaw) * 14); context.stroke();
    return true;
  }

  return Object.freeze({
    reveal, requestReveal, advanceReveal, cancelPending, draw,
    get pending() {syncPending(); return pendingScans.length > 0;},
    get diagnostics() {syncPending(); return {...scanStats, pendingScans:pendingScans.length};},
    get availableSupplies() {return availableSupplies();},
    get suppliesNote() {
      if (availableSupplies().length) return '見つけた飲料の場所を TAB の探索記録に残した。拾った飲料は I で使える。';
      return supplies().some(pickup => discovered.has(pickup.id)) ? '飲料は I の持ち物から使える。' : '';
    }
  });
}
