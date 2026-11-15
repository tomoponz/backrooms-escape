import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRankedRun,createRankingStore,formatRankingTime} from '../ranking.js';
import {createEscapeObjective} from '../escape-objective.js';
import {formatTime} from '../core.js';

const source=readFileSync(new URL('../game.js',import.meta.url),'utf8');

// Compile the real function body instead of maintaining a second version of
// game lifecycle logic. The JS parser finds the complete body, including nested
// object literals, template strings and default-parameter braces.
function gameFunction(name){
 const match=new RegExp(`^function ${name}\\s*\\(`,'m').exec(source);
 assert(match,`missing game function ${name}`);
 for(let end=source.indexOf('}',match.index);end>=0;end=source.indexOf('}',end+1)){
  const text=source.slice(match.index,end+1);
  try{new vm.Script(`(${text})`);return text}catch(error){if(!(error instanceof SyntaxError))throw error}
 }
 throw new Error(`unterminated game function ${name}`);
}
const functions=['setState','requestMouse','notice','toggleInvulnerability','start',
 'finishAwakening','pause','resume','openInventory','closeInventory','title',
 'finish','completeDeath','completeEscape'].map(gameFunction).join('\n');
const qaDeclaration=source.match(/^const qaEnabled=[^\n]+/m)?.[0];
assert(qaDeclaration,'the QA capability must be fixed at page initialization');

function fixture({qa=false}={}){
 let time=0,sequence=0;
 const values=new Map(),writes=[];
 const storage={getItem:key=>values.get(key)??null,
  setItem(key,value){values.set(key,String(value));writes.push({key,value:String(value)})},
  removeItem:key=>values.delete(key)};
 const now=()=>time,elements=new Map(),results=[],stageCalls=[];
 const element=id=>{
  if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',style:{},dataset:{},
   classList:{add(){},remove(){},toggle(){}},setAttribute(){}});
  return elements.get(id);
 };
 Object.assign(element('difficulty'),{value:'normal'});
 Object.assign(element('quality'),{value:'high'});
 Object.assign(element('volume'),{value:'65'});
 Object.assign(element('motion'),{checked:false});
 const nav={length:6,step:2,start:0,exit:4,open:i=>Number.isInteger(i)&&i>=0&&i<6,
  visible:()=>true,point:i=>[i*2,0],floorAt:()=>0,
  neighbors:i=>[i-1,i+1].filter(j=>j>=0&&j<6),
  path:(from,to)=>Array.from({length:Math.abs(to-from)+1},(_,i)=>from+i*Math.sign(to-from))};
 const objective=createEscapeObjective(nav,{maintenance:{i:1},
  breakers:[{id:'second',i:2},{id:'third',i:3}],escape:{i:5}});
 const rankedRun=createRankedRun({now,idFactory:()=>`integration-run-${++sequence}`});
 const rankingStore=createRankingStore({storage,now:()=>1234567890});
 const sound={init(){},setVolume(){},stopCue(){},setState(){}};
 const context=vm.createContext({console,performance:{now},formatRankingTime,formatTime,
  $:element,document:{body:{dataset:{}}},window:{},keys:new Set(),state:'menu',
  titleFrameDirty:false,warningRoom:null,inventoryUI:{open(){},close(){}},sound,
  input:{clear(){},releasePointerLock(){},requestPointerLock(){}},
  world:{},bacteria:{},renderingUnavailable:false,nav,objective,
  invulnerable:false,usedInvulnerability:false,jam:{pried:false},
  deathSequence:{reset(){},start(){}},infectionSequence:{reset(){}},
  difficulty:'normal',quality:'high',motion:false,elapsed:0,stamina:100,
  sprintReady:true,footClock:0,camera:{fov:74},flash:false,qaRoute:null,qaMessage:'',
  inventory:{reset(){}},itemSlots:{reset(){}},glimpse:{reset(){}},
  awakening:null,player:[0,0],yaw:0,pitch:0,operationTime:0,endingTime:0,
  pendingDeath:'bacteria',noticeUntil:0,water:{pickups:[]},
  updateHUD(){},createAwakening:()=>({start(){}}),
  qaEnabled:vm.runInNewContext(`${qaDeclaration}\nqaEnabled`,{
   URLSearchParams,location:{search:qa?'?qa=0':''}}),
  rankedRun,rankingStore,pendingRankedResult:null,
  rankingPanel:{showResult(...args){results.push(args)},clearResult(){},close(){}},
  localStorage:storage,
 });
 // GPU/audio/DOM are collaborators here. Use the real objective reset semantics
 // at the stage boundary; its geometry/render setup is covered separately.
 context.activateStage=(_index,checkpoint)=>{
  stageCalls.push(checkpoint?{restored:[...checkpoint.restored],pried:checkpoint.pried}:null);
  objective.reset(checkpoint?.restored);
  context.jam={pried:checkpoint?.pried??false,known:false,progress:0};
 };
 vm.runInContext(functions,context);
 const clear=()=>{
  for(const breaker of objective.breakers)objective.interact([...breaker.position],breaker.id);
  objective.interact(nav.point(nav.exit),'exit');
  objective.update(nav.point(5));
  assert.equal(objective.state.escaped,true);
  context.finish(true);
 };
 return {context,rankedRun,rankingStore,results,stageCalls,writes,elements,
  advance:ms=>{time+=ms},clear,snapshot:()=>rankedRun.snapshot()};
}

