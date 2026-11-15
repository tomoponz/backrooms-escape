# Backrooms Escape

Browser horror game for a university festival. Desktop keyboard and mouse recommended.

Includes frightening scenes, flashing lights and loud sounds. Adjust volume before playing.

## Local clear-time rankings

The title and clear screen show the fastest ten records for each difficulty in this browser. Records stay in local storage (`backrooms.clear-time-ranking.v1`); there is no ranking service or network submission. A successful eligible clear saves automatically as `ゲスト`, with an optional nickname of up to 12 characters. Storage failure leaves a session-only table and does not block play.

Ranking time uses a separate monotonic clock, starting when play begins and stopping at the escape trigger before the ending fade. It counts play, captures, warnings, falls and the death transition; it excludes intro/awakening, explicit pause, inventory and result-screen waiting. The original simulation `elapsed` remains unchanged. Retries retain accumulated time and exclusions. A retry that carries restored breakers or a pried cover is a reference run, excluded from the rankings, as are any runs using invulnerability or the `?qa` page. A fresh start resets the run. Legacy BEST values remain untouched and appear only as a separately labelled reference; they are not imported into the new rankings.

Run regression checks with `node --test tests/*.mjs`. Serve the repository over local HTTP for browser checks; opening `index.html` directly is not supported. Use an isolated browser profile for seeded or automated ranking tests so they do not enter the festival's records.

See CREDITS.md and AUDIO.md for third-party attributions and known provenance limitations. No blanket licence is granted for third-party assets.
