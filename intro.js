export {createAwakening} from './awakening.js';
// Optional local video introduction. The shipped configuration contains no
// recording: a short, explicitly labelled text placeholder is used instead.
const FALLBACK_CAPTIONS=Object.freeze([
 {at:0,text:'いつもの校舎。見慣れた扉。'},
 {at:1.8,text:'扉を開ける。足元が消えた。'},
 {at:3.6,text:'目を開けると、見知らぬ黄色い部屋にいた。'}
]);
const DEFAULT_SECONDS=5;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

// Deliberately excludes protocols, absolute paths, URL escapes, query strings,
// subdirectories and dot segments. Put a named mp4/webm in assets/intro/.
export function isAllowedIntroVideo(value){
 return typeof value==='string'&&/^assets\/intro\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(mp4|webm)$/i.test(value)&&!value.includes('..');
}
export function normalizeIntroConfig(raw){
 const source=raw&&typeof raw==='object'&&!Array.isArray(raw)&&raw.version===1?raw:{};
 const requested=source.video;
 const video=isAllowedIntroVideo(requested)?requested:null;
 const seconds=Number.isFinite(source.placeholderSeconds)?clamp(source.placeholderSeconds,3,15):DEFAULT_SECONDS;
 let captions=Array.isArray(source.captions)?source.captions.filter(c=>c&&Number.isFinite(c.at)&&c.at>=0&&c.at<seconds&&typeof c.text==='string'&&c.text.trim()).map(c=>({at:c.at,text:c.text.trim().slice(0,160)})).sort((a,b)=>a.at-b.at).slice(0,8):[];
 if(!captions.length||captions[0].at!==0)captions=FALLBACK_CAPTIONS.map(c=>({...c})).filter(c=>c.at<seconds);
 return {version:1,video,placeholderSeconds:seconds,captions,sourceRejected:(requested!=null&&!video)||(!video&&source.sourceRejected===true)};
}
export async function loadIntroConfig(fetcher=globalThis.fetch){
 try{if(typeof fetcher!=='function')throw Error('fetch unavailable');const response=await fetcher('assets/intro-config.json',{credentials:'same-origin'});if(!response?.ok)throw Error('config unavailable');return normalizeIntroConfig(await response.json())}catch{return normalizeIntroConfig(null)}
}

/**
 * onFinish runs exactly once per start, only within a skip / ESC / start click.
 * onVolumeChange receives 0..1 and should update the game's volume slider.
 * `start` must be called directly from the player's activation event.
 */
