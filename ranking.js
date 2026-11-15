// Local rankings use their own schema; legacy BEST values are never imported.
export const RANKING_STORAGE_KEY='backrooms.clear-time-ranking.v1';
export const RANKING_DIFFICULTIES=Object.freeze(['normal','easy','explore']);
const difficulties=new Set(RANKING_DIFFICULTIES);
const activeStates=new Set(['playing','caught','warning','falling','death-transition']);
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(id);
const validDuration=value=>Number.isSafeInteger(value)&&value>0;
const empty=Object.freeze([]);
let sequence=0;
function defaultId(){
 try{const id=globalThis.crypto?.randomUUID?.();if(validId(id))return id}catch{}
 return `run-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2,10)}`;
}
const reasonText=value=>typeof value==='string'&&value.trim()?value.trim().slice(0,64):'excluded';

export function formatRankingTime(durationMs){
 if(!Number.isFinite(durationMs)||durationMs<0)return '—';
 const hundredths=Math.floor(durationMs/10),minutes=Math.floor(hundredths/6000);
 return `${String(minutes).padStart(2,'0')}:${String(Math.floor(hundredths/100)%60).padStart(2,'0')}.${String(hundredths%100).padStart(2,'0')}`;
}

export function normalizeRankingName(value){
 if(typeof value!=='string')return 'ゲスト';
 const text=value.replace(/\s+/gu,' ').replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff<>]/gu,'').trim();
 return [...text].slice(0,12).join('').trim()||'ゲスト';
}

/** Clock reads occur at transitions/snapshots, independently of animation dt. */
export function createRankedRun({now=()=>globalThis.performance?.now(),idFactory=defaultId}={}){
 let run=null;
 function exclude(reason){if(run&&!run.result&&!run.reason)run.reason=reasonText(reason)}
 function time(){
  let value;try{value=now()}catch{value=NaN}
  if(!Number.isFinite(value)||value<0||run.lastNow!==null&&value<run.lastNow){exclude('clock-invalid');return run.lastNow??0}
  run.lastNow=value;return value;
 }
 function settle(){
  const value=time();
  if(run.activeSince!==null){run.elapsed+=value-run.activeSince;run.activeSince=value}
  return value;
 }
 function snapshot(){
  if(!run)return null;
  if(!run.result)settle();
  const result=run.result;
  return Object.freeze({id:run.id,difficulty:run.difficulty,durationMs:result?.durationMs??Math.floor(run.elapsed),
   eligible:result?.eligible??(run.started&&!run.reason),reason:result?.reason??run.reason,
   state:run.state,started:run.started,finished:!!result,active:!result&&run.activeSince!==null});
 }
 function begin({difficulty='normal',resume=false,excluded=false}={}){
  if(resume&&run&&!run.result){
   settle();run.activeSince=null;run.state='menu';
   if(difficulty!==run.difficulty)exclude('difficulty-changed');
  }else{
   let id;try{id=idFactory()}catch{}
   const invalidId=!validId(id);
   run={id:invalidId?defaultId():id,difficulty:difficulties.has(difficulty)?difficulty:'normal',
    elapsed:0,activeSince:null,lastNow:null,state:'menu',started:false,result:null,reason:null};
   if(invalidId)exclude('invalid-id');
   if(!difficulties.has(difficulty))exclude('invalid-difficulty');
  }
  if(excluded)exclude(excluded===true?'excluded':excluded);
  return snapshot();
 }
 function setState(state){
  if(!run||run.result)return snapshot();
  const value=settle();run.state=state;
  if(state==='playing')run.started=true;
  run.activeSince=run.started&&activeStates.has(state)?value:null;
  return snapshot();
 }
 function finish(){
  if(!run)return null;
  if(run.result)return run.result;
  settle();run.activeSince=null;
  const durationMs=Math.floor(run.elapsed);
  if(!run.started)exclude('not-started');
  else if(!validDuration(durationMs))exclude('invalid-duration');
  run.result=Object.freeze({id:run.id,difficulty:run.difficulty,durationMs,eligible:!run.reason,reason:run.reason});
  return run.result;
 }
 return Object.freeze({begin,setState,exclude,finish,snapshot});
}

