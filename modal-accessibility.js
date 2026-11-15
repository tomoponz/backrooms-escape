// Keyboard and focus behavior belongs to the UI, not the simulation. This
// observes menu visibility only; it never changes game state or pointer lock.
export function installModalAccessibility({document,window}) {
  const Observer=window?.MutationObserver;
  if(!Observer||!document?.querySelectorAll||!document.body?.children)
    return {dispose(){}};

  const modalIds=['ranking-modal','credits','intro-sequence','inventory-panel','pause','result'];
  const preferred={'ranking-modal':'#ranking-close',credits:'#credits-close','intro-sequence':'.intro-sequence-begin, .intro-sequence-skip','inventory-panel':'.inventory-close',pause:'#resume',result:'#retry'};
  const selector='button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';
  const known=new Set(),inertBefore=new Map(),returnTargets=new Map();
  let active=null,disposed=false;
  const visible=element=>!!element&&!element.hidden&&!element.closest('[hidden]')&&element.getClientRects().length>0;
  const focusables=root=>[...root.querySelectorAll(selector)].filter(element=>visible(element)&&!element.closest('[inert]'));
  const focus=element=>element?.focus({preventScroll:true});
  function focusDefault(root) {
    const target=[...root.querySelectorAll(preferred[root.id]||selector)].find(element=>visible(element)&&!element.disabled)||focusables(root)[0];
    if(target)focus(target);
    else {root.tabIndex=-1;focus(root)}
  }
  function restoreBackground() {
    for(const [element,value] of inertBefore)element.inert=value;
    inertBefore.clear();
  }
  function containBackground(root) {
    for(const element of document.body.children) {
      if(element===root||['SCRIPT','STYLE','LINK'].includes(element.tagName))continue;
      if(!inertBefore.has(element))inertBefore.set(element,element.inert);
      element.inert=true;
    }
  }
  function repairFocus() {
    if(active&&visible(active)&&!active.contains(document.activeElement))focusDefault(active);
  }
  // Inventory rerenders remove the clicked Use button. Keep the user inside
  // that dialog even when the final bottle disappears from the list.
  const contentObserver=new Observer(repairFocus);
  function sync() {
    if(disposed)return;
    const next=modalIds.map(id=>document.getElementById(id)).find(visible)||null;
    if(next===active){if(active)containBackground(active);return}
    const previous=active,previousReturn=returnTargets.get(previous);
    contentObserver.disconnect();restoreBackground();active=next;
    for(const root of returnTargets.keys())if(!visible(root))returnTargets.delete(root);
    if(next) {
      const origin=document.activeElement;
      // Keep an underlying dialog's original return target while a second
      // dialog covers it, then restore the actual button that opened the top one.
      if(!returnTargets.has(next))returnTargets.set(next,origin!==document.body&&origin!==document.documentElement&&visible(origin)&&!next.contains(origin)?origin:null);
      containBackground(next);
      if(previous&&!visible(previous)&&previousReturn&&next.contains(previousReturn)&&visible(previousReturn))focus(previousReturn);
      else if(!next.contains(document.activeElement))focusDefault(next);
      if(next.id==='inventory-panel')contentObserver.observe(next,{childList:true,subtree:true});
    } else if(previous) {
      if(visible(previousReturn)&&!previousReturn.closest('[inert]'))focus(previousReturn);
      else if(visible(document.getElementById('menu')))focus(document.getElementById('start'));
    }
  }
  const visibilityObserver=new Observer(sync);
  function discover() {
    for(const id of [...modalIds,'menu']) {
      const element=document.getElementById(id);
      if(element&&!known.has(element)) {
        known.add(element);visibilityObserver.observe(element,{attributes:true,attributeFilter:['hidden']});
      }
    }
    sync();
  }
  const bodyObserver=new Observer(discover);
  bodyObserver.observe(document.body,{childList:true});
  function onKey(event) {
    if(event.key!=='Tab'&&event.code!=='Tab')return;
    sync();if(!active)return;
    const items=focusables(active),index=items.indexOf(document.activeElement);
    if(!items.length){event.preventDefault();focusDefault(active);return}
    if(event.shiftKey&&(index<=0)){event.preventDefault();focus(items.at(-1))}
    else if(!event.shiftKey&&(index<0||index===items.length-1)){event.preventDefault();focus(items[0])}
  }
  function onFocus(){repairFocus()}
  document.addEventListener('keydown',onKey,true);
  document.addEventListener('focusin',onFocus);
  discover();
  return {dispose(){
    disposed=true;visibilityObserver.disconnect();bodyObserver.disconnect();contentObserver.disconnect();
    document.removeEventListener('keydown',onKey,true);document.removeEventListener('focusin',onFocus);
    restoreBackground();returnTargets.clear();active=null;
  }};
}
