// Item effects are explicitly registered by the game. No item is spawned by
// this module; a future item must be enabled and assigned an effect first.
export const FUTURE_ITEM_BLUEPRINTS = Object.freeze({
  almond_water: Object.freeze({
    id:'almond_water', name:'アーモンドウォーター', description:'将来追加予定',
    maxStack:3, available:false, effect:null
  })
});

const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9_]*$/.test(id);
const validQty=n=>Number.isSafeInteger(n)&&n>0;

export function createInventory({definitions=Object.values(FUTURE_ITEM_BLUEPRINTS)}={}) {
  const registry=new Map(), quantities=new Map(), listeners=new Set();let applying=false;
  function changed(){ for(const listener of listeners){try{listener()}catch{ /* observers cannot break inventory operations */ }} }
  function register(def,{replace=false}={}) {
    if(applying)throw new Error('Cannot change inventory while an effect is applying');
    if(!def||!validId(def.id)||typeof def.name!=='string'||!def.name.trim())throw new TypeError('Invalid item definition');
    if(registry.has(def.id)&&!replace)throw new Error(`Item already registered: ${def.id}`);
    const maxStack=def.maxStack??1;
    if(!validQty(maxStack))throw new TypeError('maxStack must be a positive integer');
    if(def.effect!=null&&(typeof def.effect!=='function'||def.effect.constructor?.name==='AsyncFunction'))throw new TypeError('effect must be synchronous');
    if((quantities.get(def.id)||0)>maxStack)throw new RangeError('Existing quantity exceeds new maxStack');
    const normalized=Object.freeze({id:def.id,name:def.name.trim(),description:String(def.description??''),maxStack,available:def.available===true,effect:def.effect??null});
    registry.set(def.id,normalized);changed();return normalized;
  }
  for(const def of definitions)register(def);
  function count(id){return quantities.get(id)||0}
  function add(id,quantity=1){
    if(applying)return {ok:false,reason:'busy',added:0};
    const def=registry.get(id);
    if(!def||!def.available||!validQty(quantity))return {ok:false,reason:'unavailable',added:0};
    const added=Math.min(quantity,def.maxStack-count(id));
    if(added<=0)return {ok:false,reason:'full',added:0};
    quantities.set(id,count(id)+added);changed();return {ok:true,added,count:count(id)};
  }
  // Effects must be synchronous and return {ok:true} only after successfully
  // applying the effect. A failed/throwing effect never consumes the item.
  function use(id,context){
    if(applying)return {ok:false,reason:'busy'};
    const def=registry.get(id);
    if(!def||!def.available||count(id)<1)return {ok:false,reason:'missing'};
    if(!def.effect)return {ok:false,reason:'not_usable'};
    let result;
    applying=true;try{result=def.effect(context)}catch{return {ok:false,reason:'effect_failed'}}finally{applying=false}
    if(!result||typeof result!=='object'||typeof result.then==='function'||result.ok!==true)return {ok:false,reason:'effect_failed',message:typeof result?.message==='string'?result.message:''};
    const remaining=count(id)-1;if(remaining)quantities.set(id,remaining);else quantities.delete(id);
    changed();return {ok:true,count:remaining,message:typeof result.message==='string'?result.message:''};
  }
  function list(){return [...registry.values()].filter(d=>count(d.id)>0).map(d=>({id:d.id,name:d.name,description:d.description,count:count(d.id),usable:!!d.effect&&d.available}))}
  function reset(){if(applying)return false;if(quantities.size){quantities.clear();changed()}return true}
  function subscribe(listener){if(typeof listener!=='function')throw new TypeError('listener must be a function');listeners.add(listener);return()=>listeners.delete(listener)}
  return Object.freeze({register,add,use,count,list,reset,subscribe});
}

// A standalone panel. The game owns the open/close state and decides whether
// time and pointer lock pause. No future items are displayed as obtainable.
export function createInventoryPanel({inventory,document,onClose=()=>{},onUse=()=>{}}){
  if(!inventory||!document?.createElement)throw new TypeError('inventory and document are required');
  const element=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;return el};
  const root=element('section','inventory-overlay');root.id='inventory-panel';root.hidden=true;
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','inventory-title');
  const panel=element('div','inventory-panel');const header=element('div','inventory-header');
  const title=element('h2','inventory-title','所持品');title.id='inventory-title';
  const close=element('button','inventory-close','閉じる');close.type='button';close.addEventListener('click',()=>onClose());
  header.append(title,close);const list=element('div','inventory-list');list.setAttribute('aria-live','polite');
  const status=element('p','inventory-status');status.setAttribute('role','status');
  const hint=element('p','inventory-hint','I または Esc で閉じる');
  panel.append(header,list,status,hint);root.append(panel);
  function render(){
    list.replaceChildren();const items=inventory.list();
    if(!items.length){list.append(element('p','inventory-empty','所持品はありません。'));return}
    for(const item of items){
      const row=element('div','inventory-item'),details=element('div','inventory-details');
      details.append(element('strong','',item.name),element('small','',`${item.description}${item.description?'　':''}所持数 ${item.count}`));
      const button=element('button','inventory-use','使う');button.type='button';button.disabled=!item.usable;
      button.addEventListener('click',()=>{const result=onUse(item.id);status.textContent=result?.message||(result?.ok?'使用しました。':'今は使えません。')});
      row.append(details,button);list.append(row);
    }
  }
  const unsubscribe=inventory.subscribe(render);render();
  return {root,open(){status.textContent='';render();root.hidden=false;close.focus?.()},close(){root.hidden=true},destroy(){unsubscribe();root.remove()}};
}
