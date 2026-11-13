# Credits — 2026-11-13 additions

The sections below this block describe the state on 2026-11-12 and remain valid for the assets they list. This block records what was added on 2026-11-13.

## Models added (all supplied and approved by the owner)

| File | Title / author | Licence | Use and changes |
| --- | --- | --- | --- |
| `assets/models/electrical-box.glb` | [Electrical box - FREE](https://sketchfab.com/3d-models/electrical-box-free-383a234d6d80421fbe67080048cbbc70) — Mathieu Godard | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (embedded metadata) | Unmodified copy. Scaled to 0.52 m height and mounted on the wall at each of the three breakers. |
| `assets/models/office-chair.glb` | [Office Chair](https://sketchfab.com/3d-models/office-chair-69208f9465c346308a2bf423c7e5b8f6) — Tomaso | CC BY 4.0 (embedded metadata) | Unmodified copy. Scaled from centimetres to 1.02 m height; eight placements, several facing a wall. |
| `assets/models/vent.glb` | [Vent [Low Poly Realist]](https://sketchfab.com/3d-models/vent-low-poly-realist-91ee1772857540e6bdc3aebcc696b3ae) — Islide | CC BY 4.0 (embedded metadata) | Unmodified copy. Eight wall placements at 2.2 m. |
| `assets/models/cardboard-box.glb` | [Cardboard Box 01](https://polyhaven.com/a/cardboard_box_01) — Poly Haven | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (Poly Haven's site-wide licence; not stated inside the download) | **Converted**: the owner's download is a Blender 3.0 `.blend`. `tests/convert_blend_mesh.py` read its vertices, polygons and UVs and wrote a GLB with the shipped 2K diffuse JPEG embedded unchanged. Flat normals were recomputed; roughness and normal maps are not used. Seven placements; boxes can be searched. |

SHA-256 of the four files is recorded in `tests/added-models-20261113-sha256.json`. The Sketchfab pages were not opened during this work; author and licence come from each file's embedded metadata. No other model was added. The crowbar is an inventory item with the owner's icon only — **its 3D model (`crowbar.glb`, Superior, CC BY 4.0) is not in the game** and would need the owner's approval first.

Existing approved models are also reused in new places: the bust (five single busts), the warning-sign set (six extra wall signs), the locker (six more) and the almond-water bottle (five more).

## Audio added

See [AUDIO.md](AUDIO.md) for files, hashes and playback details. Freesound pages and the Pixabay licence summary were read on 2026-11-13.

| Use | Recording | Licence | Credit required |
| --- | --- | --- | --- |
| Crowbar prying a cover | [Metal Door Squeaking 8 (Medium)](https://freesound.org/people/mathewhenry/sounds/700705/) — MathewHenry | CC0 1.0 | No |
| Locker opening / closing | [squeaky metal locker open close.wav](https://freesound.org/people/toddcircle/sounds/442370/) — toddcircle | CC0 1.0 | No |
| Bust collapse; a stone going over a pit edge | "The stone falls to the ground" — Pixabay (uploader not recorded in the file) | [Pixabay Content License](https://pixabay.com/service/license-summary/) | No (appreciated) |
| Skinstealer transformation | "Flesh growing horror" — tanweraman (Pixabay 392360) | Pixabay Content License | No |
| Heartbeat during and after a capture | "Heartbeat tense" — pwlpl (Pixabay 377250) | Pixabay Content License | No |
| Music while pursued | "SFX6 horror suspense hiding heartbeat loop" — yarzur_ofc (Pixabay 323052) | Pixabay Content License | No |

The Pixabay licence forbids selling or distributing the content on a standalone basis. Serving these files as part of the game is ordinary use, but the folder must not be offered as a sound pack.

## UI images added

`assets/ui/` holds unmodified copies of the owner's generated images (inventory bar, notice tape, arrow marker, warning dialog frame, brush-written 死, locker interior, film-edge overlay) and three 128 px item icons rendered from the approved item models. Hashes and sources are in the owner's `asset-audit.json` (Backrooms-UI-Preview-20261113). The title logo there is byte-identical to the existing `assets/title-logo.png`. The tool that generated the images and its terms were not part of this work; confirm them before publishing.

## Check before any web publication

Publication on the web is distribution. These remain unresolved (details in the sections below and in AUDIO.md):

- **Backrooms VR room [Baked]** — Sketchfab Standard licence: confirm that embedding in a publicly served game is allowed.
- **Bacteria** and **Skinstealer** — underlying character / commercial-game rights; uploader authority for Skinstealer.
- **Hazmat suit** — author, source and licence unknown.
- **Fluorescent buzz** (`backrooms-buzzing-sound-effect.mp3`) — author and permission unknown.
- **Chant** (`2okyou.wav`) — creator and permission unknown.
- **Windows error sound** — Microsoft does not permit redistribution of Windows sound files.
- **Freesound HQ MP3 preview** of the breathing recording (unused but present on disk).
- **Wall-writing fonts** and **generated UI images** — terms of the fonts / generator.
- **CC BY models** (VR, Original, Dreamcore, Bacteria, almond water, locker, flashlight, signs, electrical box, chair, vent) — attribution must stay visible; the in-game credits list them.
- **User-shot intro video** — the owner's own footage; check for identifiable people or places before publishing.

---

# Credits and asset restrictions

## Bust and physics library (local prototype)

- [Sculpture Bust of Róża Loewenfeld](https://sketchfab.com/3d-models/sculpture-bust-of-roza-loewenfeld-fc6e731a0131471ba8e45511c7ea9996), Virtual Museums of Małopolska; CC0 1.0 according to the original file metadata and its Sketchfab listing. The user selected the existing file from their site. The preserved source bytes have SHA-256 `a8a49ef2223f66de00d00a2f2600ab65f5d0568b62847b8743cbed7822e2bced`. The site's GitHub file and local file have not independently been compared byte-for-byte.
- [cannon-es](https://github.com/pmndrs/cannon-es), version 0.20.0, MIT. Its unmodified bundled ES module and full copyright/licence notice are retained under `vendor/cannon-es-0.20.0/`. The npm package was obtained without running install scripts.
- The single approved GLB is loaded once and drawn as 30 instances. Its diffuse image is preserved; this renderer does not implement the model's full specular-glossiness or normal-map material. The asymmetrical 4×4 / 3×3 / 2×2 / 1 stack aligns each upper bust with a head below. Each rigid body uses five simple box approximations, not the original visual mesh, with navigation-derived wall boundaries and a finite local safety boundary. No additional pedestal model or generated sound is used.

This is the local expansion work version as documented on 2026-11-12. It renders four previously approved environment source GLBs in nine placements: one Backrooms VR, six Original Backrooms, one Baked room using its unchanged source file, and one Dreamcore field. Original room meshes, UVs, textures and materials form the environment. Instance transforms, ownership clipping and local apertures create 11 connections and three indoor loops. The only generated environment surface is a 16-triangle, approximately 1.25 m outdoor threshold using an existing carpet material.

The previously selected hazmat and newly user-approved Skinstealer models are added for local development, subject to the unresolved rights below. No new audio recording was selected. `baked-room-original.glb` restores the previously approved Baked model's raw source file. Source GLB bytes are unchanged. Runtime adaptations are recorded below and in [MODEL-USAGE.md](MODEL-USAGE.md). This document does not certify final browser acceptance, reflection into the original game folder, or exhibition rights clearance.

The player examines the unpowered exit, restores its circuit in Baked's upper gallery, returns to open the door, and walks into the existing Dreamcore field. Item collection is optional; there is no quota. The Bacteria pursuer and Almond water item are previously selected models.

## Backrooms VR

- Author: [VTX](https://sketchfab.com/VTX_car); source: [Backrooms VR](https://sketchfab.com/3d-models/backrooms-vr-1a5c397f0a43408fa38b09ea5c041149).
- Embedded licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- `assets/models/level0.glb` is placed as authored room geometry, including its existing walls, floor, ceiling and materials. Runtime ownership clipping and local apertures connect it to the neighbouring Original placements. The source file, mesh buffers and UVs are retained.
- The existing closed south double-door assembly using `Exit_Door` is also reused at the outdoor exit, with translation, rotation and uniform scale 1.03. Opening masks the leaf interior and releases its collision while retaining the source frame. It is not a newly modelled door or a hinge animation.

## Original Backrooms

- Author: [Huuxloc](https://sketchfab.com/rjh41); source: [Original Backrooms](https://sketchfab.com/3d-models/original-backrooms-e5c6b30995ff442d9852a1dd697aaef1).
- Embedded licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- `assets/models/original-backrooms.glb` supplies the actual room geometry for six translated placements. Copies share source geometry, UVs and materials. Ownership clipping and local apertures form the connections; a material-scoped cut removes overlapping carpet at the Baked entrance.
- The existing `NewCarpet` material is reused on the small generated outdoor threshold. The old implementation's socket-only use is historical, not the description of the current environment.

## Backrooms VR room [Baked]

- Author: [abhayexe](https://sketchfab.com/abhayexe); source: [Backrooms VR room [Baked]](https://sketchfab.com/3d-models/backrooms-vr-room-baked-b3dc718ea39248feb0120f1c6171419d).
- Embedded licence: [Sketchfab Standard](https://sketchfab.com/licenses).
- Current placement: `assets/models/baked-room-original.glb`, 746,108 bytes, copied unchanged from the previously approved `backrooms_vr_room_baked.glb`. SHA-256: `bedeb5ab8740072d53b9b5feca02894f33cd250c63b4d8b931e7719281285a54`.
- Runtime changes include placement, a −90-degree Y rotation, uniform scale 3, and a material-scoped cut of the 35 recessed pit bottoms for the fall sequence. The source file, sill, materials and pit walls are retained. The upper gallery leading to maintenance is normally walkable; narrow strips and pits are excluded from ordinary player and enemy navigation. The player can deliberately step into a pit and fall. Full-room walking and final browser acceptance are not claimed.
- The prior 809,004-byte `assets/models/baked-room.glb`, whose floor had been flattened and whose carpet material had been rebuilt, remains as a historical copy. It is not the Baked environment loaded by the current layout.
- Review the applicable Free Standard licence conditions and school-festival exhibition permissions. Do not distribute the source asset without establishing the rights. Restoring the raw geometry does not establish any additional licence permission.

## Dreamcore liminal space

- Author: neutron star; source: [Dreamcore liminal space](https://sketchfab.com/3d-models/dreamcore-liminal-space-875b0005014d4b42bf1e9b2ff53ed4c4).
- Embedded licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- `assets/models/dreamcore.glb` is now placed as the outdoor destination, with translation, 180-degree Y rotation and ownership clipping at the building boundary. Its existing terrain, textures and UVs are rendered. The small threshold connects the doorway to the source terrain's slope; there is no long generated bridge or teleport to the field.

## Bacteria - Kane PIxels Backrooms

- Author: [Roman Trace](https://sketchfab.com/RomanTrace); source: [Bacteria - Kane PIxels Backrooms](https://sketchfab.com/3d-models/bacteria-kane-pixels-backrooms-1fb71d64d7164ae8b6271922b3378e0b).
- Embedded licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- `assets/models/bacteria.glb` is the existing pursuer, with articulation, movement and darker material applied by the game. The model depicts a character inspired by Kane Pixels' Backrooms; confirm underlying character and other rights before exhibition or distribution.

## Almond water from backrooms

- Author: [pedrohmm123](https://sketchfab.com/pedrohmm123).
- Source: [Almond water from backrooms](https://sketchfab.com/3d-models/almond-water-from-backrooms-c4d96c6f79cc4eabb1f2c758312baf15).
- Embedded licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The GLB's `asset.extras` records the title, author, source URL and `CC-BY-4.0`. In the prior source check, the page returned HTTP 403; its search listing matched the author and title. This update does not claim a new rights verification.
- The user-selected `almond_water_from_backrooms.glb` remains unchanged at `assets/models/almond-water.glb`. SHA-256: `dae7542b596b9846388d1fc8cf4d33a50fc9f9e7bacbcf677ec53cb8177e60ea`.
- Instances are centred, scaled to 24 cm height and placed on the floor at runtime. A collected instance is hidden and added to inventory. Drinking one restores up to 60 stamina, with a maximum stack of three. It does not grant invulnerability. No author endorsement is implied.

## Retained wallpaper and unfinished concepts

[Backrooms Wallpapers](https://sketchfab.com/3d-models/backrooms-wallpapers-2c36079726a84d5db6369c7261d73152) by [Huuxloc](https://sketchfab.com/rjh41) supplied `BR_2.jpg` to the older generated-wall Level 0. That texture and implementation remain historical assets; they are not the current world-building path. The prior search index identified Creative Commons Attribution, but the exact version remains unconfirmed because direct access returned HTTP 403 and the ZIP had no licence text. Other references described CC BY 4.0. Preserve attribution, confirm the exact version before applicable use, and identify changes.

The user-selected hazmat model and explicitly approved Skinstealer are included for local development. The hazmat asset was obtained from the user's `Downloads/escape-the-backrooms-hazmat.zip` (`source/backrooms_hazmat.glb`); its embedded author, original source and licence were not established. Its copied GLB SHA-256 is `a31023b451894dfb749a5aa88269134588eef316275c30f336796a73a101caf7`.

Skinstealer is attributed in its embedded metadata to taggedk, [Escape The Backrooms - Skinstealer](https://sketchfab.com/3d-models/escape-the-backrooms-skinstealer-119e366f12b644ad87605fdad9f00d45), with the uploader's CC BY 4.0 declaration. Its complete downloaded GLB SHA-256 is `6706d83211ee4e396810ec3483e83f8714e3b8ae09201daebe2658ba18d4d743`. The model is described as originating from a commercial game; the uploader's authority and underlying character/game rights have not been verified. Neither model is cleared for exhibition, publication or redistribution merely by its presence or metadata. Check rights before the festival.

Neither asset contains animation clips. Runtime walking and the hazmat collapse/swap use procedural bone and transform changes rather than authored animations. Existing recorded footstep effects are reused. The Skinstealer voice uses user-requested distortion without added noise. The user's own live-action footage is included as a muted H.264 SDR derivative, while the HDR original is preserved separately. Any other new 3D model requires prior user approval.

## Audio

See [AUDIO.md](AUDIO.md) for exact files, source links, licence conditions and changes. Footsteps and door use Kenney recordings; enemy breath uses the giddster recording. The two user-selected creature voices and their separate licences are listed below. The shipped Freesound file is an HQ MP3 preview, not the original WAV, and explicit official terms for using that preview encoding in a product remain unconfirmed.

The fluorescent ambience uses the user-selected `backrooms-buzzing-sound-effect.mp3`, copied without modification from the existing `tomoponz.github.io/assets/sfx` folder for local prototyping. Its metadata names 101soundboards.com; the original author, exact provenance, and permission for school-festival exhibition, publication or distribution remain unconfirmed. A similarly named online recording has a different duration, so identity is not established. Do not exhibit, publish or distribute this sample until the rights are established.

The prototype's audio set has not been cleared as a complete set for exhibition, publication or distribution. The subsequently user-selected creature recordings and the specifically requested Skinstealer distortion processing are documented below. Source geometry restoration does not change the remaining rights restrictions.

The pre-expansion credits are preserved at [historical-CREDITS-before-expansion-20261112-154550.md](tests/historical-CREDITS-before-expansion-20261112-154550.md); the earlier credits remain at [historical-CREDITS-before-original-world-20261111.md](tests/historical-CREDITS-before-original-world-20261111.md).


## Locker

“Locker” by Gonsaku — [source](https://sketchfab.com/3d-models/locker-af2d6be0be9e4b94ab6575be5f414ee2), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The downloaded GLB's embedded metadata identifies this author, source and licence; the listing itself was not independently accessible during inspection. The local game widens and deepens instances, places copies in the existing world, and cuts a narrow viewing slit in the door at runtime. The downloaded original `locker.glb` itself is preserved unchanged. The door uses its supplied opening and closing animation clips. ShareAlike terms apply to adaptations; confirm the uploader's rights and conditions relevant to exhibition before use.


## User-selected creature voices

“Monster Screech.wav” by YuriNikolai — [source](https://freesound.org/people/YuriNikolai/sounds/361051/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Bacteria capture. Modified by trimming, reduced gain, fades, resampling and PCM conversion.

“human monster 01.wav” by monosfera — [source](https://freesound.org/people/monosfera/sounds/319362/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Skinstealer transformation and capture. The user-approved preview is used unchanged. Source notes describe slower pitch, extreme distortion, bit reduction, filtering, normalization, fades and limiting without added noise.


## Flashlight

“Flashlight” by donnichols — [source](https://sketchfab.com/3d-models/flashlight-98f0519806ff4c4bbfcb9c1c7a922896), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The original GLB is unmodified; the game positions it on the floor and toggles its visibility when picked up. The author and licence were checked against the listing and embedded metadata.


## User-selected chant

The [existing chant](https://tomoponz.github.io/assets/sfx/2okyou.wav) used in the user’s [Backroom page](https://tomoponz.github.io/liminal/index.html) is used unchanged for the death sequence at reduced playback gain. Its original creator and permission for festival exhibition or redistribution are unverified. The local copy’s SHA-256 is recorded in [AUDIO.md](AUDIO.md).


## User-selected warning signs

“Warning Signs Set” by Caboose3d — [source](https://sketchfab.com/3d-models/warning-signs-set-2e8ef8f837c445578e3d08bdcd37ee3b), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) according to the GLB embedded metadata. The local file came from the user’s [Backroom site](https://tomoponz.github.io/liminal/). The game selects and repositions individual sign meshes; the original GLB remains unmodified. The original listing and uploader rights could not be independently verified.


## Windows error recording

Windows SystemHand, locally mapped to `C:\Windows\Media\Windows Foreground.wav`, is used at reduced gain for fictional in-game warnings. Its author and festival-use permission are unverified. [Microsoft copyright permissions](https://www.microsoft.com/en-us/legal/intellectualproperty/copyright/permissions) restrict standalone redistribution of Windows sound files; no public release or redistribution has been performed.

## Wall-writing image typography

The local transparent wall-writing images were generated using the Windows fonts HGRGY (`HGRGY.TTC`) and UD Digi Kyokasho (`UDDigiKyokashoN-R.ttc` and `UDDigiKyokashoN-B.ttc`), with individual glyphs rotated and adjusted for the two approved phrases. The font files themselves are not included. The applicable font terms for festival exhibition and distribution of the resulting images have not been verified.


## Warning sound replacement (2026-11-13)

The active warning cue now uses **Beep error 2** by **SamsterBirdies**, [Freesound source](https://freesound.org/people/SamsterBirdies/sounds/581604/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The owner downloaded and selected the original WAV: `assets/audio/581604__samsterbirdies__beep-error-2.wav` (15,784 bytes; SHA-256 `8758ed4c42ca3775ae913c804be961d5b2237e6184431b5accf95a1c791f9675`). Copied byte-for-byte, without synthesis or processing; existing warning gain, timing, mute and overlap rules are unchanged.

The former `windows-error.wav` is retained locally for preservation only and is no longer referenced by the audio manifest. It must be excluded from any public package. Earlier Windows-sound descriptions above are historical, not the active playback path. No public deployment is claimed by this change.
