// The renderer and rig/geometry readers use the same immutable GLB bytes.
// Retain only the startup models with two readers, releasing each on reuse.
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
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.arrayBuffer();
  })();
  if (batch?.has(url)) {
    batch.set(url, buffer);
    buffer.catch(() => { if (batch.get(url) === buffer) batch.set(url, null); });
  }
  return buffer;
}
