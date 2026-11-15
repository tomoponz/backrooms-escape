import assert from 'node:assert/strict';
import test from 'node:test';
import {createRankedRun,createRankingStore,formatRankingTime,normalizeRankingName,RANKING_STORAGE_KEY,RANKING_DIFFICULTIES} from '../ranking.js';

function clock(){let time=0,nextId=0;return {run:createRankedRun({now:()=>time,idFactory:()=>`run-${++nextId}`}),advance:ms=>time+=ms,set:value=>time=value}}
function memory(initial=null){
 const values=new Map(initial===null?[]:[[RANKING_STORAGE_KEY,initial]]),reads=[],writes=[];
 return {values,reads,writes,storage:{getItem(key){reads.push(key);return values.get(key)??null},setItem(key,value){writes.push({key,value});values.set(key,value)}}};
}
const result=(id,durationMs=1000,difficulty='normal')=>Object.freeze({id,difficulty,durationMs,eligible:true,reason:null});
const entry=(id,durationMs=1000,difficulty='normal',name='ゲスト')=>({id,difficulty,durationMs,name,createdAt:123});
const encoded=records=>JSON.stringify({version:1,records});

test('timing waits for actual playing and measures long real intervals without frame updates',()=>{
 const {run,advance}=clock();assert.equal(run.snapshot(),null);assert.equal(run.finish(),null);
 run.begin({difficulty:'normal'});advance(10000);
 for(const state of ['intro','awakening','caught','warning']){run.setState(state);advance(5000);assert.equal(run.snapshot().durationMs,0)}
 run.setState('playing');advance(120000);
 assert.equal(run.snapshot().durationMs,120000);
 assert.equal(run.finish().durationMs,120000);
});

test('capture, warning, falling and death transition count while every inactive state is excluded',()=>{
 const {run,advance}=clock();run.begin({difficulty:'easy'});run.setState('playing');advance(100);
 for(const state of ['caught','warning','falling','death-transition']){run.setState(state);advance(100)}
 assert.equal(run.snapshot().durationMs,500);
 for(const state of ['paused','pause','inventory','lost','menu','intro','awakening','ending','won']){
  run.setState(state);advance(10000);assert.equal(run.snapshot().durationMs,500);
 }
 run.setState('playing');advance(50);assert.equal(run.finish().durationMs,550);
});

test('repeated snapshots do not double count and finish freezes before the ending',()=>{
 const {run,advance}=clock();run.begin({difficulty:'normal'});run.setState('playing');advance(1234.9);
 assert.equal(run.snapshot().durationMs,1234);assert.equal(run.snapshot().durationMs,1234);
 const completed=run.finish();assert.equal(completed.eligible,true);assert.equal(completed.durationMs,1234);assert(Object.isFrozen(completed));
 advance(99999);run.setState('ending');run.exclude('late-change');run.setState('playing');
 assert.equal(run.finish(),completed);assert.equal(run.snapshot().durationMs,1234);assert.equal(run.snapshot().active,false);
 assert.throws(()=>{completed.durationMs=1},TypeError);
});

test('retry keeps cumulative active time and sticky exclusions, while a fresh run clears both',()=>{
 const {run,advance}=clock();run.begin({difficulty:'normal'});run.setState('playing');advance(1000);run.exclude('invulnerability');
 run.setState('death-transition');advance(500);run.setState('lost');advance(20000);
 const resumed=run.begin({difficulty:'normal',resume:true});assert.equal(resumed.id,'run-1');assert.equal(resumed.durationMs,1500);assert.equal(resumed.reason,'invulnerability');
 advance(30000);assert.equal(run.snapshot().durationMs,1500);run.setState('playing');advance(250);
 assert.deepEqual(run.finish(),{id:'run-1',difficulty:'normal',durationMs:1750,eligible:false,reason:'invulnerability'});
 run.begin({difficulty:'explore'});assert.equal(run.snapshot().id,'run-2');assert.equal(run.snapshot().durationMs,0);assert.equal(run.snapshot().reason,null);
 run.setState('playing');advance(200);assert.equal(run.finish().eligible,true);
});

test('QA and checkpoint exclusions cannot be removed by retry or another exclusion',()=>{
 for(const reason of ['qa','checkpoint']){
  const {run,advance}=clock();run.begin({difficulty:'easy',excluded:reason});run.setState('playing');advance(100);
  run.setState('lost');run.begin({difficulty:'easy',resume:true,excluded:false});run.exclude('invulnerability');run.setState('playing');advance(100);
  const completed=run.finish();assert.equal(completed.eligible,false);assert.equal(completed.reason,reason);assert.equal(completed.durationMs,200);
 }
});

