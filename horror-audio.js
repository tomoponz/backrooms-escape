import {AUDIO_LEVEL_KEY,readAudioLevels,normalizeAudioLevels} from './audio-levels.js';
/** Playback of local, licensed recordings only. No generated audio. */
const clamp = (n, lo = 0, hi = 1) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
const KEYS = ['ambience','player_walk','player_run','enemy_step','enemy_breath','alert','door','flash','capture','skin_voice','chant','warning_tone','escape','death','locked','pickup','power','relay',
  'bust_fall','pry','locker_open','locker_close','transform','heartbeat','chase_bgm'];
// Parts of one unedited recording, as [offset, duration] in seconds. The stone
// recording holds two similar falls (one is chosen at random); the locker
// recording holds the opening, a pause, then the closing. Files stay untouched.
export const AUDIO_SEGMENTS = Object.freeze({
  bust_fall: Object.freeze([Object.freeze([0, 1.74]), Object.freeze([3.46, 1.6])]),
  locker_open: Object.freeze([Object.freeze([.1, 1.78])]),
  locker_close: Object.freeze([Object.freeze([3.5, 2.4])]),
});
// Looped recordings whose level the game drives (0 = silent). Heartbeat stays
// audible through the capture; the pursuit loop belongs to ordinary play.
const LEVEL_LOOPS = Object.freeze({heartbeat: {gain: .5, bus: 'resultBus'}, chase_bgm: {gain: .4, bus: 'playBus'}});
// Per-recording adjustments leave the selected fluorescent loop and the
// player's walking/running recordings on their original signal paths and gains.
const RECORDING_GAIN = Object.freeze({enemy_step:2.5, alert:2, door:1.06, locked:1.25, capture:1.12, chant:1.3});
const CUE_VOLUME = Object.freeze({capture:.8, skin_voice:.6, chant:.9, warning_tone:.3, bust_fall:.8, pry:.7, locker_open:.6, locker_close:.6, transform:.75});
const base = new URL('./assets/audio/', import.meta.url);

