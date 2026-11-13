/** A small, stable hotbar backed by the existing inventory. */
// Icons rendered from the approved item models (owner-supplied 128 px PNGs).
export const ITEM_ICONS=Object.freeze({flashlight:'assets/ui/flashlight-icon-128.png',almond_water:'assets/ui/almond-water-icon-128.png',crowbar:'assets/ui/crowbar-icon-128.png'});
export function createItemSlots({inventory,document,size=4}) {
  if(!inventory||!document||!Number.isInteger(size)||size<1) throw new TypeError('Invalid item slots');
  let slots=Array(size).fill(null),selected=0,flashOn=false;
  const root=document.createElement('div');root.className='item-slots';root.setAttribute('role','group');root.setAttribute('aria-label','アイテムスロット。数字キーで選択、Qで使用');
  const cells=[];
  for(let i=0;i<size;i++){
    const cell=document.createElement('div');cell.className='item-slot';
    const key=document.createElement('span');key.className='item-slot-key';key.textContent=String(i+1);
    const icon=document.createElement('img');icon.className='item-slot-icon';icon.alt='';icon.hidden=true;
    const name=document.createElement('span');name.className='item-slot-name';
    const count=document.createElement('span');count.className='item-slot-count';
    cell.append(key,icon,name,count);root.append(cell);cells.push({cell,name,count,icon});
  }
  const hint=document.createElement('div');hint.className='item-slot-hint';hint.textContent='1–4 選択 / Q 使用';root.append(hint);
  function render(){
    const items=new Map(inventory.list().map(x=>[x.id,x]));
    for(let i=0;i<size;i++){
      const entry=items.get(slots[i]),{cell,name,count,icon}=cells[i];cell.classList.toggle('selected',i===selected);cell.classList.toggle('empty',!entry);
      const picture=entry?ITEM_ICONS[entry.id]:null;if(icon.dataset?.item!==(entry?.id??'')){if(icon.dataset)icon.dataset.item=entry?.id??'';if(picture)icon.src=picture}icon.hidden=!picture;
      name.textContent=entry?(entry.id==='almond_water'?'水':entry.id==='flashlight'?'ライト':entry.id==='crowbar'?'バール':entry.name):'空き';
      count.textContent=entry?(entry.id==='flashlight'?(flashOn?'点灯':'消灯'):entry.id==='crowbar'?'':`×${entry.count}`):'';
      cell.setAttribute('aria-label',`${i+1} ${entry?entry.name:'空き'}${entry?` ${entry.count}個`:''}${i===selected?' 選択中':''}`);
    }
  }
  function sync(){
    const items=inventory.list(),held=new Set(items.map(x=>x.id));
    slots=slots.map(id=>held.has(id)?id:null);
    for(const item of items)if(!slots.includes(item.id)){const empty=slots.indexOf(null);if(empty>=0)slots[empty]=item.id}
    render();
  }
  const unsubscribe=inventory.subscribe(sync);sync();
  return {root,select(index){if(!Number.isInteger(index)||index<0||index>=size)return false;selected=index;render();return true},
    selectedItem(){return slots[selected]},snapshot(){return {slots:[...slots],selected,flashOn}},
    setFlash(on){flashOn=!!on;render()},reset(){slots=Array(size).fill(null);selected=0;flashOn=false;sync()},
    destroy(){unsubscribe();root.remove()}};
}