export function createIntroSequence({document,window,config,onFinish=()=>{},onVolumeChange=()=>{}}){
 if(!document?.createElement||!document.body||!window?.requestAnimationFrame)throw new TypeError('document and window are required');
 const settings=normalizeIntroConfig(config??null),make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
 const root=make('section','intro-sequence');root.id='intro-sequence';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','intro-heading');
 const panel=make('div','intro-sequence-panel'),heading=make('h2','intro-sequence-heading','導入');heading.id='intro-heading';
 const video=make('video','intro-sequence-video');video.playsInline=true;video.muted=true;video.preload='auto';video.setAttribute('aria-label','導入映像');
 const placeholder=make('div','intro-sequence-placeholder'),label=make('p','intro-sequence-label','仮導入 / 映像は未設定'),caption=make('p','intro-sequence-caption');placeholder.append(label,caption);
 const status=make('p','intro-sequence-status');status.setAttribute('aria-live','polite');
 const controls=make('div','intro-sequence-controls'),pauseButton=make('button','intro-sequence-pause','一時停止'),skipButton=make('button','intro-sequence-skip','スキップして始める'),beginButton=make('button','intro-sequence-begin','ゲームを始める');
 for(const b of [pauseButton,skipButton,beginButton])b.type='button';beginButton.hidden=true;
 const volumeLabel=make('label','intro-sequence-volume','音量 '),volumeInput=make('input');volumeInput.type='range';volumeInput.min='0';volumeInput.max='100';volumeInput.value='65';volumeInput.setAttribute('aria-label','導入とゲームの音量');volumeLabel.append(volumeInput);
 controls.append(pauseButton,skipButton,beginButton,volumeLabel);panel.append(heading,video,placeholder,status,controls);root.append(panel);document.body.append(root);
 let phase='idle',mode='placeholder',paused=false,elapsed=0,last=null,frame=null,watchdog=null,fadeTimer=null,volume=.65,generation=0;
 const clearFrame=()=>{if(frame!=null){window.cancelAnimationFrame(frame);frame=null}last=null};
 const clearWatchdog=()=>{if(watchdog!=null){window.clearTimeout(watchdog);watchdog=null}};
 const setVolume=value=>{const n=Number(value);volume=Number.isFinite(n)?clamp(n,0,1):0;volumeInput.value=String(Math.round(volume*100));video.volume=volume;return volume};
 function finish(options={}){if(!['running','ready','fading'].includes(phase))return false;phase='finished';generation++;clearFrame();clearWatchdog();if(fadeTimer!=null){window.clearTimeout(fadeTimer);fadeTimer=null}video.pause();root.hidden=true;root.className='intro-sequence';onFinish(options);return true}
 function finishVideo(){if(phase!=='running'||mode!=='video')return;phase='fading';clearFrame();clearWatchdog();video.pause();root.className='intro-sequence intro-sequence-fading';fadeTimer=window.setTimeout(()=>{fadeTimer=null;finish({showAwakening:true})},750)}
 function ready(){if(phase!=='running')return;phase='ready';clearFrame();clearWatchdog();video.pause();pauseButton.hidden=true;skipButton.hidden=true;beginButton.hidden=false;status.textContent='準備ができました。';beginButton.focus?.()}
 function drawCaption(){let current=settings.captions[0];for(const c of settings.captions)if(c.at<=elapsed)current=c;caption.textContent=current?.text??''}
 function tick(now){frame=null;if(phase!=='running'||paused||mode!=='placeholder')return;if(last!=null)elapsed+=Math.max(0,(now-last)/1000);last=now;drawCaption();if(elapsed>=settings.placeholderSeconds){ready();return}frame=window.requestAnimationFrame(tick)}
 function fallback(reason){if(phase!=='running')return;generation++;clearWatchdog();video.pause();video.hidden=true;placeholder.hidden=false;mode='placeholder';elapsed=0;last=null;label.textContent='仮導入 / 映像は未設定';status.textContent=reason||'';drawCaption();if(!paused){clearFrame();frame=window.requestAnimationFrame(tick)}}
 function armWatchdog(token){clearWatchdog();watchdog=window.setTimeout(()=>{if(phase==='running'&&!paused&&mode==='video'&&generation===token)fallback('映像を読み込めないため、仮導入を表示します。')},8000)}
 function playVideo(){const token=generation;armWatchdog(token);try{const result=video.play();if(result&&typeof result.catch==='function')result.catch(()=>{if(phase==='running'&&generation===token)fallback('映像を再生できないため、仮導入を表示します。')})}catch{if(phase==='running'&&generation===token)fallback('映像を再生できないため、仮導入を表示します。')}}
 function pause(){if(phase!=='running'||paused)return false;paused=true;clearFrame();clearWatchdog();video.pause();pauseButton.textContent='再開';status.textContent='一時停止中';return true}
 function resume(){if(phase!=='running'||!paused)return false;paused=false;pauseButton.textContent='一時停止';status.textContent='';if(mode==='video'){generation++;playVideo()}else{last=null;frame=window.requestAnimationFrame(tick)}return true}
 function start({volume:initialVolume=.65}={}){
  if(phase==='running'||phase==='ready')return false;
  generation++;clearFrame();clearWatchdog();phase='running';paused=false;elapsed=0;last=null;setVolume(initialVolume);root.className='intro-sequence';root.hidden=false;beginButton.hidden=true;skipButton.hidden=false;pauseButton.hidden=false;pauseButton.textContent='一時停止';status.textContent='';
  if(settings.video){mode='video';video.hidden=false;placeholder.hidden=true;video.src=settings.video;playVideo()}
  else{mode='placeholder';video.hidden=true;placeholder.hidden=false;label.textContent='仮導入 / 映像は未設定';status.textContent=settings.sourceRejected?'動画の指定が無効なため、仮導入を表示します。':'';drawCaption();frame=window.requestAnimationFrame(tick)}
  skipButton.focus?.();return true;
 }
 function cancel(){if(phase==='idle'||phase==='finished')return false;phase='idle';generation++;clearFrame();clearWatchdog();if(fadeTimer!=null){window.clearTimeout(fadeTimer);fadeTimer=null}video.pause();root.hidden=true;root.className='intro-sequence';return true}
 const onKey=e=>{if(['running','ready','fading'].includes(phase)&&e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation?.();finish()}};
 const onVisibility=()=>{if(document.hidden)pause()},onBlur=()=>pause();
 pauseButton.addEventListener('click',()=>paused?resume():pause());skipButton.addEventListener('click',()=>finish());beginButton.addEventListener('click',()=>finish());
 volumeInput.addEventListener('input',()=>{setVolume(Number(volumeInput.value)/100);onVolumeChange(volume)});
 video.addEventListener('playing',()=>{if(phase==='running'&&mode==='video')clearWatchdog()});
 video.addEventListener('ended',finishVideo);video.addEventListener('error',()=>{if(phase==='running'&&mode==='video')fallback('映像を読み込めないため、仮導入を表示します。')});
 window.addEventListener('keydown',onKey);window.addEventListener('blur',onBlur);document.addEventListener('visibilitychange',onVisibility);
 return {root,start,pause,resume,cancel,setVolume,get phase(){return phase},get mode(){return mode},get paused(){return paused},dispose(){cancel();window.removeEventListener('keydown',onKey);window.removeEventListener('blur',onBlur);document.removeEventListener('visibilitychange',onVisibility);root.remove?.()}};
}
