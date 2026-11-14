# Runtime and model optimization (2026-11-14)

Baseline: `dee59cca8a47af353f411608a3c32cd9763631b0`. The previous intro-video and title optimizations are retained.

## Measured changes

| Measurement | Before | After |
| --- | ---: | ---: |
| Eight optimized GLBs, raw bytes | 46,875,448 | 19,141,940 (-59.16%) |
| All 16 runtime GLBs, raw bytes | 94,545,912 | 66,812,404 (-29.33%) |
| Eight optimized GLBs, local gzip level 6 estimate | 41,863,908 | 14,243,007 |
| Model images uploaded to WebGL | 68 | 47 |
| Model RGBA8 textures including mipmaps, calculated storage | 604 MiB | 364 MiB |
| Uploaded textures including generated images, calculated RGBA+mip storage | 613.1 MiB | 373.1 MiB |
| Cold local page transfer, without HTTP compression | 107,027,467 bytes | 79,296,915 bytes |
| GPU process proportional resident memory after loading, software renderer | 926.1 MiB | 666.8 MiB |
| Idle pause/inventory WebGL draws in about five seconds | 273 / 182 | 0 / 0 after the state-entry frame |
| Lightweight gameplay median frame interval, software renderer | 1,384.4 ms | 206.1 ms |
| Fresh A* search scratch allocation | 4,290,195 bytes per search | One lazy, reused 4,290,195-byte allocation |

The memory and browser measurements use Linux Chromium, SwiftShader, a 960×720 CSS viewport and `?qa&ratio=.5`. Texture estimates exclude renderbuffers and driver overhead. The candidate reports a simulated `navigator.deviceMemory=4`; the host is not a 4 GB Windows PC. Its initial lightweight setting uses no MSAA and two model-loading workers. The baseline used three workers. Cold local readiness was **10.689 → 11.882 seconds**; this does not establish a loading-time improvement. Lower download size and lower memory use are separate results.

An isolated source-scene benchmark at the same 480×360 internal resolution, geometry, camera and draw count measured the existing lightweight setting at 1,281 ms/frame and the updated one at 472 ms/frame. This software backend supports four-sample MSAA and rounded the old request for two samples up to four; the new request uses zero samples. These are software-GPU timings, not physical-GPU or whole-game FPS promises. Standard quality still requests four samples. Its fixed-camera before/after captures were byte-identical.

The whole-game lightweight comparison keeps the same CSS viewport, output resolution and quality selection. The corrected adaptive controller reduced the candidate's internal resolution from 480×360 to 336×251; the baseline stayed at scale 1. Both submitted about 497,760 triangles and 104–105 draws per frame. Thus the whole-game result includes both the MSAA change and the intended adaptive resolution change; it is not an equal-internal-resolution comparison.

## Implementation and tradeoffs

- Original model files remain untouched. Eight optional GLB copies remove only image maps that this renderer never sampled. All retained image and buffer-view bytes, accessor data, geometry, node transforms, mesh order/names, skins, animation and source/license metadata are preserved. No Draco, meshopt decoder, replacement models or new texture codec is needed.
- `model-source.js` redirects transport for those eight files while retaining original caller identities and the existing shared renderer/rig request cache.
- The loader avoids decoding/uploading unselected images even for unchanged GLBs.
- Lightweight quality removes multisample edge antialiasing; standard quality is unchanged. Adaptive resolution now accepts bounded samples from very slow frames instead of ignoring every frame below 4 FPS. Its existing scale floor remains 0.5, and simulation/cinematic clocks are unchanged.
- Browsers reporting at most 4 GB initially select the existing lightweight option and use two actor-loading workers. Users can still select standard quality. Browsers without the optional memory hint keep the standard default; on a 4 GB PC, select **軽量 / 動作優先** manually if necessary.
- Pause and inventory keep a still scene behind their DOM controls. State changes, resize, pixel-density changes and visibility restoration invalidate it.
- A* reuses scratch arrays. Search order, costs, cache behavior, gates and returned routes are unchanged. The real-map parity harness compared 308 routes across gate transitions. A non-isolated timing sample improved 241.86→64.74 ms per 160 searches; allocation removal and path parity are the stronger evidence, rather than an FPS claim.

The authored Dreamcore terrain remains detailed: no within-primitive duplicate vertices, duplicate triangles or unused vertices were found. Its geometry was retained to preserve the appearance and precomputed collision surface. This scene can still be expensive on weak GPUs.

## Reproduction and limits

Run `node --test tests/*.mjs` (31 tests passed). Regenerate the optional GLBs with `node scripts/optimize-models.mjs`; the tests independently compare retained data and deterministic outputs against the originals.

The existing skinned-actor regression was also executed against the derived Hazmat and Skinstealer files: bind pose, walking/running, collapse, normals, named joints and buffer ownership checks passed.

Actual Chromium regression covered settings and the 4 GB default, movement/map, flashlight pickup and use, water consumption rules, locker entry/hiding/exit, pause/inventory/resizing, Bacteria sight/chase/capture/struggle escape/death/retry, and title return. An existing QA route walked the real collision/navigation grid to obtain the crowbar, pry the cover, restore all three breakers, open both logical and visible gates, enter Dreamcore and complete the escape. Rendering was suppressed only during long traversal in that functional run, then restored at interactions and visual checkpoints; no objective state or simulation time was forced. Performance measurements were separate, with normal rendering. The distinct Skinstealer encounter was not played through; its actual derived rig and pose data were tested as described above.

Natural intro playback, pause/resume, ending/fade, awakening and return to play passed with the normal renderer restored. Intro frames made zero world draws. Repeated start/ESC, help/back, real resize and DPR changes also passed. Visibility restoration was checked with a synthetic event because the headless environment cannot reproduce a physical tab switch. There were no application JavaScript or WebGL errors.

Serve the directory through HTTP for browser tests; ES modules and model/media fetches require it. The runtime uses local game/model/audio dependencies. The official YouTube title player remains unchanged and needs internet access. Its actual playback was blocked by the cloud network and could not be verified. Windows hardware, physical GPU behavior and a true 4 GB memory limit remain untested.

Original credits and asset restrictions continue to apply; optimization grants no additional reuse or distribution rights.