export class HorrorAudio {
  constructor({volume = .65, contextFactory, preview = false, random = Math.random} = {}) {
    this.volume = clamp(volume); this.contextFactory = contextFactory; this.preview = preview; this.levels = readAudioLevels();
    this.random = random; this.levelLoops = new Map();
    this.state = 'menu'; this.ctx = null; this.failed = false; this.disposed = false;
    this.muted = false; this.hidden = !!globalThis.document?.hidden;
    this.voices = new Set(); this.loops = []; this.buffers = new Map();
    this.missing = new Set(KEYS); this.errors = []; this.cursors = new Map();
    this.params = {enemyDistance: 100, enemyPan: 0, chase: false}; this.dropUntil = 0;
    this.visibilityHandler = () => { this.hidden = !!globalThis.document?.hidden; if (this.hidden) this.stopVoices(); this.applyGates(); };
    globalThis.document?.addEventListener?.('visibilitychange', this.visibilityHandler);
    this.storageHandler = event => { if (event.key === AUDIO_LEVEL_KEY || event.key === null) this.setLevels(readAudioLevels()); };
    globalThis.addEventListener?.('storage', this.storageHandler);
  }
  init() {
    if (this.disposed || this.failed) return false;
    if (!this.ctx) {
      const C = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!this.contextFactory && !C) return false;
      try {
        this.ctx = this.contextFactory ? this.contextFactory() : new C({latencyHint:'interactive'});
        this.master = this.ctx.createGain(); this.master.gain.value = 0;
        this.limiter = this.ctx.createDynamicsCompressor();
        Object.assign(this.limiter.threshold, {value:-14}); Object.assign(this.limiter.knee, {value:8});
        Object.assign(this.limiter.ratio, {value:8}); Object.assign(this.limiter.attack, {value:.003}); Object.assign(this.limiter.release, {value:.18});
        this.master.connect(this.limiter); this.limiter.connect(this.ctx.destination);
        this.playBus = this.ctx.createGain(); this.playBus.gain.value = 0; this.playBus.connect(this.master);
        this.resultBus = this.ctx.createGain(); this.resultBus.gain.value = 0; this.resultBus.connect(this.master);
        this.fluorescentLevel = this.ctx.createGain(); this.fluorescentLevel.gain.value = this.levels.ambience; this.fluorescentLevel.connect(this.playBus);
        this.fluorescentGate = this.ctx.createGain(); this.fluorescentGate.gain.value = 1; this.fluorescentGate.connect(this.fluorescentLevel);
        this.enemyBreathPanner = this.ctx.createStereoPanner?.() || null;
        this.enemyBreathBus = this.ctx.createGain(); this.enemyBreathBus.gain.value = 0;
        this.enemyBreathLevel = this.ctx.createGain(); this.enemyBreathLevel.gain.value = this.levels.enemy_breath; this.enemyBreathLevel.connect(this.enemyBreathPanner || this.playBus);
        this.enemyBreathBus.connect(this.enemyBreathLevel); this.enemyBreathPanner?.connect(this.playBus);
        this.loadPromise = this.loadManifest();
      } catch (error) {
        this.errors.push(`audio initialization: ${error.message}`); this.failed = true;
        try { this.ctx?.close?.()?.catch?.(() => {}); } catch {} this.ctx = null; return false;
      }
    }
    try { this.ctx.resume?.()?.catch?.(() => {}); } catch {}
    this.applyGates(); return true;
  }
  async loadManifest() {
    const context = this.ctx;
    try {
      const response = await globalThis.fetch(new URL('manifest.json', base));
      if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
      const manifest = await response.json();
      await Promise.all(KEYS.map(async key => {
        const list = Array.isArray(manifest[key]) ? manifest[key] : manifest[key] ? [manifest[key]] : [];
        const decoded = await Promise.all(list.map(async path => {
          try {
            if (typeof path !== 'string' || !/^[a-zA-Z0-9_./-]+\.(ogg|wav|mp3|m4a)$/i.test(path) || path.startsWith('/') || path.split('/').includes('..')) throw new Error('invalid local sample path');
            const url = new URL(path, base);
            if (!url.href.startsWith(base.href)) throw new Error('sample outside audio directory');
            const file = await globalThis.fetch(url);
            if (!file.ok) throw new Error(`HTTP ${file.status}`);
            const bytes = await file.arrayBuffer();
            if (!bytes.byteLength || bytes.byteLength > 40 * 1024 * 1024) throw new Error('empty or oversized sample');
            const buffer = await context.decodeAudioData(bytes);
            if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('invalid decoded sample');
            return buffer;
          } catch (error) { this.errors.push(`${key} (${String(path)}): ${error.message}`); return null; }
        }));
        const available = decoded.filter(Boolean);
        if (available.length && !this.disposed && this.ctx === context) { this.buffers.set(key, available); this.missing.delete(key); }
      }));
    } catch (error) { this.errors.push(`manifest: ${error.message}`); }
    if (!this.disposed && this.ctx === context) this.startLoops();
  }
  target(param, value, seconds = .06) {
    if (!param || !this.ctx) return;
    param.setTargetAtTime(value, this.ctx.currentTime, seconds);
  }
  applyGates() {
    if (!this.ctx) return;
    this.target(this.master.gain, this.muted || this.hidden ? 0 : this.volume * .8);
    this.target(this.playBus.gain, this.state === 'playing' ? 1 : 0);
    this.target(this.resultBus.gain, this.state === 'caught' || this.state === 'warning' || this.state === 'death-transition' || this.state === 'lost' || this.state === 'won' || this.state === 'escaped' || this.state === 'playing' ? 1 : 0);
  }
  setVolume(value) { this.volume = clamp(value); this.applyGates(); }
  setLevels(levels) {
    this.levels=normalizeAudioLevels(levels);
    if (!this.ctx) return;
    this.target(this.fluorescentLevel?.gain,this.levels.ambience);
    this.target(this.enemyBreathLevel?.gain,this.levels.enemy_breath);
    for(const voice of this.voices) this.target(voice.gain.gain,voice.baseGain*(this.levels[voice.key]??1));
    for(const [key,loop] of this.levelLoops) this.target(loop.gain.gain,loop.level*LEVEL_LOOPS[key].gain*(this.levels[key]??1),.2);
  }
  setMuted(value) { this.muted = !!value; if (this.muted) this.stopVoices(); this.applyGates(); }
  setHidden(value) { this.hidden = !!value; if (this.hidden) this.stopVoices(); this.applyGates(); }
  setState(state, {silent = false} = {}) {
    const previous = this.state; this.state = state;
    if (state==='playing' && previous==='lost') this.stopCue('chant');
    if (state==='playing' && previous==='warning') this.stopCue('warning_tone');
    if (state !== 'playing' && state !== 'caught') { this.stopVoices(state==='lost'?'chant':null); for (const key of this.levelLoops.keys()) this.setLoop(key, 0, .15); }
    if (previous !== state && !silent && (state === 'escaped' || state === 'won')) this.cue('escape');
    if (previous !== state && !silent && state === 'lost') this.cue('death');
    this.startLoops(); this.applyGates();
  }
  reset() { this.stopVoices(); this.params = {enemyDistance:100, enemyPan:0, chase:false}; this.update(this.params); }
  startLoops() {
    if (!this.ctx || this.disposed || this.preview) return;
    for (const [key, destination] of [['ambience',this.fluorescentGate],['enemy_breath',this.enemyBreathBus]]) {
      if (this.loops.some(loop => loop.key === key) || !this.buffers.has(key)) continue;
      const source = this.ctx.createBufferSource(); source.buffer = this.buffers.get(key)[0]; source.loop = true; source.connect(destination); source.start();
      this.loops.push({key, source});
    }
    this.update(this.params);
  }
  canPlay(result = false) { return !!this.ctx && !this.disposed && !this.muted && !this.hidden && this.volume > 0 && (this.state === 'playing' || (result && (this.state === 'caught' || this.state === 'warning' || this.state === 'death-transition' || this.state === 'lost' || this.state === 'escaped' || this.state === 'won'))); }
  play(key, {volume = 1, pan = 0, result = false} = {}) {
    if (!this.canPlay(result)) return false;
    const samples = this.buffers.get(key); if (!samples?.length) return false;
    // Avoid layering two copies if capture follows the transformation vocal.
    if(key==='skin_voice'||key==='chant'||key==='warning_tone')this.stopCue(key);
    const cursor = this.cursors.get(key) || 0; this.cursors.set(key, cursor + 1);
    const source = this.ctx.createBufferSource(); source.buffer = samples[cursor % samples.length];
    const parts = AUDIO_SEGMENTS[key], part = parts ? parts[Math.min(parts.length - 1, Math.floor(this.random() * parts.length))] : null;
    const gain = this.ctx.createGain(); const baseGain = clamp(volume, 0, 1) * (RECORDING_GAIN[key] ?? 1); gain.gain.value = baseGain * (this.levels[key] ?? 1);
    const panner = this.ctx.createStereoPanner?.() || null;
    if (panner) { panner.pan.value = clamp(pan, -1, 1); source.connect(gain); gain.connect(panner); panner.connect(result ? this.resultBus : this.playBus); }
    else { source.connect(gain); gain.connect(result ? this.resultBus : this.playBus); }
    const voice = {key, source, gain, panner, baseGain}; this.voices.add(voice);
    source.onended = () => { this.voices.delete(voice); for (const node of [source,gain,panner]) try { node?.disconnect(); } catch {} };
    try { if (part) source.start(0, Math.min(part[0], Math.max(0, source.buffer.duration - .05)), part[1]); else source.start(); return true; } catch { source.onended(); return false; }
  }
  /** Drive a looped recording's level (0..1). The loop starts on first use and is released once silent. */
  setLoop(key, level, seconds = .5) {
    const spec = LEVEL_LOOPS[key];
    if (!spec || !this.ctx || this.disposed) return false;
    level = this.muted || this.hidden ? 0 : clamp(level);
    let loop = this.levelLoops.get(key);
    if (!loop) {
      if (level <= 0 || !this.buffers.has(key)) return false;
      const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
      source.buffer = this.buffers.get(key)[0]; source.loop = true; gain.gain.value = 0;
      source.connect(gain); gain.connect(this[spec.bus]);
      try { source.start(); } catch { return false; }
      loop = {source, gain, level: 0, silentSince: null}; this.levelLoops.set(key, loop);
    }
    if (loop.level !== level) { loop.level = level; this.target(loop.gain.gain, level * spec.gain * (this.levels[key] ?? 1), Math.max(.02, seconds / 3)); }
    if (level > 0) loop.silentSince = null;
    else {
      loop.silentSince ??= this.ctx.currentTime;
      if (this.ctx.currentTime - loop.silentSince > Math.max(1, seconds * 2)) { try { loop.source.stop(); loop.source.disconnect(); loop.gain.disconnect(); } catch {} this.levelLoops.delete(key); }
    }
    return true;
  }
  step({running = false} = {}) { return this.play(running ? 'player_run' : 'player_walk', {volume:running ? .86 : .68}); }
  enemyStep({distance = this.params.enemyDistance, pan = this.params.enemyPan, chase = this.params.chase} = {}) {
    // No constant loudness floor: footsteps fade quadratically to silence at 24 m.
    // Keep the old near-field ceiling and the user's per-sound/master controls.
    const d = Number.isFinite(distance) ? Math.max(0, distance) : Infinity;
    const proximity = clamp((24 - d) / 22);
    const volume = .9 * proximity * proximity * (chase ? 1 : .72);
    if (volume <= 0) return false;
    return this.play('enemy_step', {volume, pan});
  }
  cue(name, {pan = 0, scale = 1} = {}) { const key = ({capture:'capture',skin_voice:'skin_voice',chant:'chant',warning_tone:'warning_tone',door:'door',alert:'alert',flash:'flash',escape:'escape',death:'death',locked:'locked',pickup:'pickup',power:'power',relay:'relay',bust_fall:'bust_fall',pry:'pry',locker_open:'locker_open',locker_close:'locker_close',transform:'transform'})[name]; return key ? this.play(key,{volume:(CUE_VOLUME[key] ?? .65) * clamp(scale), pan, result:key === 'capture' || key === 'skin_voice' || key === 'chant' || key === 'warning_tone' || key === 'death' || key === 'escape'}) : false; }
  fluorescentDrop(duration = .38) {
    if (!this.canPlay() || !this.buffers.has('ambience') || this.ctx.currentTime < this.dropUntil) return false;
    const now = this.ctx.currentTime; duration = clamp(duration,.05,2); this.dropUntil = now + duration + 1;
    const p = this.fluorescentGate.gain; p.cancelScheduledValues(now); p.setValueAtTime(0,now); p.setValueAtTime(0,now + duration); p.setTargetAtTime(1,now + duration,.1); return true;
  }
  update(input = {}) {
    this.params = {...this.params, ...input}; if (!this.ctx) return;
    const distance = Number.isFinite(this.params.enemyDistance) ? Math.max(0,this.params.enemyDistance) : 100;
    const closeness = clamp(1 - distance / 26);
    this.target(this.enemyBreathBus.gain, this.params.chase ? .85 * closeness : 0);
    this.target(this.enemyBreathPanner?.pan, clamp(this.params.enemyPan,-1,1));
  }
  stopCue(key) { for (const voice of [...this.voices]) if(voice.key===key){try{voice.source.stop()}catch{voice.source.onended?.()}} }
  stopVoices(except=null) { for (const voice of [...this.voices]) { if(voice.key===except)continue;try { voice.source.stop(); } catch {} for (const node of [voice.source,voice.gain,voice.panner]) try { node?.disconnect(); } catch {} this.voices.delete(voice); } }
  getDiagnostics() { return {loopLevels:Object.fromEntries([...this.levelLoops].map(([key,loop])=>[key,loop.level])), available:!!this.ctx, state:this.state, contextState:this.ctx?.state ?? 'uninitialized', voices:this.voices.size, loops:this.loops.length, volume:this.volume, muted:this.muted, hidden:this.hidden, failed:this.failed, levels:{...this.levels}, captureLoaded:this.buffers.has('capture'), loaded:[...this.buffers.keys()], missing:[...this.missing], errors:[...this.errors]}; }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    globalThis.document?.removeEventListener?.('visibilitychange',this.visibilityHandler); globalThis.removeEventListener?.('storage',this.storageHandler); this.stopVoices();
    for (const loop of this.loops) { try { loop.source.stop(); loop.source.disconnect(); } catch {} } this.loops.length = 0;
    for (const loop of this.levelLoops.values()) { try { loop.source.stop(); loop.source.disconnect(); loop.gain.disconnect(); } catch {} } this.levelLoops.clear();
    for (const node of [this.enemyBreathBus,this.enemyBreathLevel,this.enemyBreathPanner,this.fluorescentGate,this.fluorescentLevel,this.playBus,this.resultBus,this.master,this.limiter]) try { node?.disconnect(); } catch {}
    try { this.ctx?.close?.()?.catch?.(() => {}); } catch {} this.ctx = null;
  }
}
export default HorrorAudio;


