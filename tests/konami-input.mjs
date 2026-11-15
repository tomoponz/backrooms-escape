import assert from 'node:assert/strict';
import {createGameInput} from '../game-input.js';

const document=new EventTarget(), window=new EventTarget(), canvas=new EventTarget();
let state='playing', toggles=0;
const keys=new Set();
const input=createGameInput({document,window,canvas,keys,getState:()=>state,
  actions:{toggleInvulnerability(){toggles++}}});
const sequence=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyB','KeyA'];
function key(code, extras={}) {
  const ev=new Event('keydown',{cancelable:true});
  Object.assign(ev,{code,...extras});
  document.dispatchEvent(ev);
  return ev;
}
function enter(){sequence.forEach(code=>key(code))}
sequence.slice(0,-1).forEach(code=>key(code));
assert.equal(toggles,0);
assert.ok(key('KeyA').defaultPrevented);
assert.equal(toggles,1);
assert.equal(keys.has('KeyA'),false);
enter();
assert.equal(toggles,2);
state='menu';input.clear();enter();
assert.equal(toggles,2);
state='playing';
sequence.slice(0,5).forEach(code=>key(code));
input.clear();
sequence.slice(5).forEach(code=>key(code));
assert.equal(toggles,2);
input.clear();
sequence.forEach(code=>key(code,{repeat:true}));
sequence.forEach(code=>key(code,{ctrlKey:true}));
assert.equal(toggles,2);
enter();
assert.equal(toggles,3);
input.dispose();enter();
assert.equal(toggles,3);
console.log('Konami input tests passed.');