test('actual fresh clear freezes before the ending and saves exactly once',()=>{
 const h=fixture(),g=h.context;
 g.start();h.advance(2500);
 assert.equal(g.elapsed,0,'the simulation clock is independent in this fixture');
 h.clear();
 assert.equal(g.state,'ending');
 assert.equal(h.snapshot().durationMs,2500);
 h.advance(30000);
 g.completeEscape();g.completeEscape();g.finish(true);
 const rows=h.rankingStore.read('normal');
 assert.equal(rows.length,1);
 assert.equal(rows[0].durationMs,2500);
 assert.equal(h.results.length,1,'result publication is one-shot');
 assert.equal(h.writes.some(write=>write.key.startsWith('backrooms-wide-world-best-')),false,
  'legacy best records must stay read-only');
});

test('actual awakening, pause and inventory transitions exclude their waiting time',()=>{
 const h=fixture(),g=h.context;
 g.setState('intro');h.advance(30000);
 g.start({showAwakening:true});
 h.advance(10000);assert.equal(h.snapshot().durationMs,0);
 g.finishAwakening();h.advance(700);
 g.pause();h.advance(10000);
 assert.equal(h.snapshot().durationMs,700);
 g.resume();h.advance(300);
 g.openInventory();h.advance(15000);
 assert.equal(h.snapshot().durationMs,1000);
 g.closeInventory();h.advance(500);
 h.clear();g.completeEscape();
 assert.equal(h.rankingStore.read('normal')[0].durationMs,1500);
});

test('zero-progress death retry keeps cumulative time and remains eligible',()=>{
 const h=fixture(),g=h.context;
 g.start();const id=h.snapshot().id;
 h.advance(10000);g.finish(false);h.advance(4000);g.completeDeath();
 assert.equal(g.state,'lost');
 assert.equal(h.snapshot().durationMs,14000,'death transition is counted');
 assert.equal(h.elements.get('result-stats').textContent,'CAUGHT / 00:14',
  'the loss screen must agree with the cumulative clock, not simulation elapsed');
 h.advance(60000);
 g.start({resumeBreakers:true});
 assert.equal(h.snapshot().id,id);
 assert.equal(h.snapshot().durationMs,14000,'lost-screen wait is excluded');
 assert.equal(h.snapshot().eligible,true);
 h.advance(6000);h.clear();g.completeEscape();
 assert.equal(h.rankingStore.read('normal')[0].durationMs,20000);
});

for(const progress of ['breaker','pried'])test(`checkpoint carrying ${progress} progress keeps time but excludes the run`,()=>{
 const h=fixture(),g=h.context;
 g.start();const id=h.snapshot().id;
 if(progress==='breaker')g.objective.interact([...g.objective.maintenance.position],'maintenance');
 else g.jam.pried=true;
 h.advance(100000);g.finish(false);h.advance(4000);g.completeDeath();
 h.advance(10000);g.start({resumeBreakers:true});
 assert.equal(h.snapshot().id,id);
 assert.equal(h.snapshot().durationMs,104000);
 assert.equal(h.snapshot().eligible,false);
 assert.equal(h.snapshot().reason,'checkpoint');
 assert.equal(progress==='breaker'?g.objective.isRestored('maintenance'):g.jam.pried,true);
 h.advance(20000);h.clear();g.completeEscape();
 assert.equal(h.snapshot().durationMs,124000);
 assert.equal(h.rankingStore.read('normal').length,0);
});

test('invulnerability remains excluded after toggling off and retry, but a fresh reset clears it',()=>{
 const h=fixture(),g=h.context;
 g.start();const previousId=h.snapshot().id;
 g.toggleInvulnerability();g.toggleInvulnerability();
 assert.equal(g.invulnerable,false);
 assert.equal(g.usedInvulnerability,true);
 h.advance(10000);g.finish(false);h.advance(4000);g.completeDeath();
 g.start({resumeBreakers:true});
 assert.equal(h.snapshot().id,previousId);
 assert.equal(h.snapshot().eligible,false);
 assert.equal(g.usedInvulnerability,true);
 g.pause();g.start();
 assert.notEqual(h.snapshot().id,previousId);
 assert.equal(h.snapshot().durationMs,0);
 assert.equal(h.snapshot().eligible,true);
 assert.equal(g.usedInvulnerability,false);
 assert.equal(h.stageCalls.at(-1),null,'fresh start carries no checkpoint');
 h.advance(5000);h.clear();g.completeEscape();
 assert.equal(h.rankingStore.read('normal')[0].durationMs,5000);
});

test('a QA session remains excluded through death, retry and fresh restart',()=>{
 const h=fixture({qa:true}),g=h.context;
 g.start();h.advance(10000);g.finish(false);h.advance(4000);g.completeDeath();
 g.start({resumeBreakers:true});
 assert.equal(h.snapshot().eligible,false);
 g.pause();g.start();
 assert.equal(h.snapshot().eligible,false);
 h.advance(5000);h.clear();g.completeEscape();
 assert.equal(h.rankingStore.read('normal').length,0);
 assert.equal(h.writes.length,0,'an excluded QA result must not write storage');
});

test('caught, escapable warning and falling states count, while title abandons the attempt',()=>{
 const h=fixture(),g=h.context;
 g.start();h.advance(1000);
 for(const state of ['caught','warning','falling']){g.setState(state);h.advance(2000)}
 g.setState('playing');
 assert.equal(h.snapshot().durationMs,7000);
 const id=h.snapshot().id;
 g.title();h.advance(60000);
 assert.equal(h.rankingStore.read('normal').length,0);
 g.start();
 assert.notEqual(h.snapshot().id,id);
 assert.equal(h.snapshot().durationMs,0);
 assert.equal(h.snapshot().eligible,true);
});
