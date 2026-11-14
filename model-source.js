// The renderer and rig/geometry readers use the same immutable GLB bytes.
// Retain only the startup models with two readers, releasing each on reuse.
// Keep caller/source identities intact; only transport uses the derived GLBs.
const optimizedModelURLs = new Map([
  'flashlight', 'hazmat', 'skinstealer', 'warning-signs-set', 'office-chair',
  'electrical-box', 'sculpture-bust-roza', 'vent',
].map(name => [`assets/models/${name}.glb`, `assets/models/optimized/${name}.glb`]));
let pendingReuse = null;

export function beginModelLoadBatch(urls) {
  pendingReuse = new Map(urls.map(url => [url, null]));
}

export function endModelLoadBatch() {
  pendingReuse?.clear();
  pendingReuse = null;
}

export function loadModelBuffer(url) {
  const batch = pendingReuse;
  if (batch?.get(url)) {
    const buffer = batch.get(url);
    batch.delete(url);
    return buffer;
  }
  const buffer = (async () => {
    const response = await fetch(optimizedModelURLs.get(url) ?? url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.arrayBuffer();
  })();
  if (batch?.has(url)) {
    batch.set(url, buffer);
    buffer.catch(() => { if (batch.get(url) === buffer) batch.set(url, null); });
  }
  return buffer;
}
