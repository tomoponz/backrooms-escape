// Visual-only game-over transition. No audio is loaded or generated here.
// The caller owns game state, rendering, input and any approved chant recording.
export function createDeathSequence({document, onFinish=()=>{}, onChant=()=>{}, fadeSeconds=2.4, holdSeconds=1.4, reducedMotion=document?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false}={}) {
  if (!document?.createElement || typeof onFinish!=='function' || typeof onChant!=='function' ||
      !Number.isFinite(fadeSeconds) || fadeSeconds<=0 || !Number.isFinite(holdSeconds) || holdSeconds<0)
    throw new TypeError('Death sequence requires a document, callbacks and valid durations');
  const root=document.createElement('div');root.className='death-sequence';root.hidden=true;
  root.setAttribute('role','status');root.setAttribute('aria-live','polite');root.setAttribute('aria-atomic','true');
  const character=document.createElement('span');character.className='death-sequence-character';character.textContent='死';character.setAttribute('aria-hidden','true');
  const announcement=document.createElement('span');announcement.className='death-sequence-announcement';announcement.textContent='死亡。まもなく再挑戦メニューを表示します。';
  root.append(character,announcement);
  let phase='idle',elapsed=0,paused=false,suspended=false,disposed=false;
  const notify=event=>{try{onChant(event)}catch{/* Optional audio must never break the transition. */}};
  function syncSuspension(){
    if(phase!=='running')return;
    const next=paused||!!document.hidden;
    if(next!==suspended){suspended=next;notify(next?'pause':'resume')}
  }
  const visibilityHandler=()=>syncSuspension();
  document.addEventListener?.('visibilitychange',visibilityHandler);
  function start(){
    if(disposed||phase!=='idle')return false;
    phase='running';elapsed=0;suspended=false;root.hidden=false;character.style.opacity=reducedMotion?'1':'0';
    notify('start');syncSuspension();return true;
  }
  function update(dt){
    if(phase!=='running'||disposed)return phase;
    syncSuspension();
    if(suspended||!Number.isFinite(dt)||dt<=0)return phase;
    elapsed=Math.min(fadeSeconds+holdSeconds,elapsed+dt);
    const fraction=Math.min(1,elapsed/fadeSeconds);
    character.style.opacity=String(reducedMotion?1:fraction*fraction*(3-2*fraction));
    if(elapsed>=fadeSeconds+holdSeconds){phase='complete';root.hidden=true;notify('stop');onFinish()}
    return phase;
  }
  function setPaused(value){paused=!!value;syncSuspension()}
  function reset(){
    if(disposed)return false;
    if(phase==='running')notify('stop');
    phase='idle';elapsed=0;paused=false;suspended=false;root.hidden=true;character.style.opacity='0';return true;
  }
  function dispose(){
    if(disposed)return;
    if(phase==='running')notify('stop');
    phase='idle';root.hidden=true;disposed=true;document.removeEventListener?.('visibilitychange',visibilityHandler);root.remove?.();
  }
  return Object.freeze({root,start,update,setPaused,cancel:reset,reset,dispose,get phase(){return phase}});
}
