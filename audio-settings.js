import {HorrorAudio} from './horror-audio.js';
import {AUDIO_ITEMS,AUDIO_LEVEL_KEY,normalizeAudioLevels,readAudioLevels,writeAudioLevels} from './audio-levels.js';
const $=selector=>document.querySelector(selector),groups=$('#audio-groups'),status=$('#preview-status'),saveStatus=$('#save-status');
let levels=readAudioLevels(),playingKey=null,token=0;
const sound=new HorrorAudio({volume:.65,preview:true});
function saySaved(ok){saveStatus.textContent=ok?'音ごとの設定を保存しました。ゲームに反映されます。':'保存できませんでした。この画面を閉じると設定が失われます。'}
function updateRows(){for(const item of AUDIO_ITEMS){const row=document.querySelector(`[data-key="${item.key}"]`),input=row.querySelector('[data-level]');input.value=Math.round(levels[item.key]*200)/2;row.querySelector('output').textContent=`${input.value}%`}}
for(const group of [...new Set(AUDIO_ITEMS.map(x=>x.group))]){
 const section=document.createElement('section');section.className='group';const heading=document.createElement('h2');heading.textContent=group;section.append(heading);
 for(const item of AUDIO_ITEMS.filter(x=>x.group===group)){
  const row=document.createElement('div');row.className='audio-row';row.dataset.key=item.key;
  const label=document.createElement('label');label.htmlFor=`level-${item.key}`;label.textContent=item.label;
  const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='800';slider.step='0.5';slider.id=label.htmlFor;slider.dataset.level='';
  const output=document.createElement('output');output.htmlFor=slider.id;
  const button=document.createElement('button');button.type='button';button.dataset.preview=item.key;button.textContent='確認中';button.disabled=true;button.setAttribute('aria-label',`${item.label}を試聴`);
  slider.addEventListener('input',()=>{levels={...levels,[item.key]:Number(slider.value)/100};output.textContent=`${slider.value}%`;sound.setLevels(levels);saySaved(writeAudioLevels(levels))});
  button.addEventListener('click',()=>preview(item));row.append(label,slider,output,button);section.append(row);
 }groups.append(section);
}
updateRows();saveStatus.textContent='音ごとの設定を表示中。変更は自動保存され、ゲームに反映されます。';
try{const response=await fetch('./assets/audio/manifest.json');if(!response.ok)throw Error('manifest');const manifest=await response.json();for(const item of AUDIO_ITEMS){const button=document.querySelector(`[data-preview="${item.key}"]`);const value=manifest[item.key];const available=Array.isArray(value)?value.length>0:!!value;button.disabled=!available;button.textContent=available?'試聴':'未設定';if(!available)button.setAttribute('aria-label',`${item.label}は音源未設定です`)}}catch{status.textContent='音声一覧を読み込めませんでした。ページを再読み込みしてください。'}
function stop(message='試聴を停止しました。'){token++;sound.stopVoices();playingKey=null;status.textContent=message}
async function preview(item){
 stop('読み込み中…');const active=token;
 if(sound.muted){status.textContent='試聴のミュートを解除してください。';return}
 if(!sound.init()){status.textContent='音声を利用できません。ブラウザーと音声出力を確認してください。';return}
 sound.setState('playing');await sound.loadPromise;if(active!==token)return;
 if(!sound.getDiagnostics().loaded.includes(item.key)){status.textContent='この音声を読み込めませんでした。';return}
 let ok;
 if(item.key==='player_walk')ok=sound.step();else if(item.key==='player_run')ok=sound.step({running:true});else if(item.key==='enemy_step')ok=sound.enemyStep({distance:2,pan:0,chase:true});else if(item.key==='enemy_breath')ok=sound.play('enemy_breath',{volume:.85*(1-2/26)});else if(item.key==='ambience')ok=sound.play('ambience');else ok=sound.cue(item.key);
 if(!ok){status.textContent='音声を再生できませんでした。音量を確認してください。';return}
 playingKey=item.key;status.textContent=`「${item.label}」を試聴中。`;
 const voice=[...sound.voices].at(-1);if(voice){const ended=voice.source.onended;voice.source.onended=()=>{ended?.();if(token===active){playingKey=null;status.textContent='試聴が終わりました。'}}}
}
$('#preview-stop').addEventListener('click',()=>stop());
$('#preview-mute').addEventListener('click',event=>{const muted=!sound.muted;stop(muted?'試聴をミュートしました。':'試聴のミュートを解除しました。');sound.setMuted(muted);event.currentTarget.setAttribute('aria-pressed',String(muted));event.currentTarget.textContent=muted?'試聴のミュートを解除':'試聴をミュート'});
$('#preview-volume').addEventListener('input',event=>{$('#preview-volume-value').value=`${event.target.value}%`;sound.setVolume(Number(event.target.value)/100)});
$('#restore-defaults').addEventListener('click',()=>{levels=normalizeAudioLevels({});sound.setLevels(levels);updateRows();saySaved(writeAudioLevels(levels))});
window.addEventListener('storage',event=>{if(event.key===AUDIO_LEVEL_KEY||event.key===null){levels=readAudioLevels();sound.setLevels(levels);updateRows()}});
window.addEventListener('pagehide',()=>{stop();sound.dispose()},{once:true});
window.audioSettingsTest={diagnostics:()=>({playingKey,muted:sound.muted,levels:{...levels},contextState:sound.ctx?.state??'uninitialized',voices:sound.voices.size,loaded:sound.getDiagnostics().loaded})};
