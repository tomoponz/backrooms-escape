## Enemy footstep distance adjustment — 2026-11-13

Bacteria and the moving Hazmat/Skinstealer use the same existing enemy-step recordings with quadratic distance attenuation: full near-field level at 0–2 m, approximately 67% at 6 m, 30% at 12 m, 7.4% at 18 m, silence at 24 m. Percentages are pre-compressor amplitude relative to the close level, not perceived loudness. Patrol remains at 72% of chase level. The previous constant distant-volume floor is removed. Stereo pan, individual saved level, master volume, and all other cues (including the approved 3x chant) are unchanged. Phantom atmospheric footsteps intentionally retain their independent low-volume cues. 19 audio contract tests passed; no speaker listening or new native output measurement performed. Reload the game to apply.

## Chant gain adjustment — 2026-11-13 14:49 JST

At the owner's request, only the chant cue gain changed from 0.3 to 0.9 (3x amplitude, approximately +9.54 dB before the shared compressor). Existing per-sound saved levels and master volume are untouched; the same saved chant setting therefore receives 3x its previous pre-compressor gain after reloading the game. The original 2okyou.wav is unchanged (SHA-256 850511CAFFB13EA72E29E1E61279EB00E9E93C101494D0991921F6DABD8B56FF). The shared compressor remains at threshold -14 dB, knee 8 dB, ratio 8:1; final output and perceived loudness are not guaranteed to triple. 18 sample playback tests passed. No physical listening or new native output/clipping measurement was performed for this adjustment. Reload required for an already-open game; server restart not required.

# Audio — 2026-11-13 additions

Six recordings supplied by the owner were copied **byte for byte** from `[local source path omitted]` into `assets/audio/`. Nothing was synthesised, re-encoded, trimmed on disk or filtered. SHA-256 values are in `assets/audio/added-20261113-sha256.json`. The fluorescent buzz, the player's walking and running recordings, the Bacteria screech, the Skinstealer voice, the chant and the warning tone are unchanged.

| Manifest key | File | Length | Use | Playback |
| --- | --- | --- | --- | --- |
| `bust_fall` | `the-stone-falls-to-the-ground.mp3` | 6.35 s | The bust pile collapsing; also, quietly, once when the player first comes close to an open pit | The file holds two similar falls. One is chosen at random each time: 0.00–1.74 s or 3.46–5.06 s (`AUDIO_SEGMENTS` in `horror-audio.js`). The file itself is not cut. |
| `pry` | `700705__mathewhenry__metal-door-squeaking-8-medium.wav` | 1.88 s | Crowbar opening the jammed breaker cover | Whole file |
| `locker_open`, `locker_close` | `442370__toddcircle__squeaky-metal-locker-open-close.wav` | 6.55 s | Locker door | Opening: 0.10–1.88 s when the door starts to move. Closing: 3.50–5.90 s about 1.15 s later. |
| `transform` | `tanweraman-flesh-growing-horror-392360.mp3` | 3.19 s | Hazmat figure turning into the Skinstealer | Whole file. (The earlier Skinstealer voice now plays only at its capture.) |
| `heartbeat` | `pwlpl-heartbeat-tense-377250.mp3` | 5.07 s | While held by a pursuer, then fading over about 14 s after breaking free | Looped; level driven by the game (`setLoop`). Gain 0.5 before the user's mixer level. |
| `chase_bgm` | `yarzur_ofc-sfx6-horror-suspense-hiding-heartbeat-loop-323052.mp3` | 16.03 s | While a pursuer is chasing the player | Looped; fades in over about 0.6 s, out over about 3 s. Gain 0.4. Stops during the capture itself. |

Existing recordings gained these uses on 2026-11-13 (no new files): the metal impact (`alert`), the door (`door`), the latch (`locked`) and the enemy footstep recordings are played quietly and panned as occasional sourceless noises; the latch also plays when the dead exit or the jammed cover is tried; the fluorescent loop is briefly gated when lights sag.

Loudness: every new key appears in the per-sound mixer (`audio-settings.html`) and goes through the existing master volume and compressor. The capture screech keeps its earlier level. Listening on the exhibition speakers is still required; no physical listening test was done.

Licences were checked on 2026-11-13: the two Freesound recordings are CC0; the four Pixabay recordings fall under the Pixabay Content License (free use, no attribution required, no standalone redistribution). See [CREDITS.md](CREDITS.md).

---

# Current playback update (2026-11-12)

Enemy breathing has been removed from the active manifest, so restoring mixer defaults does not make it play again. The source recording remains preserved. The user-selected Bacteria, Skinstealer, warning and chant recordings remain in use. The individual mixer now permits 0–800%; a shared compressor means output loudness need not scale linearly. Earlier change notes below describe historical states.

# Audio sources and playback

