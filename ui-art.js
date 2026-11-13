// Presentation-only enhancement. Original IDs, text names and game handlers stay intact.
// All images are the owner's approved sheets, displayed via CSS sprite windows.
const $=s=>document.querySelector(s);
function decorate(selector,name){
 const el=$(selector); if(el)el.classList.add('art-button','art-'+name);
}
for(const [selector,name] of [
 ['#start','start'],['#resume','resume'],['#retry','retry'],['#retry-pause','retry'],
 ['#title-pause','title'],['#title-result','title'],['#fullscreen-menu','fullscreen'],
 ['#fullscreen-pause','fullscreen'],['.settings-guide>summary','settings'],
 ['.briefing>summary','help'],['#credits-close','back']
])decorate(selector,name);
function label(name,text){
 const el=document.createElement('span');el.className='art-label art-'+name;
 el.setAttribute('role','img');el.setAttribute('aria-label',text);return el;
}
function replaceText(root,search,name){
 if(!root)return;
 for(const n of [...root.childNodes]){
  if(n.nodeType!==3||!n.textContent.includes(search))continue;
  const [before,...tail]=n.textContent.split(search);
  n.replaceWith(document.createTextNode(before),label(name,search),document.createTextNode(tail.join(search)));return;
 }
}
replaceText($('label[for="volume"]'),'音量','volume');
replaceText($('label[for="quality"]'),'画質','quality');
for(const row of document.querySelectorAll('.quick-controls>span')){
 replaceText(row,'移動','move');replaceText(row,'視点','look');replaceText(row,'走る','run');
}
replaceText(document.querySelector('.controls-guide>summary'),'詳しい操作とヒント','controls');
for(const dd of document.querySelectorAll('.controls-guide dd'))replaceText(dd,'アイテム選択','items');
const success=label('success','脱出成功');success.classList.add('success-art');
$('#result-title')?.before(success);
const quality=$('#quality');
if(quality){
 const choices=document.createElement('div');choices.className='quality-choice';
 choices.setAttribute('role','group');choices.setAttribute('aria-label','画質');
 for(const [value,name,text] of [['high','high','高画質（標準）'],['low','low','低画質（動作優先）']]){
  const b=document.createElement('button');b.type='button';b.className='art-button art-'+name;
  b.textContent=text;b.dataset.value=value;
  b.addEventListener('click',()=>{quality.value=value;quality.dispatchEvent(new Event('change',{bubbles:true}));syncQuality()});
  choices.append(b);
 }
 function syncQuality(){for(const b of choices.children)b.setAttribute('aria-pressed',String(quality.value===b.dataset.value))}
 quality.after(choices);quality.classList.add('ui-visually-hidden');quality.tabIndex=-1;
 quality.addEventListener('change',syncQuality);syncQuality();
}
const motion=$('#motion');
if(motion){
 const status=label('off','オフ');status.classList.add('motion-choice');status.setAttribute('aria-hidden','true');
 motion.closest('label').append(status);
 const sync=()=>{status.classList.toggle('art-on',motion.checked);status.classList.toggle('art-off',!motion.checked)};
 motion.addEventListener('change',sync);sync();
}
for(const selector of ['.settings-guide','.briefing']){
 const details=$(selector);if(!details)continue;
 const back=document.createElement('button');back.type='button';back.className='art-button art-back detail-back';back.textContent='戻る';
 back.addEventListener('click',()=>{details.open=false;details.querySelector('summary').focus()});details.append(back);
}