test('retry cannot relabel an existing run as another difficulty',()=>{
 const {run,advance}=clock();run.begin({difficulty:'normal'});run.setState('playing');advance(100);run.setState('lost');
 run.begin({difficulty:'explore',resume:true});run.setState('playing');advance(100);
 assert.deepEqual(run.finish(),{id:'run-1',difficulty:'normal',durationMs:200,eligible:false,reason:'difficulty-changed'});
});

test('backward, invalid and throwing clocks fail closed without negative duration or game errors',()=>{
 const {run,advance,set}=clock();run.begin({difficulty:'normal'});run.setState('playing');advance(100);assert.equal(run.snapshot().durationMs,100);
 set(20);assert.equal(run.snapshot().durationMs,100);set(200);assert.equal(run.finish().durationMs,200);assert.equal(run.finish().reason,'clock-invalid');
 for(const now of [()=>NaN,()=>Infinity,()=>{throw Error('clock unavailable')}]){
  const broken=createRankedRun({now,idFactory:()=> 'broken'});assert.doesNotThrow(()=>{broken.begin({difficulty:'normal'});broken.setState('playing');broken.finish()});
  assert.equal(broken.finish().eligible,false);assert.equal(broken.finish().durationMs,0);
 }
});

test('unstarted, zero-time and invalid-difficulty runs never become eligible',()=>{
 const {run}=clock();run.begin({difficulty:'normal'});assert.equal(run.finish().reason,'not-started');
 run.begin({difficulty:'normal'});run.setState('playing');assert.equal(run.finish().reason,'invalid-duration');
 run.begin({difficulty:'unknown'});assert.equal(run.snapshot().reason,'invalid-difficulty');
});

test('local storage never reads legacy BEST and writes a completion only once',()=>{
 const backend=memory();backend.values.set('backrooms-wide-world-best-normal','0.01');
 const store=createRankingStore({storage:backend.storage,now:()=>999});assert.deepEqual(store.read('normal'),[]);
 const first=store.record(result('first',1234));assert.equal(first.saved,true);assert.equal(first.persisted,true);assert.equal(first.rank,1);
 assert.deepEqual(first.records[0],{id:'first',difficulty:'normal',durationMs:1234,name:'ゲスト',createdAt:999});
 store.record(result('first',1,'easy'));store.snapshot();store.read('normal');
 assert.equal(backend.writes.length,1);assert(backend.reads.every(key=>key===RANKING_STORAGE_KEY));
 assert.equal(backend.values.get('backrooms-wide-world-best-normal'),'0.01');
 assert(Object.isFrozen(first.records));assert(Object.isFrozen(first.records[0]));
});

test('rankings are independent, stable on ties and bounded to ten per difficulty',()=>{
 const backend=memory(),store=createRankingStore({storage:backend.storage,now:()=>100});
 for(const difficulty of RANKING_DIFFICULTIES){
  for(let n=0;n<10;n++)store.record(result(`${difficulty}-${n}`,1000+n*10,difficulty));
  const writes=backend.writes.length,outside=store.record(result(`${difficulty}-outside`,2000,difficulty));
  assert.equal(outside.saved,false);assert.equal(outside.rank,null);assert.equal(backend.writes.length,writes);
  const fastest=store.record(result(`${difficulty}-fastest`,500,difficulty));assert.equal(fastest.rank,1);assert.equal(store.read(difficulty).length,10);
 }
 assert.equal(JSON.parse(backend.values.get(RANKING_STORAGE_KEY)).records.length,30);
 const ties=createRankingStore({storage:memory(encoded([entry('older',1000),entry('also-old',1000)])).storage});
 ties.record(result('new',1000));assert.deepEqual(ties.read('normal').map(row=>row.id),['older','also-old','new']);
});

test('stored rows are strictly filtered, deduplicated by ID and sorted',()=>{
 const rows=[entry('first',2000),entry('fast',1000),entry('first',1,'easy'),entry('bad-duration',-1),entry('fraction',1.5),
  entry('bad-difficulty',1000,'other'),entry('bad-name',1000,'normal','<script>'),{...entry('bad-date'),createdAt:-1},entry('x'.repeat(81)),null,{}];
 const store=createRankingStore({storage:memory(encoded(rows)).storage});
 assert.deepEqual(store.read('normal').map(row=>row.id),['fast','first']);assert.deepEqual(store.read('easy'),[]);assert.equal(store.snapshot().error,'invalid-data');
});

