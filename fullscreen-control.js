// Fullscreen is requested only synchronously from the supplied button clicks.
// Pointer lock, game pause and layout are deliberately owned by the caller.
export function createFullscreenControl({document,buttons,onChange=()=>{},onError=()=>{}}={}){
  if(!document?.documentElement||typeof document.addEventListener!=='function'||
     !Array.isArray(buttons)||!buttons.length||!buttons.every(b=>b&&typeof b.addEventListener==='function'&&typeof b.removeEventListener==='function'&&typeof b.setAttribute==='function')||
     typeof onChange!=='function'||typeof onError!=='function')throw new TypeError('Fullscreen control requires a document, buttons and callbacks');
  const targets=[...new Set(buttons)],element=document.documentElement;
  let disposed=false,pending=false,active=document.fullscreenElement===element;
  const supported=()=>document.fullscreenEnabled!==false&&typeof element.requestFullscreen==='function'&&typeof document.exitFullscreen==='function';
  function render(){
    for(const button of targets){
      button.textContent=active?'全画面を終了':'全画面';
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-busy',String(pending));
    }
  }
  function sync(){
    if(disposed)return;
    const next=document.fullscreenElement===element,changed=next!==active;active=next;render();
    if(changed)onChange(active);
  }
  function report(reason,error){if(!disposed)onError({reason,error})}
  function click(event){
    event?.preventDefault?.();
    if(disposed||pending)return;
    if(!supported()){report('unsupported');return}
    const exiting=document.fullscreenElement===element;
    pending=true;render();
    let request;
    try{request=exiting?document.exitFullscreen():element.requestFullscreen()}
    catch(error){pending=false;sync();report('rejected',error);return}
    Promise.resolve(request).then(()=>{if(disposed)return;pending=false;sync()},error=>{if(disposed)return;pending=false;sync();report('rejected',error)});
  }
  function dispose(){
    if(disposed)return;pending=false;render();disposed=true;
    for(const button of targets)button.removeEventListener('click',click);
    document.removeEventListener?.('fullscreenchange',sync);
  }
  for(const button of targets)button.addEventListener('click',click);
  document.addEventListener('fullscreenchange',sync);render();
  return Object.freeze({dispose,get state(){return Object.freeze({active,pending,supported:supported()})}});
}