function storedEntry(value){
 try{
  if(!value||Array.isArray(value)||typeof value!=='object'||!validId(value.id)||!difficulties.has(value.difficulty)||
   !validDuration(value.durationMs)||!Number.isSafeInteger(value.createdAt)||value.createdAt<0||
   typeof value.name!=='string'||normalizeRankingName(value.name)!==value.name)return null;
  return Object.freeze({id:value.id,difficulty:value.difficulty,durationMs:value.durationMs,name:value.name,createdAt:value.createdAt});
 }catch{return null}
}
function topEntries(values){
 const seen=new Set(),buckets=Object.fromEntries(RANKING_DIFFICULTIES.map(key=>[key,[]]));
 for(const value of values){const entry=storedEntry(value);if(entry&&!seen.has(entry.id)){seen.add(entry.id);buckets[entry.difficulty].push(entry)}}
 // Stable sorting leaves older equal-time entries ahead of new submissions.
 return RANKING_DIFFICULTIES.flatMap(key=>buckets[key].sort((a,b)=>a.durationMs-b.durationMs).slice(0,10));
}

/** Storage failures never prevent an in-memory result or change run timing. */
export function createRankingStore(options={}){
 const key=options.key??RANKING_STORAGE_KEY,metadataNow=options.now??Date.now;
 let storage,entries=[],persistence=false,error=null,dirty=false;
 const submitted=new Set();
 try{storage=Object.hasOwn(options,'storage')?options.storage:globalThis.localStorage}catch{error='storage-unavailable'}
 if(storage&&typeof storage.getItem==='function'&&typeof storage.setItem==='function')persistence=true;
 else error='storage-unavailable';
 function load(){
  if(!persistence)return [];
  let text;try{text=storage.getItem(key)}catch{persistence=false;error='storage-read';return []}
  if(text===null)return [];
  try{
   if(typeof text!=='string'||text.length>32768)throw Error();
   const data=JSON.parse(text);
   if(!data||data.version!==1||!Array.isArray(data.records)||data.records.length>300)throw Error();
   const valid=data.records.map(storedEntry).filter(Boolean);
   if(valid.length!==data.records.length)error='invalid-data';
   return topEntries(valid);
  }catch{error='invalid-data';return []}
 }
 entries=load();
 function read(difficulty){return difficulties.has(difficulty)?Object.freeze(entries.filter(entry=>entry.difficulty===difficulty)):empty}
 function status(id,difficulty){
  const records=read(difficulty),index=records.findIndex(entry=>entry.id===id),saved=index>=0;
  return Object.freeze({id:id??null,saved,persisted:saved&&persistence&&!dirty,rank:saved?index+1:null,records});
 }
 function persist(){
  dirty=true;
  if(!persistence)return false;
  try{storage.setItem(key,JSON.stringify({version:1,records:entries}));dirty=false;error=null;return true}
  catch{persistence=false;error='storage-write';return false}
 }
 function record(result){
  let id,difficulty,valid=false;
  try{id=result?.id;difficulty=result?.difficulty;valid=result?.eligible===true&&result.reason===null&&validId(id)&&difficulties.has(difficulty)&&validDuration(result.durationMs)}catch{}
  if(!valid)return Object.freeze({id:validId(id)?id:null,saved:false,persisted:false,rank:null,records:read(difficulty)});
  if(submitted.has(id))return status(id,difficulty);
  submitted.add(id);
  // Include scores written by another tab before adding this completion.
  const latest=load();entries=topEntries(dirty?[...entries,...latest]:[...latest,...entries]);
  const existing=entries.find(entry=>entry.id===id);
  if(existing)return status(id,existing.difficulty);
  let createdAt;try{createdAt=Math.floor(metadataNow())}catch{}
  if(!Number.isSafeInteger(createdAt)||createdAt<0)createdAt=0;
  const entry=Object.freeze({id,difficulty,durationMs:result.durationMs,name:'ゲスト',createdAt});
  const next=topEntries([...entries,entry]);
  if(!next.some(item=>item.id===id))return status(id,difficulty);
  entries=next;persist();return status(id,difficulty);
 }
 function rename(id,name){
  const latest=load();entries=topEntries(dirty?[...entries,...latest]:[...latest,...entries]);
  const existing=entries.find(entry=>entry.id===id);
  if(!existing)return status(validId(id)?id:null,null);
  name=normalizeRankingName(name);
  if(name!==existing.name){entries=entries.map(entry=>entry===existing?Object.freeze({...entry,name}):entry);persist()}
  return status(id,existing.difficulty);
 }
 function snapshot(){return Object.freeze({persistence,error,records:Object.freeze(Object.fromEntries(RANKING_DIFFICULTIES.map(difficulty=>[difficulty,read(difficulty)])))})}
 return Object.freeze({read,record,rename,snapshot});
}
