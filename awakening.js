// Camera motion is applied to the actual game camera. No substitute scene,
// model, recording or synthesized sound is created for this transition.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x)};
export const AWAKENING_DURATION=5;
export function awakeningFrame(time, floor=0){
 const t=clamp(Number.isFinite(time)?time:0,0,AWAKENING_DURATION);
 const ground=Number.isFinite(floor)?floor:0;
 const rise=smooth((t-.55)/2.55);
 return {height:ground+.32+1.30*rise,pitch:-.62*(1-rise),black:1-smooth(t/.9),title:Math.min(smooth((t-2.65)/.7),1-smooth((t-4.2)/.8)),done:t>=AWAKENING_DURATION};
}
export function createAwakening({document,window,onFinish=()=>{}}){
 const root=document.createElement('section');root.className='awakening';root.hidden=true;root.setAttribute('aria-label','目を覚ます');
 const black=document.createElement('div');black.className='awakening-black';
 const title=document.createElement('div');title.className='awakening-title';const logo=document.createElement('img');logo.src='assets/title-logo-lite.webp';logo.alt='BACKROOMS';logo.className='awakening-logo';title.append(logo);
 const skip=document.createElement('button');skip.type='button';skip.className='awakening-skip';skip.textContent='スキップ';
 root.append(black,title,skip);document.body.append(root);let active=false,time=0;
 function finish(user=false){if(!active)return false;active=false;root.hidden=true;onFinish(user);return true}
 function start(){time=0;active=true;root.hidden=false;black.style.opacity='1';title.style.opacity='0';skip.focus?.()}
 function update(dt,floor){if(!active)return null;if(!document.hidden)time+=clamp(Number.isFinite(dt)?dt:0,0,.05);const f=awakeningFrame(time,floor);black.style.opacity=String(f.black);title.style.opacity=String(f.title);if(f.done)finish(false);return f}
 const key=e=>{if(active&&e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation?.();finish(true)}};
 skip.addEventListener('click',()=>finish(true));window.addEventListener('keydown',key,true);
 return {start,update,finish,get active(){return active},dispose(){finish(false);window.removeEventListener('keydown',key,true);root.remove()}};
}