The game uses existing audio files listed in `assets/audio/manifest.json`. `horror-audio.js` plays these files rather than generating substitute sounds. Missing or undecodable files and unassigned cues are silent. Playback requires a user gesture; volume and mute are controlled in the game. Runtime adjustments include gain, stereo positioning for the enemy, and a master compressor. There is no playback-rate or filter change. Enemy breath and the user's selected fluorescent ambience loop. The fluorescent interruption briefly gates the recorded sound; no substitute is generated.

## Sources used

All paths below are relative to `assets/audio/`. The fluorescent sample has unknown exhibition and distribution rights and is used solely for this local prototype at the user's request. The remaining sources below are identified by their distributors as CC0 1.0; their original creators' rights claims have not been independently audited.

| Manifest key | File | Source and use |
| --- | --- | --- |
| `ambience` | `backrooms-buzzing-sound-effect.mp3` | Existing local sound from `[local source path omitted]`, used for the fluorescent loop in the local prototype only. Its metadata names 101soundboards.com; its original author and exhibition/distribution permissions are unknown. A [similarly named listing](https://www.101soundboards.com/sounds/772739-backrooms-buzzing-sound-effect) has a different duration and is not confirmed to be the same file. |
| `player_walk`, `player_run` | `kenney-impact/footstep_carpet_000.ogg`, `kenney-impact/footstep_carpet_001.ogg`, `kenney-impact/footstep_carpet_002.ogg` | [Impact Sounds 1.0](https://kenney.nl/assets/impact-sounds) by Kenney, CC0 1.0. Carpet footfalls selected in sequence. |
| `enemy_step` | `kenney-impact/footstep_concrete_000.ogg`, `kenney-impact/footstep_concrete_001.ogg`, `kenney-impact/footstep_concrete_002.ogg` | Kenney, Impact Sounds 1.0, CC0 1.0. Enemy footfalls selected in sequence. |
| `alert` | `kenney-impact/impactMetal_heavy_000.ogg` | Kenney, Impact Sounds 1.0, CC0 1.0. Alert impact. |
| `enemy_breath` | `giddster-breathing-panicked-336530-hq.mp3` | [Breathing, panicked](https://freesound.org/people/giddster/sounds/336530/) by giddster, CC0 1.0. Looped enemy breath. |
| `door`, `locked` | `kenney-rpg/doorOpen_1.ogg`, `kenney-rpg/metalLatch.ogg` respectively | [RPG Audio](https://kenney.nl/assets/rpg-audio) by Kenney Vleugels, CC0 1.0. Door opening and latch. |
| `capture` | `bacteria-screech.wav` | [Monster Screech.wav](https://freesound.org/people/YuriNikolai/sounds/361051/) by YuriNikolai, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Bacteria capture. Modified: first 1.5 seconds, gain reduced by 10 dB, fades, resampling and 16-bit PCM conversion. |
| `skin_voice` | `skinstealer-extreme-approved.mp3` | [human monster 01.wav](https://freesound.org/people/monosfera/sounds/319362/) by monosfera, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Transformation and Skinstealer capture. The exact user-approved MP3 preview is used unchanged. Source notes report 75% speed/pitch, 28× drive with tanh distortion, 4-bit reduction (85% mix), atan distortion, filtering, normalization, fades and limiting; no added noise. |
| `chant` | `2okyou.wav` | [User’s Backroom site audio](https://tomoponz.github.io/assets/sfx/2okyou.wav), used in the death transition and result screen. The site identifies the local file but its original creator and exhibition/distribution rights are unverified; the URL bytes were not independently compared because direct transfer failed. Runtime gain 0.3; no edits or synthesis. |
| `warning_tone` | `windows-error.wav` | Windows SystemHand, `C:\Windows\Media\Windows Foreground.wav`; used for the fictional in-game warnings only, at gain 0.3 with the previous warning voice stopped before the next. Unmodified local copy. Microsoft does not grant blanket redistribution of Windows audio files; exhibition rights are unverified. |

The Freesound breath file is an unedited, publicly accessible HQ MP3 preview. Its original WAV download required login and was not obtained. The sound page identifies the recording as CC0; explicit official terms specifically addressing product use of the preview encoding were not confirmed. The Kenney files are unmodified copies; each package's original `License.txt` and a short source note are included alongside them.

The former, now unassigned `creature-capture.wav` recording was edited before this change: the first 1.4 seconds were downmixed to mono, scaled to 38%, and faded in over 35 ms and out over the last 300 ms. Original archive `monster_sfx.zip` SHA-256: `b9461ea4d877ccff23e563ac91680aacfc00c0457a5618e66f36cdb39a9973fd`; original `Monster SFX.wav` SHA-256: `b90ad6d2ff6c82b680af0a6adb9c850240947d62dd6f84cb9351bc0ef2496a07`; delivered `creature-capture.wav` SHA-256: `bd4d2686caacec54e283712d26608d43ba461f5c848ee2b1866feef84bc5276d`.

`flash`, `escape`, `death`, `pickup`, `power`, and `relay` are currently unassigned and silent. The previously used fluorescent recording remains on disk but is not played. Other included but unassigned recordings are candidates only and are not evidence that those cues play. See `TEST-REPORT.md` for the actual verification status. The final sound balance must be checked with the festival's speakers and playback environment.

The fluorescent sample is an unedited byte-for-byte copy (SHA-256 `789cff98e47f7c826a70111f489fce28b479d8d574db6b0babfb62af4489dbf3`). Its source and permission for festival exhibition, public release, and distribution remain unconfirmed. Do not exhibit, publish, or distribute it until rights are established. Playback uses the existing game volume control and compressor.

## 2026-11-12: targeted loudness adjustment

The user asked to retain the fluorescent beep and player walking/running sounds as before. Their recorded files, individual gains, rates, loop behavior, the default slider value (65%), and the master path are unchanged. No saved-volume migration was added: this version has no persisted audio preference. Relative to the previous voice gain, existing enemy footsteps use 2.5× and the alert uses 2×; the enemy-breath loop gain changes from 0.65 to 0.85, the door uses 1.06×, the locked latch 1.25×, and the capture recording 1.12×. These are playback gains, not edits to the files. The six unassigned cues remain silent. This volume-only change added no sounds. Subsequently, the two user-selected voices listed above were supplied by the user and substituted; the Skinstealer voice is distorted from the original without added noise. The existing intro video remains muted.

The previous and updated versions share a master compressor. Louder simultaneous sounds can cause compressor gain reduction, including on the otherwise unchanged fluorescent loop and footfalls; equal solo settings cannot guarantee identical perceived loudness in every mix. In the Chrome offline-render stress test, three simultaneous copies of each applicable cue, the fluorescent loop, the player run and enemy breath at maximum slider volume produced a peak of 0.8541 full scale (before adjustment: 0.8459). This is a finite test and not a brick-wall guarantee. `tests/audio-comparison-current.json` records the actual measurement; listen on the intended speakers before exhibition.

## User-selected voices (2026-11-12)

The original user-downloaded WAVs are preserved separately in `[local preserved originals]`; their hashes and detailed processing are recorded in `[local provenance record]`. Processed Bacteria audio is 1.5 s, −20.4 LUFS and −10.3 dBFS true peak. The exact approved Skinstealer MP3 is 10.780 seconds, −19.8 LUFS and −12.4 dBFS true peak. SHA-256: cb50fabf5ccbe4b3de43a07c7e8ec1017b45f8af777b1320898552e4bc4cb440. No added noise is described in the accompanying source notes. The source files and the existing beep and player footfalls were not overwritten. A new Skinstealer vocal stops the previous Skinstealer vocal so transformation and capture do not layer two copies.

The earlier mixed-audio measurement predates the final approved Skinstealer preview. The final Chrome measurement, including fluorescent ambience, running, enemy sounds, both approved creature voices, chant and door effects at maximum slider volume, peaked at 0.658248 full scale. See `tests/locker-audio-comparison-results.json`; this is not a physical listening test or a guarantee for every possible mix.


## User-selected chant

The user specified the existing chant used by their [Backroom page](https://tomoponz.github.io/liminal/index.html). The local source file `[local source path omitted]` and bundled copy match SHA-256 `850511caffb13ea72e29e1e61279eb00e9e93c101494d0991921f6dabd8b56ff`. It is unmodified 21.92-second PCM; the original author and exhibition licence remain unknown. It starts with the black death screen and stops on retry, title, mute, or loss of visibility.


## Windows warning sound

The user requested the PC’s standard Windows error sound for local use. The current SystemHand event maps to `C:\Windows\Media\Windows Foreground.wav`; its local copy is byte-identical (SHA-256 `6cf2e977fbecaba72e482409383f6425b951f5e2125c1ccadf9e7ce8067c98a6`). It plays only within the fictional game warning, at gain 0.3, without creating an OS notification. [Microsoft’s copyrighted-content guidance](https://www.microsoft.com/en-us/legal/intellectualproperty/copyright/permissions) does not permit standalone redistribution of sound files. Exhibition and other rights are unverified; this is a local prototype and has not been published or redistributed.


## Warning sound replacement (2026-11-13)

The active warning cue now uses **Beep error 2** by **SamsterBirdies**, [Freesound source](https://freesound.org/people/SamsterBirdies/sounds/581604/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The owner downloaded and selected the original WAV: `assets/audio/581604__samsterbirdies__beep-error-2.wav` (15,784 bytes; SHA-256 `8758ed4c42ca3775ae913c804be961d5b2237e6184431b5accf95a1c791f9675`). Copied byte-for-byte, without synthesis or processing; existing warning gain, timing, mute and overlap rules are unchanged.

The former `windows-error.wav` is retained locally for preservation only and is no longer referenced by the audio manifest. It must be excluded from any public package. Earlier Windows-sound descriptions above are historical, not the active playback path. No public deployment is claimed by this change.