test('corrupt, unknown-schema, oversized and excessive-row storage is bounded and recoverable',()=>{
 for(const text of ['{broken',JSON.stringify({version:2,records:[entry('wrong-version')]}),'x'.repeat(32769),encoded(Array.from({length:301},(_,i)=>entry(`r${i}`)))]){
  const backend=memory(text),store=createRankingStore({storage:backend.storage});
  assert.deepEqual(store.read('normal'),[]);assert.equal(store.snapshot().error,'invalid-data');assert.equal(backend.writes.length,0);
  assert.equal(store.record(result('recovered')).persisted,true);assert.equal(JSON.parse(backend.values.get(RANKING_STORAGE_KEY)).version,1);
 }
});

test('ineligible and malformed completions never enter storage',()=>{
 const backend=memory(),store=createRankingStore({storage:backend.storage});
 for(const invalid of [null,{}, {...result('excluded'),eligible:false,reason:'qa'},{...result('contradictory'),reason:'checkpoint'},result('zero',0),result('negative',-1),result('fractional',1.2),result('unsafe',Number.MAX_SAFE_INTEGER+1),result('wrong',100,'other'),result('<invalid>')]){
  assert.equal(store.record(invalid).saved,false);
 }
 assert.deepEqual(store.read('normal'),[]);assert.equal(backend.writes.length,0);
});

test('denied or absent storage keeps the result and renamed value in memory',()=>{
 for(const storage of [null,{getItem(){throw Error('denied')},setItem(){throw Error('must not write after denied read')}}]){
  const store=createRankingStore({storage}),submission=store.record(result('memory'));
  assert.equal(submission.saved,true);assert.equal(submission.persisted,false);assert.equal(submission.rank,1);assert.equal(store.snapshot().persistence,false);
  assert.equal(store.rename('memory','太郎').records[0].name,'太郎');assert.equal(store.read('normal')[0].durationMs,1000);
 }
});

test('quota failures keep the new score in memory and do not retry a duplicate write',()=>{
 let writes=0;const store=createRankingStore({storage:{getItem:()=>null,setItem(){writes++;throw Error('quota')}}});
 const submission=store.record(result('quota'));assert.equal(submission.saved,true);assert.equal(submission.persisted,false);
 assert.equal(store.snapshot().error,'storage-write');store.record(result('quota'));store.snapshot();store.read('normal');assert.equal(writes,1);
 assert.equal(store.read('normal')[0].id,'quota');
});

test('names are plain bounded Unicode text and renaming preserves the completion identity',()=>{
 assert.equal(normalizeRankingName('　<猫>  さん\n'),'猫 さん');assert.equal(normalizeRankingName('\u202e\u0000'),'ゲスト');assert.equal(normalizeRankingName(null),'ゲスト');
 assert.equal(normalizeRankingName('🐈'.repeat(13)),'🐈'.repeat(12));
 const backend=memory(),store=createRankingStore({storage:backend.storage,now:()=>123});store.record(result('named',3456,'easy'));
 const renamed=store.rename('named','🐈'.repeat(13));assert.equal(renamed.persisted,true);assert.equal(renamed.records[0].name,'🐈'.repeat(12));
 assert.deepEqual({...renamed.records[0],name:'ゲスト'},entry('named',3456,'easy'));
 const writes=backend.writes.length;store.rename('named','🐈'.repeat(12));store.record(result('named',1,'easy'));assert.equal(backend.writes.length,writes);
 assert.equal(store.rename('missing','Nobody').saved,false);
});

test('new submissions and renames merge records already written by another tab',()=>{
 const backend=memory(),a=createRankingStore({storage:backend.storage}),b=createRankingStore({storage:backend.storage});
 a.record(result('a',2000));b.record(result('b',1000));assert.deepEqual(b.read('normal').map(row=>row.id),['b','a']);
 b.rename('a','別の窓');a.record(result('c',3000));assert.equal(a.read('normal').find(row=>row.id==='a').name,'別の窓');
 b.record(result('d',4000));a.rename('c','名前');assert.deepEqual(a.read('normal').map(row=>row.id),['b','a','c','d']);
});

test('time formatting is consistent at hundredth, second and minute boundaries',()=>{
 for(const [value,expected] of [[0,'00:00.00'],[9,'00:00.00'],[10,'00:00.01'],[999,'00:00.99'],[1000,'00:01.00'],[59999,'00:59.99'],[60000,'01:00.00'],[83459,'01:23.45'],[3600000,'60:00.00'],[NaN,'—'],[-1,'—']])assert.equal(formatRankingTime(value),expected);
});
