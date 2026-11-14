import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {HorrorAudio} from '../horror-audio.js';

const CHANT_GAIN=1.17;
const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const parameter=(value=0)=>({value,setTargetAtTime(next){this.value=next},setValueAtTime(next){this.value=next},cancelScheduledValues(){}});
const node=extra=>({connect(destination){this.destination=destination;return destination},disconnect(){this.disconnected=true},...extra});
function fixture(){
 const sources=[],buffers=Object.fromEntries(['chant','warning_tone','player_walk','player_run','capture','skin_voice'].map(key=>[key,{key,duration:key==='chant'?21.919637:1}]));
 const context={currentTime:0,state:'running',destination:node({}),
  createGain:()=>node({gain:parameter()}),
  createStereoPanner:()=>node({pan:parameter()}),
  createDynamicsCompressor:()=>node(Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key=>[key,parameter()]))),
  createBufferSource(){const source=node({buffer:null,loop:false,playbackRate:parameter(1),stopped:false,start(...args){this.startArguments=args},stop(){this.stopped=true;this.onended?.()}});sources.push(source);return source},
  resume:async()=>{},close:async()=>{},
 };
 const sound=new HorrorAudio({volume:.65,preview:true,contextFactory:()=>context});
 sound.loadManifest=async()=>{for(const [key,buffer] of Object.entries(buffers))sound.buffers.set(key,[buffer])};
 assert.equal(sound.init(),true);sound.setLevels({});sound.setState('death-transition');
 return {sound,context,buffers,sources,last:()=>[...sound.voices].at(-1)};
}

test('chant uses its stronger recording gain without changing its sample, rate, routing or master processing',()=>{
 const {sound,buffers,last}=fixture();
 assert.equal(sound.cue('chant'),true);
 const voice=last();close(voice.baseGain,CHANT_GAIN);close(voice.gain.gain.value,CHANT_GAIN);
 assert.equal(voice.source.buffer,buffers.chant);
 assert.deepEqual(voice.source.startArguments,[]);
 assert.equal(voice.source.playbackRate.value,1);
 assert.equal(voice.source.loop,false);
 assert.equal(voice.panner.destination,sound.resultBus);
 close(sound.master.gain.value,.65*.8);assert.equal(sound.playBus.gain.value,0);assert.equal(sound.resultBus.gain.value,1);
 for(const [key,value] of Object.entries({threshold:-14,knee:8,ratio:8,attack:.003,release:.18}))close(sound.limiter[key].value,value);
 sound.dispose();
});

test('saved chant levels and cue scale still multiply the gain, including live changes and zero',()=>{
 const {sound,last}=fixture();
 sound.setLevels({chant:.5});sound.cue('chant',{scale:.5});
 close(last().baseGain,CHANT_GAIN*.5);close(last().gain.gain.value,CHANT_GAIN*.25);
 sound.setLevels({chant:2});close(last().gain.gain.value,CHANT_GAIN);
 sound.setLevels({chant:0});assert.equal(last().gain.gain.value,0);
 sound.setLevels({chant:8});close(last().gain.gain.value,CHANT_GAIN*4);
 sound.dispose();
});

test('chant does not overlap itself, continues on the result screen and stops on retry or title',()=>{
 const {sound,last}=fixture();sound.cue('chant');const first=last().source;
 sound.cue('chant');assert.equal(first.stopped,true);assert.equal(sound.voices.size,1);
 const continued=last().source;sound.setState('lost');assert.equal(continued.stopped,false);assert.equal(sound.voices.size,1);
 sound.setState('playing');assert.equal(continued.stopped,true);assert.equal(sound.voices.size,0);
 sound.setState('death-transition');sound.cue('chant');const titleVoice=last().source;
 sound.setState('menu');assert.equal(titleVoice.stopped,true);assert.equal(sound.voices.size,0);
 sound.dispose();
});

test('mute, hidden state and zero master volume keep chant silent',()=>{
 for(const operation of ['setMuted','setHidden']){
  const {sound,last}=fixture();sound.cue('chant');const voice=last().source;
  sound[operation](true);assert.equal(voice.stopped,true);assert.equal(sound.voices.size,0);assert.equal(sound.cue('chant'),false);assert.equal(sound.master.gain.value,0);
  sound[operation](false);assert.equal(sound.cue('chant'),true);sound.dispose();
 }
 const {sound}=fixture();sound.setVolume(0);assert.equal(sound.cue('chant'),false);assert.equal(sound.master.gain.value,0);sound.dispose();
});

test('warning, capture, voice and player footsteps retain their previous gains',()=>{
 const {sound,last}=fixture();
 for(const [key,expected] of [['warning_tone',.3],['capture',.8*1.12],['skin_voice',.6]]){assert.equal(sound.cue(key),true);close(last().baseGain,expected)}
 sound.setState('playing');assert.equal(sound.step(),true);close(last().baseGain,.68);
 assert.equal(sound.step({running:true}),true);close(last().baseGain,.86);
 sound.dispose();
});

test('chant still uses the original byte-identical WAV',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../assets/audio/manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.chant,'2okyou.wav');
 const recording=fs.readFileSync(new URL('../assets/audio/2okyou.wav',import.meta.url));
 assert.equal(createHash('sha256').update(recording).digest('hex'),'850511caffb13ea72e29e1e61279eb00e9e93c101494d0991921f6dabd8b56ff');
});
