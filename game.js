import {collectNearbyFloorItems} from './floor-pickup.js';
import {Renderer,M,V} from './engine.js';
import {beginModelLoadBatch,endModelLoadBatch} from './model-source.js';
import {formatTime} from './core.js';
import {loadWorld} from './world.js';
import {createBacteriaAnimator} from './enemy-animation.js';
import {applyBacteriaMaterial} from './bacteria-material.js';
import {CAPTURE_DURATION,captureDistance,captureFrame,posedHeadCenter} from './capture-sequence.js';
import {HorrorAudio} from './horror-audio.js';
import {createGlimpseDirector} from './glimpse.js';
import {createInventory,createInventoryPanel} from './inventory.js';
import {createItemSlots} from './item-slots.js';
import {loadIntroConfig,createIntroSequence,createAwakening} from './intro.js';
import {createEscapeObjective} from './escape-objective.js';
import {ALMOND_WATER_ID,ALMOND_WATER_MAX_STACK,ALMOND_WATER_RESTORE,ALMOND_WATER_MODEL_URL,registerAlmondWater,createAlmondWaterPickups} from './almond-water.js';
import {createEnemyDirector,ENEMY_BEHAVIOR} from './enemy-director.js';
import {createEncounterDirector} from './encounter-director.js';
import {createSkinstealerDirector} from './skinstealer-director.js';
import {createSkinnedActor} from './skinned-actor.js';
import {advancePlayer} from './player-controller.js';
import {bakedFallTarget,fallFrame} from './baked-fall.js';
import {BAKED_PITS} from './baked-pits-data.js';
import {createGameInput} from './game-input.js';
import {createExplorationJournal} from './exploration-journal.js';
import {createEnvironmentObservations} from './environment-observations.js';
import {installModalAccessibility} from './modal-accessibility.js';
import {atmosphereAt} from './atmosphere.js';
import {createSourceWorldVisual} from './source-world-visual.js';
import {routeGeometry} from './navigation-metrics.js';
import {createLockerHiding} from './locker-hiding.js';
import {createLockerVisual} from './locker-visual.js';
import {createFlashlightPickup,flashlightFloorMatrix,FLASHLIGHT_ID} from './flashlight-pickup.js';
import {createDeathSequence} from './death-sequence.js';
import {createWallWriting} from './wall-writing.js';
import {createFullscreenControl} from './fullscreen-control.js';
import {createInfectionSequence} from './infection-sequence.js';
import {FORBIDDEN_ROOM,enteredForbiddenRoom} from './forbidden-room-navigation.js';
import {createWarningRoomVisual} from './warning-room-visual.js';
import {createForbiddenRoomWallRepair} from './forbidden-room-wall-repair.js';
import {createBustPyramid} from './bust-pyramid.js';
import {createBustWorldBoundaries} from './bust-world-boundaries.js';
import {createRenderPipeline,projectToScreen} from './render-pipeline.js';
import {createGuidance,relativeBearing} from './guidance.js';
import {createHorrorDirector} from './horror-director.js';
import {loadDoorFrames,createDoorFrames} from './door-frames.js';
import {createBreakerPanels} from './breaker-panels.js';
import {createWatchers,createStraySigns} from './liminal-props.js';
import {createSetDressing,DRESSING_MODELS} from './set-dressing.js';
import {createAdaptiveResolution} from './adaptive-resolution.js';
const $=id=>document.getElementById(id),canvas=$('view'),keys=new Set();
// Device Memory is an optional, rounded browser hint. Keep the existing
// standard default when it is unavailable; the player can always change it.
const lowMemoryDevice=Number.isFinite(navigator.deviceMemory)&&navigator.deviceMemory<=4;
if(lowMemoryDevice){$('quality').value='low';$('quality').dispatchEvent(new Event('change',{bubbles:true}))}
let hudClock=0,renderScale=1;
const adaptiveResolution=createAdaptiveResolution();
let titleFrameDirty=true,titlePixelRatio=window.devicePixelRatio;
let world,stage,stageIndex=0,stageObjects=[],animator,passages=[],exitDoor=[],captureTime=0,atmosphere=null;
let objective,water,enemyDirector,encounter,input,exploration,waterModel,staminaDelay=0,operationTime=0,explorationClock=0,markerElements=[],maintenanceModels=[],maintenanceFixture=null;
let renderingUnavailable=false,sourceScene=null,returnHintReached=false;
let observations=null,fall=null,invulnerable=false,usedInvulnerability=false;
let hiding=null, lockerVisual=null, lockerInstances=[], flashlightPickup=null, flashlightModel=null;
let deathSequence=null, pendingDeath='bacteria';
let wallWriting=null;
let fullscreenControl=null,infectionSequence=null,warningRoom=null,warningWallRepair=null;
let bustModel=null,bustPyramid=null;
let pipeline=null,overlayItems=[],postState={};
let objectiveShownAt=0,watchers=null,straySigns=[];
// First sign of the pursuer: while the player comes down the east corridor its
// shadow crosses the end wall ahead and turns toward the forbidden room; the
// lights sag and the wall is bare, and nothing stands at that doorway. The
// caster is the approved Bacteria model flattened onto the wall's plane (the VR
// end wall lies at x = 6.694) by a parallel-light shadow matrix.
const SHADOW_INTRO=Object.freeze({zone:{minX:-13.5,maxX:-6.5,minZ:-24.2,maxZ:-20.9},wallX:6.674,drop:-.03,casterX:-.2,from:-21.35,to:-23.7,seconds:2.8,vanishX:.4});
let shadowIntro={phase:'waiting',time:0},bacteriaShadow=null,pitDread=0,pitNoticeAt=-99;
const CROWBAR_ID='crowbar',dressingModels={};let dressing=null,jam={pried:false,known:false,progress:0};
// A capture can be broken twice per run by tapping (or holding) Space/E or clicking.
// Three taps a second are enough; holding the key fills the gauge in under three seconds.
const STRUGGLE=Object.freeze({escapes:2,window:5,press:.12,holdRate:.36,decay:.1,grace:4,stun:3.2,shove:2.3,aftermath:14});
let struggle=null,escapesLeft=STRUGGLE.escapes,graceUntil=0,enemyStunUntil=0,skinStunUntil=0,aftermath=0,lockerCloseAt=null,bustLoud=false,bustCooldown=0;
let guidance=null,horror=null,doorFrames=[],breakerPanels=null,guideInfo=null,operationTarget=null,endingTime=0,phantomSteps=[],sceneLight=1;
// Optional ?ratio=1 caps the canvas pixel ratio (diagnostics and slow displays).
const outputRatioLimit=(()=>{const value=Number(new URLSearchParams(location.search).get('ratio'));return value>=.5&&value<=3?value:undefined})();
let hazmatModel,skinModel,lockerModel,hazmatAnimator,skinAnimator,skinDirector,skinState=null,skinCaptureActor='bacteria',skinFootDistance=0;
const explored=new Set(),discovered=new Set();let wayfinding={exit:[],maintenance:[],return:[],escape:[]};
let renderer,nav,bacteria,state='loading',player=[0,0],yaw=-Math.PI/2,pitch=0,elapsed=0,stamina=100,sprintReady=true,collected=new Set(),flash=false,difficulty='normal',quality=$('quality').value,motion=false,enemy,noticeUntil=0,last=performance.now(),footClock=0,loadCount=0,qaRoute=null,qaMessage='',qaAutomatic=true;
// Walking pace suits rooms of this size; normal pursuit catches a walking
// player, while a fresh sprint creates distance until stamina runs out.
const camera={eye:[0,1.6,1],yaw:0,pitch:0,fov:74},settings={normal:{walk:3.4,sprint:5.9,chase:4.5,patrol:1.6},easy:{walk:3.4,sprint:5.9,chase:3.5,patrol:1.25},explore:{walk:3.4,sprint:5.9,chase:0,patrol:0}};
let sound=new HorrorAudio({volume:.65}),inventory=createInventory(),inventoryUI=null,itemSlots=null,glimpse=createGlimpseDirector({delay:18}),introSequence=null,awakening=null;
const LOCKER_TRANSITION_SECONDS=2.05, LOCKER_ANIMATION_SPEED=2;
function notice(text,duration=5){$('message').textContent=text;noticeUntil=performance.now()+duration*1000}
function setState(next){let previous=state;state=next;titleFrameDirty=true;if(next!=='playing')warningRoom?.update(camera,false);if(document.body.dataset)document.body.dataset.gameState=next;for(let id of ['menu','pause','result','hud'])$(id).hidden=true;$('map-wrap').hidden=true;input?.clear();keys.clear();if(next==='menu')$('menu').hidden=false;if(next==='paused')$('pause').hidden=false;if(next==='playing')$('hud').hidden=false;if(next==='lost'||next==='won')$('result').hidden=false;if(next!=='playing'){input?.releasePointerLock();$('danger').style.opacity=0}if(next!=='caught'){$('danger').style.backgroundColor='transparent';$('danger').style.boxShadow=''}if(next!=='inventory')inventoryUI?.close();if(next!=='caught')sound.setState(next==='inventory'?'paused':next,{silent:previous==='caught'&&next==='lost'})}
function requestMouse(){input?.requestPointerLock()}
function toggleInvulnerability(){
 if(state!=='playing')return;
 invulnerable=!invulnerable;
 if(invulnerable)usedInvulnerability=true;
 notice(invulnerable?'無敵モード ON':'無敵モード OFF',3);
}
function recoverInvulnerable(cause){
 const warning=cause==='infection';
 const outside=FORBIDDEN_ROOM.safeOutside;
 const safe=warning&&nav.canWalk(...outside)?outside:nav.point(nav.start);
 if(warning)infectionSequence?.reset();
 player=[...safe];fall=null;qaRoute=null;operationTime=0;
 const area=nav.regionAt(...player);if(area!==stageIndex)setArea(area);
 camera.eye=[player[0],nav.floorAt(...player)+1.62,player[1]];camera.yaw=yaw;camera.pitch=pitch;
 setState('playing');
 notice(warning?'無敵モード：警告の部屋の外へ戻った。':'無敵モード：安全な床へ戻った。',4);
 updateHUD();
}
function activateStage(index, breakerCheckpoint){
 stageIndex=index;stage=world.stages[index];nav=world.nav;fall=null;
 player=nav.point(nav.start);yaw=stage.spawnYaw;pitch=0;collected.clear();
 hiding?.reset();for(const item of lockerInstances)item.visual.setOpenFraction(0);bustPyramid?.reset();
 flashlightPickup?.reset();flash=false;
 {const ahead=nav.descend?.(nav.start,nav.exit,14)??[],p=ahead.length>1?nav.point(ahead.at(-1)):null;if(p)yaw=Math.atan2(p[0]-player[0],-(p[1]-player[1]))}
 if(flashlightPickup&&!flashlightPickup.state.owned){const p=flashlightPickup.state.position;yaw=Math.atan2(p[0]-player[0],-(p[1]-player[1]));pitch=-.35}
 enemy={pos:nav.point(nav.enemy),active:false,path:[],pathClock:0,memory:0,target:nav.enemy,mode:'dormant',yaw:0,lastKnown:null};bacteria.visible=false;animator?.reset();
 enemyDirector=createEnemyDirector({nav,enemy,seed:0xBACA});
 encounter=createEncounterDirector({nav,enemy,director:enemyDirector,exit:objective.exit,maintenance:objective.maintenance});
 skinCaptureActor='bacteria';skinFootDistance=0;hazmatAnimator?.reset();skinAnimator?.reset();skinState=skinDirector?.reset(difficulty)??null;
 if(hazmatModel)hazmatModel.visible=false;if(skinModel)skinModel.visible=false;
 objective?.reset(breakerCheckpoint?.restored);returnHintReached=false;setOutdoorDoor(false);guidance?.reset();horror?.reset();breakerPanels?.reset();watchers?.reset();dressing?.reset();jam={pried:breakerCheckpoint?.pried??false,known:false,progress:0};shadowIntro={phase:'waiting',time:0};if(bacteriaShadow)bacteriaShadow.visible=false;pitDread=0;pitNoticeAt=-99;operationTarget=null;endingTime=0;objectiveShownAt=0;struggle=null;escapesLeft=STRUGGLE.escapes;graceUntil=0;enemyStunUntil=0;skinStunUntil=0;aftermath=0;lockerCloseAt=null;bustLoud=false;bustCooldown=0;showStruggle(false);sound.setLoop?.('heartbeat',0,.1);sound.setLoop?.('chase_bgm',0,.1);phantomSteps=[];postState={};overlayItems=[];guideInfo=null;water?.reset();observations?.reset();exploration?.cancelPending();explored.clear();discovered.clear();explorationClock=0;operationTime=0;staminaDelay=0;revealSurroundings();
 // Restore completion and its lasting effects, without replaying the event.
 if(breakerCheckpoint){
  const ids=breakerCheckpoint.restored, total=objective.breakers.length;
  ids.forEach((id,i)=>{
   const panel=objective.breakers.find(b=>b.id===id);
   breakerPanels?.set(id,{restored:true});
   const region=nav.regionIds?.[nav.regionAt(...panel.position)]??null;
   horror?.notify(i+1===total?'power-restored':'breaker-restored',{region,restored:i+1,total,quiet:true});
  });
 }
 camera.eye=[player[0],nav.floorAt(...player)+1.62,player[1]];camera.yaw=yaw;camera.pitch=pitch;
 atmosphere={...stage.atmosphere,fog:[...stage.atmosphere.fog]};
 setArea(index);updateHUD();
}
function setArea(index){
 stageIndex=index;stage=world.stages[index];
 if($('area-name'))$('area-name').textContent=stage.title;
 if($('area-index'))$('area-index').textContent='LOCATION / '+stage.number;
 if($('chapter-progress'))$('chapter-progress').textContent='ONE CONTINUOUS WORLD';
}

function start(options={}){if(!world||!bacteria||renderingUnavailable)return;
 invulnerable=false;
 const breakerCheckpoint=options.resumeBreakers&&state==='lost'?{restored:objective.state.restored??objective.breakers.filter(b=>objective.isRestored(b.id)).map(b=>b.id),pried:jam.pried}:null;
 if(!breakerCheckpoint)usedInvulnerability=false;
 deathSequence?.reset();infectionSequence?.reset();sound.stopCue('chant');sound.init();sound.setVolume(+$('volume').value/100);difficulty=$('difficulty').value;quality=$('quality').value;motion=$('motion').checked;elapsed=0;stamina=100;sprintReady=true;footClock=0;camera.fov=74;flash=false;qaRoute=null;qaMessage='';inventory.reset();itemSlots?.reset();glimpse.reset();activateStage(0,breakerCheckpoint);if(options?.showAwakening){awakening??=createAwakening({document,window,onFinish:finishAwakening});setState('awakening');awakening.start()}else{setState('playing');notice(breakerCheckpoint?.restored.length?'復旧済みの配電盤はそのまま。懐中電灯は前方の床に落ちている。':'前方の懐中電灯は、近づくと拾える。F で点灯。',9);requestMouse();updateHUD()}}
function finishAwakening(userGesture=false){if(state!=='awakening')return;camera.eye=[player[0],nav.floorAt(...player)+1.62,player[1]];camera.yaw=yaw;camera.pitch=pitch;setState('playing');notice('前方の懐中電灯は、近づくと拾える。F で点灯。',9);if(userGesture)requestMouse();updateHUD()}
function pause(){if(state==='playing'){operationTime=0;if($('pause-description'))$('pause-description').textContent='敵も時間も、止まっています。';setState('paused')}}
function openInventory(){if(state!=='playing'||!inventoryUI)return;operationTime=0;setState('inventory');inventoryUI.open()}
function closeInventory(){if(state!=='inventory')return;inventoryUI.close();setState('playing');requestMouse()}
function resume(){if(state!=='paused'||renderingUnavailable)return;sound.init();setState('playing');requestMouse()}
function useItem(id){
 const phase=hiding?.state.phase;
 if(phase==='entering'||phase==='exiting')return {ok:false,reason:'transition',message:'ロッカーの出入り中は使えません。'};
 const result=inventory.use(id,{getStamina:()=>stamina,restoreStamina:amount=>{if(!Number.isFinite(amount)||amount<=0||stamina>=100)return false;stamina=Math.min(100,stamina+amount);if(stamina>=25)sprintReady=true;return true}});
 if(!result.message)result.message=result.reason==='missing'?'アーモンドウォーターがありません。':'今は使えません。';
 updateHUD();return result;
}
function toggleFlash(){const phase=hiding?.state.phase;if(phase==='entering'||phase==='exiting'){notice('ロッカーの出入り中は使えません。',3);return}const result=flashlightPickup?.toggle();if(!result?.ok){notice('床の懐中電灯を拾ってから使う。',3);return}flash=result.on;itemSlots?.setFlash(flash);sound.cue('flash');updateHUD()}
function useSelectedSlot(){
 const phase=hiding?.state.phase;if(phase==='entering'||phase==='exiting'){notice('ロッカーの出入り中は使えません。',3);return}
 const id=itemSlots?.selectedItem();if(!id){notice('選択した枠は空です。',3);return}
 if(id===FLASHLIGHT_ID){toggleFlash();return}
 const result=useItem(id);notice(result.message,3)
}
function title(){deathSequence?.reset();infectionSequence?.reset();sound.stopCue('chant');qaRoute=null;setState('menu');$('result').classList.remove('won')}
function beginWarningRoom(){
 if(state!=='playing'||!infectionSequence)return;
 qaRoute=null;operationTime=0;setState('warning');infectionSequence.reset();infectionSequence.start();
}
function escapeWarningRoom({wasFullscreen=false}={}){
 if(state!=='warning')return;
 const exitFullscreen=wasFullscreen||document.fullscreenElement===document.documentElement;
 if(document.fullscreenElement===document.documentElement){try{document.exitFullscreen?.()?.catch?.(()=>{})}catch{}}
 const p=FORBIDDEN_ROOM.safeOutside;
 if(!nav?.canWalk(...p)){setState('paused');if($('pause-description'))$('pause-description').textContent='安全な場所を確認できません。最初からやり直してください。';return}
 player[0]=p[0];player[1]=p[1];yaw=0;pitch=0;
 if(exitFullscreen){setState('paused');if($('pause-description'))$('pause-description').textContent='警告を中断して部屋の外へ戻りました。再開できます。'}
 else{setState('playing');notice('警告を中断し、部屋の外へ戻った。',4);requestMouse()}
}
function collectFloorOnApproach(){
 const {light,drink}=collectNearbyFloorItems(player,{flashlight:flashlightPickup,water,
  canCarryWater:inventory.count(ALMOND_WATER_ID)<ALMOND_WATER_MAX_STACK});
 if(light||drink){
  notice(light&&drink?'懐中電灯とアーモンドウォーターを拾った。F で点灯。':light?'懐中電灯を拾った。F で点灯・消灯。':drink.message,5);
  updateHUD();
 }
}
function collect(){
 if(state!=='playing')return;
 if(hiding && hiding.state.phase!=='idle'){interactLocker();return}
 const target=objective.target(player);
 if(target){
  if(objective.isBreaker(target.id)&&!objective.isRestored(target.id)){
   if(isJammed(target.id)&&!hasCrowbar()){jam.known=true;sound.cue('locked');notice('配電盤のカバーが歪んで開かない。こじ開ける道具が要る。',6);updateHUD();return}
   notice(isJammed(target.id)?'E を押し続けて、バールでカバーをこじ開ける。':'E を押し続けて、ブレーカーのレバーを上げる。離すと中断。',4);return}
  applyInteraction(objective.interact(player,target.id));return;
 }
 if(flashlightPickup?.nearest(player)){const result=flashlightPickup.collect(player);if(result.ok)notice('懐中電灯を拾った。F で点灯・消灯。',5);updateHUD();return}
 if(water.nearest(player)){const result=water.collect(player);notice(result.message,result.ok?5:3);updateHUD();return}
 {const box=dressing?.nearestBox(player);if(box){searchBox(box);return}}
 if(hiding?.nearest(player)){interactLocker();return}
 const observation=observations?.read(player);if(observation){notice(observation,7);updateHUD()}
}
// The cover is only jammed when the crowbar can actually be found in a box.
const isJammed=id=>id===world?.layout?.jammedBreaker&&!jam.pried&&!!dressing?.boxes.some(box=>box.contains===CROWBAR_ID);
const hasCrowbar=()=>inventory.count(CROWBAR_ID)>0;
function searchBox(box){
 if(box.contains==='water'&&inventory.count(ALMOND_WATER_ID)>=3){notice('段ボールの中に水がある。これ以上は持てない。',4);return}
 const found=dressing.search(player);if(!found.ok)return;
 if(found.contains==='crowbar'){inventory.add(CROWBAR_ID,1);notice('段ボールの中にバールがあった。歪んだカバーをこじ開けられる。',6)}
 else if(found.contains==='water'){inventory.add(ALMOND_WATER_ID,1);notice('段ボールの中にアーモンドウォーターがあった。',5)}
 else notice('段ボールの中は空だった。',3);
 updateHUD();
}
// Where the floor arrows lead: normally the objective's own suggestion, but
// once the jammed cover is known and no crowbar is carried, the box holding it.
function guidanceTarget(){
 const target=objective.guidance(player);
 if(target&&isJammed(target.id)&&jam.known&&!hasCrowbar()){const box=dressing?.find('crowbar');if(box?.stand)return {id:'crowbar-box',label:'バール（段ボールの中）',i:box.stand.i,position:box.stand.position}}
 return target;
}
function lockerObservers(){
 const hidden=hiding?.state.hidden??false;
 return [
  {id:'bacteria',position:enemy?.pos??[0,0],active:!!enemy?.active&&(!hidden||encounter?.captureReady),seesPlayer:!!enemyDirector?.canSeePlayer(player)},
  {id:'skinstealer',position:skinState?.position??[0,0],active:!!skinState&&skinState.phase!=='disabled'&&(!hidden||skinState.phase==='monster'),seesPlayer:!!skinDirector?.canSeePlayer(player)}
 ];
}
function interactLocker(){
 if(!hiding)return;
 const result=hiding.interact({position:player,observers:lockerObservers()});
 if(result.code==='entering'){qaRoute=null;operationTime=0;notice('ロッカーに入る。見られた場合は安全ではない。',4)}
 if(result.code==='entering'||result.code==='exiting'){sound.cue('locker_open');lockerCloseAt=elapsed+1.15}
 else if(result.code==='entry-cancelled'||result.code==='exit-cancelled')lockerCloseAt=null;
 else if(result.code==='exit-blocked')notice('出口が塞がれている。',3);
 else if(result.code==='entry-cancelled'||result.code==='exit-cancelled')notice('動作を中断した。',2);
 updateHUD();
}
function updateLockers(dt){
 if(!hiding)return;
 const before=hiding.state, next=hiding.update({dt,observers:lockerObservers()});
 if(before.phase==='entering'&&next.phase==='hidden'&&next.locker){yaw=next.locker.facingYaw;pitch=0}
 if(next.exitPosition){player[0]=next.exitPosition[0];player[1]=next.exitPosition[1]}
 if(next.caughtBy)beginCapture(next.caughtBy==='skinstealer'?'skinstealer':'bacteria');
 for(const item of lockerInstances){
  let open=false;
  if(next.locker?.id===item.id&&(next.phase==='entering'||next.phase==='exiting')){
   const progress=Math.max(0,Math.min(1,1-next.remaining/LOCKER_TRANSITION_SECONDS));
   open=progress<.6;
  }
  item.visual.setOpen(open);item.visual.update(dt*LOCKER_ANIMATION_SPEED);
 }
}
function presentLockerView(){
 const view=$('locker-view');if(!view?.style)return;
 const h=hiding?.state;let level=0;
 if(state==='playing'&&h&&h.phase!=='idle'){const progress=Math.max(0,Math.min(1,1-h.remaining/LOCKER_TRANSITION_SECONDS));
  level=h.phase==='hidden'?1:h.phase==='entering'?Math.max(0,Math.min(1,(progress-.45)/.3)):1-Math.max(0,Math.min(1,(progress-.25)/.3))}
 const value=level.toFixed(2);if(view.style.opacity!==value)view.style.opacity=value;
 $('hud')?.classList?.toggle('hiding',level>.4);
}
function lockerCamera(){
 const h=hiding?.state;if(!h||!h.locker||h.phase==='idle')return null;
 const eye=[player[0],nav.floorAt(...player)+1.62,player[1]],inside=h.locker.camera;
 const progress=Math.max(0,Math.min(1,1-h.remaining/LOCKER_TRANSITION_SECONDS));
 let blend=h.phase==='hidden'?1:h.phase==='entering'?Math.max(0,Math.min(1,(progress-.4)/.2)):1-Math.max(0,Math.min(1,(progress-.4)/.2));
 return eye.map((v,i)=>v+(inside[i]-v)*blend);
}
function setOutdoorDoor(open){nav?.setGateOpen?.('outdoor-door',open);sourceScene?.gates?.get('outdoor-door')?.setOpen(open)}
function applyInteraction(result){
 if(!result.handled)return;
 if(result.target?.id)discovered.add(result.target.id);
 if(result.message)notice(result.message,9);
 if(result.code==='exit-opened')setOutdoorDoor(true);
 if(result.changed&&result.target?.id!=='escape'){
  // The dead exit only rattles its latch; every other change is the door cue.
  sound.cue(result.code==='exit-unpowered'?'locked':'door');
  const region=nav.regionIds?.[nav.regionAt(...result.target.position)]??null;
  if(result.code==='exit-unpowered')horror?.notify('exit-examined',{region});
  if(result.code==='breaker-restored'||result.code==='power-restored'){
   const status=objective.state;
   breakerPanels?.set(result.target.id,{restored:true});
   horror?.notify(result.code,{region,restored:status.restoredCount??1,total:status.breakerCount??1});
  }
  encounter.notify(result.code,result.target);activateEnemy();
  // The release clunks open at the exit once the last breaker is up: whatever
  // is listening goes to that fixed place, not to the player.
  if(result.code==='power-restored'&&objective.breakers.length>1)encounter.alarm?.(objective.exit);
 }
 if(objective.state.escaped)finish(true);else updateHUD();
}
function updateOperation(dt){
 const target=objective.target(player);
 const moving=['KeyW','KeyA','KeyS','KeyD'].some(key=>keys.has(key));
 const active=!!target&&objective.isBreaker(target.id)&&!objective.isRestored(target.id)&&keys.has('KeyE')&&!moving&&!(isJammed(target.id)&&!hasCrowbar());
 if(!active||target.id!==operationTarget){
  if(operationTarget&&!objective.isRestored(operationTarget))breakerPanels?.set(operationTarget,{progress:0});
  operationTime=0;jam.progress=0;operationTarget=active?target.id:null;
  if(!active)return;
 }
 if(isJammed(target.id)){
  // The crowbar takes about a second; the lever hold begins afterwards.
  if(jam.progress===0)sound.cue('pry');
  jam.progress+=dt;
  if(jam.progress>=1.1){jam.pried=true;jam.progress=0;operationTime=0;notice('カバーが開いた。そのままレバーを上げる。',4);updateHUD()}
  return;
 }
 operationTime+=dt;breakerPanels?.set(target.id,{progress:operationTime/1.2});
 if(operationTime>=1.2){operationTime=0;operationTarget=null;applyInteraction(objective.interact(player,target.id))}
}
function showStruggle(visible){
 const box=$('struggle');if(!box)return;
 box.hidden=!visible;
 if(visible&&$('struggle-fill')){$('struggle-fill').style.width='0%';$('struggle-bar')?.setAttribute('aria-valuenow','0')}
}
function beginCapture(actor='bacteria'){
 if(invulnerable||state!=='playing'||elapsed<graceUntil)return;
 if(actor==='bacteria'){if(hazmatModel)hazmatModel.visible=false;if(skinModel)skinModel.visible=false}
 skinCaptureActor=actor;captureTime=0;qaRoute=null;sound.cue(actor==='skinstealer'?'skin_voice':'capture');
 sound.setLoop?.('chase_bgm',0,.3);
 // With an escape left the attacker holds the player face to face instead of finishing at once.
 struggle=escapesLeft>0?{time:0,gauge:0}:null;
 setState('caught');
 if(struggle)sound.setLoop?.('heartbeat',1,.25);
}
// One tap of Space/E or a click. Presses made during the lunge already count.
function struggleTap(){
 if(state!=='caught'||!struggle)return;
 struggle.gauge=Math.min(1,struggle.gauge+STRUGGLE.press);
 if(struggle.gauge>=1)struggle.complete=true;
}
function updateStruggle(dt,hold){
 if(!struggle)return;
 if(captureTime<hold)return;
 captureTime=hold;
 if(struggle.time===0)showStruggle(true);
 if(struggle.complete){breakFree();return}
 struggle.time+=dt;
 const holding=keys.has('Space')||keys.has('KeyE');
 struggle.gauge=Math.max(0,Math.min(1,struggle.gauge+(holding?STRUGGLE.holdRate:-STRUGGLE.decay)*dt));
 if($('struggle-fill')){$('struggle-fill').style.width=(struggle.gauge*100).toFixed(1)+'%';$('struggle-bar')?.setAttribute('aria-valuenow',String(Math.round(struggle.gauge*100)))}
 if(struggle.gauge>=1)breakFree();
 else if(struggle.time>=STRUGGLE.window){struggle=null;showStruggle(false)}
}
function breakFree(){
 escapesLeft--;struggle=null;showStruggle(false);
 // Shove the attacker back along the line away from the player; it reels for a moment.
 if(skinCaptureActor==='skinstealer'&&skinDirector?.release){skinState=skinDirector.release(player,STRUGGLE.shove);skinStunUntil=elapsed+STRUGGLE.stun}
 else if(enemy?.active){
  // Away from the player where there is room; otherwise whichever side lets it stagger furthest.
  const dx=enemy.pos[0]-player[0],dz=enemy.pos[1]-player[1],length=Math.hypot(dx,dz),base=length>.05?Math.atan2(dx,dz):Math.atan2(Math.sin(yaw),-Math.cos(yaw));
  let best=null,bestMoved=-1;
  for(const turn of [0,.7,-.7,1.5,-1.5,Math.PI]){const trial=[...enemy.pos];nav.move(trial,Math.sin(base+turn)*STRUGGLE.shove,Math.cos(base+turn)*STRUGGLE.shove);const moved=Math.hypot(trial[0]-player[0],trial[1]-player[1]);if(moved>bestMoved+.2){best=trial;bestMoved=moved}}
  if(best){enemy.pos[0]=best[0];enemy.pos[1]=best[1]}
  enemyStunUntil=elapsed+STRUGGLE.stun}
 graceUntil=elapsed+STRUGGLE.grace;aftermath=1;stamina=Math.max(stamina,70);sprintReady=true;captureTime=0;
 bacteria.foreground=false;if(skinModel)skinModel.foreground=false;
 $('danger').style.backgroundColor='transparent';$('danger').style.boxShadow='';$('danger').style.opacity=0;
 camera.pitch=pitch;camera.yaw=yaw;
 setState('playing');requestMouse();
 notice(escapesLeft>0?`振りほどいた！ 逃げろ。振りほどけるのはあと ${escapesLeft} 回。`:'振りほどいた！ もう次は振りほどけない。逃げろ。',5);
 updateHUD();
}

function finish(won,cause='bacteria'){
 if(!won){
  if(state==='death-transition'||state==='lost')return;
  if(invulnerable){recoverInvulnerable(cause);return;}
  pendingDeath=cause;qaRoute=null;setState('death-transition');
  if(deathSequence){deathSequence.reset();deathSequence.start()}else completeDeath();
  return;
 }
 // Let the open field bleach out before the result appears.
 if(state==='ending'||state==='won')return;
 endingTime=0;qaRoute=null;setState('ending');
}
function completeEscape(){
 if(state!=='ending')return;
 setState('won');
 const status=objective.state,total=status.breakerCount??1;
 $('result-tag').textContent='ESCAPED / LEVEL 0';
 $('result-title').textContent='外へ出た。';
 $('result-text').textContent='蛍光灯の唸りが、背中のほうで小さくなっていく。草地の先の暗い場所まで、自分の足で歩いた。';
 $('result-stats').textContent=`ESCAPED / ${formatTime(elapsed)}`;
 if($('result-detail'))$('result-detail').textContent=`ブレーカー ${total} / ${total}　・　拾った水 ${water?.pickups.filter(p=>p.collected).length??0} 本`;
 $('result').style.background='#06120b70';$('result').style.backdropFilter='blur(1px)';
 if(!usedInvulnerability)try{let key='backrooms-wide-world-best-'+difficulty,prev=+localStorage.getItem(key)||Infinity;if(elapsed<prev)localStorage.setItem(key,elapsed.toFixed(2));$('result-stats').textContent+=`　BEST ${formatTime(Math.min(prev,elapsed))}`}catch{}
}
function completeDeath(){
 if(state!=='death-transition')return;
 setState('lost');
 $('result-tag').textContent=pendingDeath==='fall'?'FALL / LOST':pendingDeath==='infection'?'SIGNAL / LOST':'CONTACT LOST';
 $('result-title').textContent=pendingDeath==='fall'?'奈落に落ちた。':pendingDeath==='skinstealer'?'逃げ切れなかった。':pendingDeath==='infection'?'警告に包まれた。':'捕まってしまった。';
 $('result-text').textContent=pendingDeath==='fall'?'床の窪みへ踏み出すと、暗闇に落ちていく。':pendingDeath==='skinstealer'?'防護服の人物は、もう人ではなかった。':pendingDeath==='infection'?'入るなと書かれた部屋で、画面が暗くなった。':'走る音は敵に届く。角を曲がり、視線を切って逃げよう。';
 $('result-stats').textContent=`${pendingDeath==='fall'?'FALLEN':'CAUGHT'} / ${formatTime(elapsed)}`;
 if($('result-detail'))$('result-detail').textContent='もう一度最初から挑戦できます';
 $('result').style.background='#000';$('result').style.backdropFilter='none';
}

function targetObjective(){return guidanceTarget()}
// The earlier optional marked return route is retired: after the last breaker
// the listener goes to the exit itself, so the way back is the player's choice.
function currentRouteHint(){return null}
function updateReturnHint(){}

function updateHUD(){
 if(!nav||!objective)return;
 if($('water-count'))$('water-count').textContent=`水 ×${inventory.count(ALMOND_WATER_ID)} / 選択して Q で体力+${ALMOND_WATER_RESTORE}`;
 const status=objective.state,near=objective.target(player),pickup=water?.nearest(player),total=status.breakerCount??1,restored=status.restoredCount??(status.powerRestored?1:0);
 $('count').textContent=status.doorOpened?'EXIT / OPEN':status.powerRestored?'EXIT / 通電':total>1?`配電盤 ${restored} / ${total}`:status.doorExamined?'EXIT / 電源遮断':'EXIT / 場所不明';
 $('timer').textContent=formatTime(elapsed);$('lamp').textContent='LIGHT / '+(!flashlightPickup?.state.owned?'未取得':flash?'ON':'OFF');
 if($('escapes'))$('escapes').textContent=difficulty==='explore'?'':'振りほどき '+'●'.repeat(escapesLeft)+'○'.repeat(STRUGGLE.escapes-escapesLeft);
 $('stamina-fill').style.width=stamina+'%';$('stamina-fill').parentElement?.setAttribute('aria-valuenow',String(Math.round(stamina)));
 $('stamina-fill').style.background=stamina<25?'#d8a478':'#e1d68f';
 $('phase').textContent=status.doorOpened?'草地の先に、暗い場所が見える。':horror?.darkRegions.length?'どこかの区画で、照明が落ちている。':'濡れたカーペット。止まらない蛍光灯。';
 {const text=objective.status();if($('objective-label').textContent!==text){$('objective-label').textContent=text;objectiveShownAt=elapsed}$('objective')?.classList?.toggle('quiet',elapsed-objectiveShownAt>16)}
 $('bearing').textContent=status.doorOpened?'草地の先にある暗い場所へ歩いて進む。':status.powerRestored?'床の矢印が出口まで続いている。':status.doorExamined||restored?'床の矢印が、いちばん近い配電盤へ続いている。':'床の矢印をたどって出口へ。';
 const observation=observations?.nearest(player);
 let prompt=near?.prompt||(pickup?(inventory.count(ALMOND_WATER_ID)>=ALMOND_WATER_MAX_STACK?'アーモンドウォーターは満杯':'アーモンドウォーターに近づく / [ E ] で拾う'):observation?'[ E ] 周囲を確かめる':'');
 if(near&&objective.isBreaker(near.id)&&!objective.isRestored(near.id))prompt=isJammed(near.id)?(!hasCrowbar()?'[ E ] 配電盤のカバーを調べる':jam.progress>0?`[ E ] バールでこじ開けている… ${Math.min(100,Math.round(jam.progress/1.1*100))}%`:'[ E 長押し ] バールでカバーをこじ開ける'):operationTime>0?`[ E ] ブレーカーを上げている… ${Math.min(100,Math.round(operationTime/1.2*100))}%`:'[ E 長押し ] ブレーカーを上げる';
 if(!prompt&&!near&&!pickup&&dressing?.nearestBox(player))prompt='[ E ] 段ボールを調べる';
 if(jam.known&&!jam.pried&&!hasCrowbar())$('bearing').textContent='歪んだカバーをこじ開ける道具が要る。床の矢印が、段ボールへ続いている。';
 const lockerState=hiding?.state;
 if(lockerState?.phase==='hidden')prompt='[ E ] ロッカーから出る';
 else if(lockerState?.movementLocked)prompt='[ E ] 動作を中断';
 else if(!near&&flashlightPickup?.nearest(player))prompt='懐中電灯に近づく / [ E ] で拾う';
 else if(!near&&!pickup&&hiding?.nearest(player))prompt='[ E ] ロッカーに隠れる';
 if($('interaction').dataset)$('interaction').dataset.kind=near?(objective.isBreaker(near.id)?'breaker':near.id):(pickup?'pickup':'');
 $('interaction').textContent=prompt;$('interaction').style.display=prompt?'block':'none';
 if($('threat-label')){const d=enemy?.active?Math.hypot(player[0]-enemy.pos[0],player[1]-enemy.pos[1]):Infinity;$('threat-label').textContent=d<11&&enemy.mode==='chase'?'見つかった — 角を曲がるか、ロッカーへ':''}
 if($('journal-note')){
  $('journal-note').textContent=status.doorOpened?'解錠回路が作動した。開いた扉を通り、外へ出る。':status.powerRestored?'すべてのブレーカーを上げた。扉の解錠回路に通電している。':status.doorExamined||restored?`扉の注意書き：「停電時は ${total} か所の配電盤でブレーカーを上げること。」 復旧 ${restored} / ${total}。`:'歩いて確かめた場所だけの探索記録。見える通路を少しずつ覚える。';
  if(exploration?.suppliesNote)$('journal-note').textContent+=' '+exploration.suppliesNote;
  if(observations?.last)$('journal-note').textContent+=' '+observations.last.text;
 }
}

function updateEnemy(dt,running){
 if(!enemy.active)return;
 const locker=hiding?.state, witnessTarget=locker?.hidden?locker.witnesses.find(w=>w.id==='bacteria')?.position:null;
 const result=encounter.update({dt,player,running,hidden:!!locker?.hidden,witnessTarget,speeds:settings[difficulty]});
 if(result.alert||result.firstAlert)sound.cue('alert');
 if(result.firstAlert)notice('何かがこちらに気づいた。角を曲がり、距離を取ろう。',3);
 if(result.caught)beginCapture();
}
function activateEnemy(){
 if(glimpse.phase==='visible')return;
 if(encounter.stage(player,elapsed,difficulty)){bacteria.visible=true;animator?.reset()}
}
// Animation, effects and GPU work run once per displayed frame, not once per physics step.
function presentEnemy(dt,before){
 if(!enemy?.active||state!=='playing')return;
 let d=Math.hypot(player[0]-enemy.pos[0],player[1]-enemy.pos[1]),s=settings[difficulty];
 bacteria.matrix=M.pose(enemy.pos[0],nav.floorAt(...enemy.pos)+.05,enemy.pos[1],enemy.yaw,.43);
 let animation=animator?.update(dt,{speed:Math.hypot(enemy.pos[0]-before[0],enemy.pos[1]-before[1])/Math.max(dt,.001),mode:enemy.mode==='chase'&&d<2?'lunge':enemy.mode,distance:d,facingYaw:enemy.yaw,targetYaw:enemy.seesPlayer?Math.atan2(player[0]-enemy.pos[0],player[1]-enemy.pos[1]):enemy.yaw});
 if(animation?.footstep)sound.enemyStep({distance:d,pan:Math.sin(Math.atan2(enemy.pos[0]-player[0],-(enemy.pos[1]-player[1]))-yaw),chase:enemy.mode==='chase'});
 if(!pipeline){let threat=Math.max(0,1-d/13);$('danger').style.opacity=(threat*.43).toFixed(2)}
}

// Position each authored actor using its own source bounds, without altering
// the downloaded model or sharing its mutable skinning buffers with Bacteria.
function actorMatrix(model,position,floor,yaw,height,vertical=1){
 const min=model?.min,max=model?.max;
 if(!min||!max||max[1]<=min[1])throw Error('Actor bounds unavailable');
 const scale=height/(max[1]-min[1]),centre=[(min[0]+max[0])/2,min[1],(min[2]+max[2])/2];
 // Preserve the footprint and floor anchor while the suit crumples; never
 // scale X/Z or change the source geometry and skin buffers.
 const squash=Math.max(.65,Math.min(1,Number.isFinite(vertical)?vertical:1));
 return M.mul(M.mul(M.pose(position[0],floor,position[1],yaw,scale),M.trs([0,0,0],[0,0,0,1],[1,squash,1])),M.trs(centre.map(v=>-v)));
}
function presentSkinstealer(dt){
 if(!skinState||!hazmatModel||!skinModel)return;
 const phase=skinState.phase,d=Math.hypot(player[0]-skinState.position[0],player[1]-skinState.position[1]);
 // The current renderer has no transparency blending: the person visibly
 // collapses, then the existing monster geometry replaces it near the end.
 const human=phase==='human'||phase==='transforming'&&skinState.collapse<.82;
 const monster=phase==='grace'||phase==='monster'||phase==='transforming'&&skinState.collapse>=.82;
 hazmatModel.visible=human;skinModel.visible=monster;
 const floor=nav.floorAt(...skinState.position);
 if(human){const squash=phase==='transforming'?1-.12*skinState.collapse:1;hazmatModel.matrix=actorMatrix(hazmatModel,skinState.position,floor,skinState.yaw,1.8,squash);if(d<30)hazmatAnimator?.update(dt,{speed:skinState.movementSpeed,mode:phase==='transforming'?'collapse':'patrol',collapse:skinState.collapse})}
 if(monster){skinModel.matrix=actorMatrix(skinModel,skinState.position,floor,skinState.yaw,2.05);if(d<30)skinAnimator?.update(dt,{speed:skinState.movementSpeed,mode:skinState.mode,collapse:0})}
 if((human||monster)&&d<25&&skinState.movementSpeed>.15){skinFootDistance+=skinState.movementSpeed*dt;if(skinFootDistance>=1.45){skinFootDistance%=1.45;sound.enemyStep({distance:d,pan:Math.sin(Math.atan2(skinState.position[0]-player[0],-(skinState.position[1]-player[1]))-yaw),chase:phase==='monster'&&skinState.mode==='chase'})}}
}

function drawMap(){exploration?.draw($('map'),player,yaw)}
function revealSurroundings(){exploration?.requestReveal(player)}

// Guidance is drawn in the world (guidance.js): chevrons on the floor along the
// walkable route plus a beacon at the objective, and one compass chip in the HUD.
const COMPASS_LABELS={exit:'出口',escape:'外へ',maintenance:'中央系統の配電盤'};
function initializeMarkers(){
 const root=$('field-markers');if(!root)return;
 for(let i=0;i<2;i++){const el=document.createElement('div');el.className='field-marker';el.hidden=true;root.append(el);markerElements.push(el)}
}
function screenPoint(position,height){
 return projectToScreen(renderer?.viewProjection,[position[0],height,position[1]],canvas.clientWidth||1280,canvas.clientHeight||720);
}
function setCompass(target,info){
 const chip=$('compass');if(!chip)return;
 if(!target||!info){chip.hidden=true;return}
 chip.hidden=false;
 const kind=target.id==='exit'?'exit':target.id==='escape'?'escape':target.id==='crowbar-box'?'item':'breaker';
 if(chip.dataset)chip.dataset.kind=kind;
 const label=COMPASS_LABELS[target.id]??target.label??'配電盤',metres=info.distance===null?'':`${Math.max(1,Math.round(info.distance))} m`;
 if($('compass-label').textContent!==label)$('compass-label').textContent=label;
 if($('compass-distance').textContent!==metres)$('compass-distance').textContent=metres;
 const bearing=info.aim?relativeBearing(player,yaw,info.aim):0;
 $('compass-arrow').style.transform=`rotate(${bearing.toFixed(3)}rad)`;
}
function glow(position,height,size,color,alpha){
 const rx=Math.cos(camera.yaw)*size,rz=Math.sin(camera.yaw)*size;
 return {kind:2,center:[position[0],height,position[1]],u:[rx,0,rz],v:[0,size,0],color:[color[0],color[1],color[2],alpha],additive:1};
}
function presentGuidance(now){
 overlayItems=[];
 if(state!=='playing'||!guidance||!objective){setCompass(null);if($('waypoint'))$('waypoint').hidden=true;for(const el of markerElements)el.hidden=true;return}
 const target=guidanceTarget(),locked=!!hiding?.state.movementLocked;
 const kind=!target?null:target.id==='exit'?'exit':target.id==='escape'?'escape':target.id==='crowbar-box'?'item':'breaker';
 guideInfo=guidance.update({player,target,kind,time:now/1000,camera,enabled:!!target&&!locked});
 overlayItems.push(...guideInfo.items);
 setCompass(locked?null:target,guideInfo);
 {const mark=$('waypoint');if(mark?.style){let at=null;
   if(target&&!locked){const d=Math.hypot(target.position[0]-player[0],target.position[1]-player[1]);
    if(d>2.5&&d<34&&nav.visible(player,target.position)){const p=screenPoint(target.position,nav.floorAt(...target.position)+2.05),w=canvas.clientWidth||1280,h=canvas.clientHeight||720;if(p&&p.x>w*.06&&p.x<w*.94&&p.y>h*.12&&p.y<h*.82)at=p}}
   mark.hidden=!at;if(at){mark.style.left=at.x+'px';mark.style.top=at.y+'px';mark.style.setProperty?.('--waypoint',kind==='breaker'?'#ffc467':kind==='escape'?'#a8e9ff':'#74f2a4')}}}
 // Small pickups carry a faint light so they read against the carpet.
 for(const pickup of water?.pickups??[]){
  if(pickup.collected)continue;
  const d=Math.hypot(pickup.position[0]-player[0],pickup.position[1]-player[1]);
  if(d<14)overlayItems.push(glow(pickup.position,nav.floorAt(...pickup.position)+.22,.34,[.92,.86,.62],.3*Math.min(1,(14-d)/4)));
 }
 const labels=[];
 if(flashlightPickup&&!flashlightPickup.state.owned){
  const p=flashlightPickup.state.position,d=Math.hypot(p[0]-player[0],p[1]-player[1]),floor=flashlightPickup.state.floor;
  if(d<16){overlayItems.push(glow(p,floor+.16,.5,[1,.93,.7],.55),{kind:1,center:[p[0],floor+.03,p[1]],u:[.5,0,0],v:[0,0,.5],color:[1,.93,.7,.7],additive:.9,phase:(now/1000*.6)%1})}
  if(d<7&&nav.visible(player,p)){const at=screenPoint(p,floor+.42),w=canvas.clientWidth||1280,h=canvas.clientHeight||720;if(at&&at.x>w*.1&&at.x<w*.9&&at.y>h*.16&&at.y<h*.8)labels.push({...at,text:'懐中電灯 / 近づくと拾える'})}
 }
 markerElements.forEach((el,i)=>{const item=labels[i];el.hidden=!item;if(!item)return;if(el.textContent!==item.text)el.textContent=item.text;el.className='field-marker supply equipment';el.style.left=item.x+'px';el.style.top=item.y+'px'});
}
function updateShadowIntro(dt){
 if(!bacteriaShadow||shadowIntro.phase==='done')return;
 if(enemy?.active||difficulty==='explore'||glimpse.phase==='visible'){bacteriaShadow.visible=false;if(shadowIntro.phase==='running')shadowIntro.phase='done';return}
 const zone=SHADOW_INTRO.zone;
 if(shadowIntro.phase==='waiting'){
  // Only when the player walks east down the corridor, looking roughly that way.
  if(player[0]<zone.minX||player[0]>zone.maxX||player[1]<zone.minZ||player[1]>zone.maxZ||Math.abs(relativeBearing(player,yaw,[6.6,-22.4]))>.6)return;
  shadowIntro={phase:'running',time:0};animator?.reset();
 }
 shadowIntro.time+=dt;
 const t=Math.min(1,shadowIntro.time/SHADOW_INTRO.seconds),z=SHADOW_INTRO.from+(SHADOW_INTRO.to-SHADOW_INTRO.from)*t,w=SHADOW_INTRO.wallX,sy=SHADOW_INTRO.drop;
 // Parallel light along +X onto the plane x = w (column-major, affine).
 const project=[0,-sy,0,0, 0,1,0,0, 0,0,1,0, w,sy*w,0,1];
 bacteriaShadow.matrix=M.mul(project,M.pose(SHADOW_INTRO.casterX,nav.floorAt(0,-22.4)+.05,z,Math.PI,.43));
 bacteriaShadow.visible=true;
 animator?.update(dt,{speed:.8,mode:'patrol',distance:14,facingYaw:Math.PI,targetYaw:Math.PI});
 if(t>=1||player[0]>SHADOW_INTRO.vanishX){
  // The lights sag; when they recover the wall is bare.
  horror?.sag(['vr'],.16,.5);sound.fluorescentDrop(.6);
  bacteriaShadow.visible=false;shadowIntro.phase='done';animator?.reset();
 }
}
// Standing near an open pit darkens the picture; the first time, a stone goes over the edge.
function updatePitWarning(dt){
 let wanted=0;
 if(stage?.id==='baked'&&state==='playing'){
  let nearest=Infinity;
  for(const [minX,maxX,minZ,maxZ] of BAKED_PITS){const dx=Math.max(minX-player[0],0,player[0]-maxX),dz=Math.max(minZ-player[1],0,player[1]-maxZ);nearest=Math.min(nearest,Math.hypot(dx,dz))}
  wanted=Math.max(0,Math.min(1,(1.9-nearest)/1.4));
  if(wanted>.25&&elapsed-pitNoticeAt>25){pitNoticeAt=elapsed;notice('足元の床が抜けている。縁に寄ると落ちる。',5);sound.cue('bust_fall',{scale:.3,pan:0})}
 }
 pitDread+=(wanted-pitDread)*(1-Math.exp(-dt*4));
}
const CUE_SOUNDS={bang:'alert',door:'door',latch:'locked'};
function playCue(cue){
 if(cue.type==='hum-drop')sound.fluorescentDrop(cue.duration);
 else if(cue.type==='steps'){for(let i=0;i<cue.count;i++)phantomSteps.push({at:elapsed+i*cue.interval,volume:cue.volume*(1-i*.1),pan:cue.pan})}
 else if(CUE_SOUNDS[cue.type])sound.play?.(CUE_SOUNDS[cue.type],{volume:cue.volume,pan:cue.pan});
}
// Apply the director's light levels to the room models and return the picture
// treatment for this frame. Rooms without a level (the open field) stay at 1.
function presentAtmosphere(dt,now){
 if(!horror||!nav)return {light:1,post:{},torch:1};
 const playing=state==='playing',regionId=nav.regionIds?.[nav.regionAt(...player)]??null;
 const bacteriaDistance=enemy?.active?Math.hypot(player[0]-enemy.pos[0],player[1]-enemy.pos[1]):Infinity;
 const monster=skinState&&(skinState.phase==='transforming'||skinState.phase==='grace'||skinState.phase==='monster');
 const skinDistance=monster?Math.hypot(player[0]-skinState.position[0],player[1]-skinState.position[1]):Infinity;
 const chasing=playing&&(!!enemy?.active&&enemy.mode==='chase'||skinState?.phase==='monster'&&skinState.mode==='chase');
 const frame=horror.update({dt:playing||state==='caught'?dt:0,region:regionId,indoors:regionId!=='dreamcore',enemyDistance:Math.min(bacteriaDistance,skinDistance),chasing,calm:playing&&!hiding?.state.hidden,motion});
 for(const {model} of stageObjects)model.light=frame.regionLight.get(model.instanceId)??1;
 for(const model of doorFrames)model.light=frame.regionLight.get(model.regionId)??1;
 for(const model of breakerPanels?.models??[])model.light=frame.regionLight.get(model.regionId)??1;
 for(const model of dressing?.models??[])model.light=frame.regionLight.get(model.regionId)??1;
 if(playing)for(const cue of frame.cues)playCue(cue);
 while(phantomSteps.length&&phantomSteps[0].at<=elapsed){const step=phantomSteps.shift();if(playing)sound.play?.('enemy_step',{volume:step.volume,pan:step.pan})}
 let post=state==='caught'?{...frame.post,fear:.85,aberration:.011,distort:motion?.12:.05,grain:.11}:frame.post;
 if(pitDread>.01)post={...post,vignette:Math.min(.95,post.vignette+.35*pitDread),desaturate:Math.min(.7,post.desaturate+.3*pitDread)};
 if(aftermath>0&&state==='playing')post={...post,desaturate:Math.min(.6,post.desaturate+.3*aftermath),vignette:Math.min(.9,post.vignette+.22*aftermath),aberration:post.aberration+.003*aftermath,fear:Math.max(post.fear,.22*aftermath)};
 // The torch falters with the room lights when something is close.
 const torch=1-frame.dread*.38*(.5+.5*Math.sin(now*.006));
 return {light:frame.light*(1-.3*pitDread),post,torch};
}

function routeQA(point){
 if(state!=='playing'||!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||!nav.canWalk(...point))return false;
 const route=nav.path(nav.nearest(...player),nav.nearest(...point));if(!route.length)return false;
 qaAutomatic=false;qaRoute=route.slice(1);qaMessage='';return true;
}
function simulateQA(dt){
 if(!qaRoute)return false;
 if(!qaRoute.length){
  if(!qaAutomatic){qaRoute=null;return true}
  const near=objective.target(player);
  if(near&&objective.isBreaker(near.id)&&!objective.isRestored(near.id)&&!(isJammed(near.id)&&!hasCrowbar())){keys.add('KeyE');return true}
  keys.delete('KeyE');collect();if(state!=='playing')return true;
  const next=currentRouteHint()??targetObjective();qaRoute=nav.path(nav.nearest(...player),next.i).slice(1);
  if(!qaRoute.length){qaMessage='QA route could not advance';qaRoute=null}return true;
 }
 let p=nav.point(qaRoute[0]),dx=p[0]-player[0],dz=p[1]-player[1],d=Math.hypot(dx,dz);yaw=Math.atan2(dx,-dz);
 if(d<.035){qaRoute.shift();return true}
 let n=Math.min(d,8*dt),before=[...player];nav.move(player,dx/d*n,dz/d*n);
 if(Math.hypot(player[0]-before[0],player[1]-before[1])<.00001){qaMessage='QA collision blocked route';qaRoute=null}return true;
}
// One presentation path for every state. The pipeline adds anti-aliasing,
// blended overlays and the finishing pass; without it the renderer draws
// straight to the canvas exactly as before.
function drawFrame(scene,options,post={}){
 const target=pipeline?.configure({quality,scale:renderScale,maxRatio:outputRatioLimit});
 if(target){renderer.render(scene,camera,{...options,target,cull:true});pipeline.drawOverlays(overlayItems,camera);pipeline.present(post)}
 else renderer.render(scene,camera,{...options,quality,renderScale});
}
function tick(now){
 let raw=Math.max(0,(now-last)/1000),dt=Math.min(raw,1);last=now;
 try{
  renderScale=adaptiveResolution.sample(raw,state==='playing'&&!document.hidden);
  if(state==='playing'){
   const initialEnemy=enemy,enemyStart=[...enemy.pos];
   let remaining=dt,moving=false,running=false,stepSound=false;
   // At most 20 substeps even after a long frame. Check contact after every step.
   while(remaining>1e-9&&state==='playing'){
    let step=Math.min(remaining,.05);remaining-=step;elapsed+=step;
    updateLockers(step);if(state!=='playing')break;
    const locker=hiding?.state;
    if(locker?.phase==='entering'&&locker.locker){
     const target=locker.locker.approach,dx=target[0]-player[0],dz=target[1]-player[1],d=Math.hypot(dx,dz),move=Math.min(d,2.4*step);
     if(d>1e-6)nav.move(player,dx/d*move,dz/d*move);
    }
    if(!invulnerable&&!locker?.hidden&&enemy?.active&&encounter.captureReady&&Math.hypot(player[0]-enemy.pos[0],player[1]-enemy.pos[1])<ENEMY_BEHAVIOR.captureRange&&nav.visible(player,enemy.pos)){beginCapture();break}
    let s=settings[difficulty],stepMoving=false,stepRunning=false;const beforePlayer=[...player];
    if(locker?.movementLocked||!simulateQA(step)){
     const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
     const right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
     const intent=[Math.sin(yaw)*forward+Math.cos(yaw)*right,-Math.cos(yaw)*forward+Math.sin(yaw)*right];
     const viewKeys=locker?.movementLocked?new Set([...keys].filter(k=>k.startsWith('Arrow'))):keys;
     const movement=advancePlayer({nav,position:player,keys:viewKeys,yaw,pitch,dt:step,speeds:s,stamina,staminaDelay,sprintReady,footClock});
     ({yaw,pitch,stamina,staminaDelay,sprintReady,footClock}=movement);
     if(locker?.hidden&&locker.locker){const d=Math.atan2(Math.sin(yaw-locker.locker.facingYaw),Math.cos(yaw-locker.locker.facingYaw));yaw=locker.locker.facingYaw+Math.max(-.28,Math.min(.28,d));pitch=Math.max(-.10,Math.min(.10,pitch))}
     const fallTarget=locker?.movementLocked?null:bakedFallTarget({position:player,intent,inBaked:stage?.id==='baked',floorHeight:nav.floorAt(...player)});
     if(fallTarget){fall={time:0,startEye:[player[0],nav.floorAt(...player)+1.62,player[1]],target:fallTarget,yaw,pitch};qaRoute=null;setState('falling');break}
     stepMoving=movement.moving;stepRunning=movement.running;stepSound||=movement.footstep;
    }
    bustPyramid?.update(step,beforePlayer,player);
    if(enteredForbiddenRoom(beforePlayer,player)){beginWarningRoom();break}
    moving||=stepMoving;running||=stepRunning;
    if(!enemy.active&&difficulty!=='explore')activateEnemy();
    const area=nav.regionAt(...player);if(area!==stageIndex)setArea(area);
    if(elapsed>=enemyStunUntil)updateEnemy(step,stepRunning);
    if(state==='playing'&&skinDirector){
     const previous=skinState?.phase,nearBacteria=enemy.active&&Math.hypot(player[0]-enemy.pos[0],player[1]-enemy.pos[1])<10;
     const witnessTarget=locker?.hidden?locker.witnesses.find(w=>w.id==='skinstealer')?.position:null;
     if(elapsed>=skinStunUntil)skinState=skinDirector.update({dt:step,player,running:stepRunning,hidden:!!locker?.hidden,witnessTarget,canCapture:!invulnerable,mayNotice:!nearBacteria||!!witnessTarget});
     if(previous==='human'&&skinState.phase==='transforming'){sound.cue('transform');notice('防護服の人物が、こちらに気づいた。逃げろ。',3)}
     if(skinState.caught)beginCapture('skinstealer');
    }
    if(state==='playing'&&!locker?.movementLocked){collectFloorOnApproach();updateOperation(step);updateReturnHint();const arrival=objective.update(player);if(arrival)applyInteraction(arrival)}
   }
   if(state==='playing'){
    if(stepSound)sound.step({running});
    camera.eye=lockerCamera()??[player[0],nav.floorAt(...player)+1.62+(motion&&moving?Math.sin(elapsed*(running?13:9))*.035:0),player[1]];camera.yaw=yaw;camera.pitch=pitch;camera.fov+=( (running?80:74)-camera.fov )*(1-Math.exp(-7*dt));
    const sight=glimpse.update({dt,nav,player,yaw,pitch,allowed:!hiding?.state.movementLocked&&!enemy.active&&difficulty!=='explore'&&stage?.id!=='dreamcore'&&stage?.id!=='baked'&&shadowIntro.phase!=='running'&&(shadowIntro.phase==='done'||elapsed>40)});
    if(sight.event==='start'){bacteria.visible=true;animator?.reset();sound.fluorescentDrop(.38)}
    if(sight.phase==='visible'&&sight.candidate){const p=sight.candidate.position;bacteria.foreground=false;bacteria.matrix=M.pose(p[0],nav.floorAt(...p)+.05,p[1],sight.candidate.yaw,.43);animator?.update(dt,{speed:0,mode:'patrol',distance:sight.candidate.distance,facingYaw:sight.candidate.yaw,targetYaw:sight.candidate.yaw})}
    if(sight.event==='end'&&!enemy.active){bacteria.visible=false;animator?.reset()}
    presentEnemy(dt,enemy===initialEnemy?enemyStart:enemy.pos);
    presentSkinstealer(dt);
    updateShadowIntro(dt);updatePitWarning(dt);
    watchers?.update({dt,player,yaw,allowFollow:!hiding?.state.movementLocked&&enemy?.mode!=='chase'&&stage?.id!=='baked'&&stage?.id!=='dreamcore'});
    explorationClock+=dt;if(explorationClock>=.4){revealSurroundings();explorationClock=0}exploration?.advanceReveal();
    hudClock+=dt;if(hudClock>=.1){updateHUD();hudClock=0;$('hud')?.classList?.toggle('settled',elapsed>55)}if(now>noticeUntil)$('message').textContent=qaMessage||'';if(!$('map-wrap').hidden&&hudClock===0)drawMap();
    {const pursued=!!enemy?.active&&enemy.mode==='chase'||skinState?.phase==='monster'&&skinState.mode==='chase';
     sound.setLoop?.('chase_bgm',pursued?1:0,pursued?.6:3);
     aftermath=Math.max(0,aftermath-dt/STRUGGLE.aftermath);sound.setLoop?.('heartbeat',aftermath>0?.25+.55*aftermath:0,1.2);
     if(lockerCloseAt!==null&&elapsed>=lockerCloseAt){lockerCloseAt=null;sound.cue('locker_close')}
     if(bustPyramid?.energy){const energy=bustPyramid.energy();bustCooldown=Math.max(0,bustCooldown-dt);
      if(energy>1.1&&!bustLoud&&bustCooldown===0){const p=bustPyramid.snapshot?.().position??player,d=Math.hypot(p[0]-player[0],p[1]-player[1]);
       if(d<32)sound.cue('bust_fall',{scale:Math.max(.2,1.1-d/30),pan:Math.sin(Math.atan2(p[0]-player[0],-(p[1]-player[1]))-yaw)});bustLoud=true;bustCooldown=1.4}
      else if(energy<.35)bustLoud=false}}
    sound.setVolume(+$('volume').value/100);let ed=enemy?.active?Math.hypot(player[0]-enemy.pos[0],player[1]-enemy.pos[1]):100;
    sound.update({dt,threat:Math.max(0,1-ed/13),chase:enemy?.mode==='chase',stamina,moving,running,enemyDistance:ed,enemyPan:enemy?.active?Math.sin(Math.atan2(enemy.pos[0]-player[0],-(enemy.pos[1]-player[1]))-yaw):0,phase:stageIndex})
   }
  }
  if(state==='ending'){endingTime+=dt;if(endingTime>=3)completeEscape()}
  if(state==='warning')infectionSequence?.update(dt);
  if(state==='death-transition')deathSequence?.update(dt);
  if(state==='awakening'&&awakening){const shot=awakening.update(dt,nav.floorAt(...player));if(shot){camera.eye=[player[0],shot.height,player[1]];camera.yaw=yaw;camera.pitch=shot.pitch}}
  if(state==='falling'&&fall){
   fall.time+=dt;const shot=fallFrame(fall);camera.eye=shot.eye;camera.yaw=shot.yaw;camera.pitch=shot.pitch;
   $('danger').style.backgroundColor=`rgba(0,0,0,${shot.blackout})`;$('danger').style.boxShadow='none';$('danger').style.opacity=String(shot.blackout);
   if(shot.done){fall=null;finish(false,'fall')}
  }
  if(state==='caught'){
   captureTime+=dt;updateStruggle(dt,skinCaptureActor==='skinstealer'?.95:1.0);
   if(state==='caught'&&skinCaptureActor==='skinstealer'&&skinModel&&skinState){
    const dx=skinState.position[0]-player[0],dz=skinState.position[1]-player[1],target=Math.atan2(dx,-dz),delta=Math.atan2(Math.sin(target-camera.yaw),Math.cos(target-camera.yaw));camera.yaw+=delta*Math.min(1,dt*9);
    const distance=Math.max(.55,1.6-captureTime*.65),p=[camera.eye[0]+Math.sin(camera.yaw)*distance,camera.eye[2]-Math.cos(camera.yaw)*distance];
    hazmatModel.visible=false;skinModel.visible=true;bacteria.visible=false;
    // The actor's source front is +Z, whereas the camera looks along -Z.
    // Negative camera yaw points that source front toward the viewer.
    skinModel.matrix=actorMatrix(skinModel,p,nav.floorAt(...player),-camera.yaw,2.05);skinAnimator?.update(dt,{speed:0,mode:'chase',collapse:0});
    const blackout=Math.max(0,Math.min(1,(captureTime-1.05)/.65));$('danger').style.backgroundColor=`rgba(0,0,0,${blackout})`;$('danger').style.boxShadow='none';$('danger').style.opacity=String(blackout);
    if(captureTime>=1.8)finish(false,'skinstealer');
   }else if(state==='caught'){
    let dx=enemy.pos[0]-player[0],dz=enemy.pos[1]-player[1],target=Math.atan2(dx,-dz),delta=Math.atan2(Math.sin(target-camera.yaw),Math.cos(target-camera.yaw));camera.yaw+=delta*Math.min(1,dt*9);
    let distance=captureDistance(captureTime);animator?.update(dt,{speed:0,mode:'lunge',distance,facingYaw:camera.yaw+Math.PI,targetYaw:camera.yaw+Math.PI});
    let shot=captureFrame({elapsed:captureTime,eye:camera.eye,cameraYaw:camera.yaw,floorHeight:nav.floorAt(...player),headCenter:posedHeadCenter(animator),motion});camera.pitch=shot.pitch;bacteria.matrix=shot.matrix;
    let blackout=shot.blackout;$('danger').style.backgroundColor=`rgba(0,0,0,${blackout})`;$('danger').style.boxShadow=blackout>=.99?'none':'';$('danger').style.opacity=String(blackout>0?.48+.52*blackout:(motion?.55+.25*Math.sin(captureTime*20):.48));
    if(captureTime>=CAPTURE_DURATION)finish(false);
   }
  }
  // The opaque intro covers the canvas. Leave the frame clock running, but
  // free the GPU for video playback until the intro hands off to awakening/play.
  if(titlePixelRatio!==window.devicePixelRatio){titlePixelRatio=window.devicePixelRatio;titleFrameDirty=true}
  if(renderer&&!renderingUnavailable&&state!=='intro'){if(state==='menu'||state==='loading'){
   // Keep the actual room as a still backdrop, leaving the GPU to the title
   // player. Refresh when its size, pixel density or visible state changes.
   if(titleFrameDirty&&stageObjects.length){
    const p=world?.nav?world.nav.point(world.nav.start):[.3,1.3];camera.eye=[p[0],(world?.nav.floorAt(...p)??0)+1.62,p[1]];camera.yaw=world?.stages[0]?.spawnYaw??-.65;camera.pitch=-.06;
    overlayItems=[];drawFrame(stageObjects.map(g=>g.model),{ambient:.75,fogNear:8,fogFar:22},{time:0,vignette:.7});titleFrameDirty=false;
   }
  }else if((state!=='paused'&&state!=='inventory')||titleFrameDirty){
   // Paused simulation and inventory keep a still scene behind their DOM UI.
   // State changes, resize, visibility and pixel density invalidate the frame.
   atmosphere=atmosphereAt(world,...player);
   wallWriting?.update(camera.eye);warningWallRepair?.update(camera.eye);warningRoom?.update(camera,state==='playing');bacteria.foreground=state==='caught'&&skinCaptureActor==='bacteria';if(skinModel)skinModel.foreground=state==='caught'&&skinCaptureActor==='skinstealer';const scene=state==='falling'?stageObjects.filter(g=>g.model.instanceId==='baked').map(g=>g.model):[...stageObjects.map(g=>g.model),...doorFrames,...(breakerPanels?.models??[]),...(dressing?.models??[]),...straySigns,...(watchers?.models??[]),warningWallRepair?.model,...(wallWriting?.models??[]),...(warningRoom?.models??[]),...passages,...exitDoor,...maintenanceModels,...(water?.models??[]),flashlightModel,...lockerInstances.map(x=>x.visual.model),...(bustPyramid?.models??[]),bacteriaShadow,bacteria,hazmatModel,skinModel].filter(Boolean);const mood=presentAtmosphere(dt,now);sceneLight=mood.light;presentGuidance(now);presentLockerView();
   const fade=state==='ending'?{fade:Math.min(1,endingTime/2.4),fadeColor:[.78,.88,.88]}:state==='won'?{fade:.55,fadeColor:[.78,.88,.88]}:null;
   drawFrame(scene,{...atmosphere,light:mood.light,flash:state==='caught'||!flash?false:mood.torch>=.999?true:mood.torch},{time:now/1000,...mood.post,...postState,...fade});
   titleFrameDirty=false;
  }}
 }catch(e){console.error(e);$('error').textContent=e.message;setState('menu')}
 requestAnimationFrame(tick)
}
$('start').onclick=()=>{if(state!=='menu')return;if(!introSequence){start();return}setState('intro');if(!introSequence.start({volume:+$('volume').value/100}))start()};$('resume').onclick=resume;$('retry').onclick=()=>start({resumeBreakers:true});$('retry-pause').onclick=start;$('title-pause').onclick=title;$('title-result').onclick=title;$('credits-open').onclick=()=>{$('credits').hidden=false};$('credits-close').onclick=()=>{$('credits').hidden=true};
input=createGameInput({document,window,canvas,keys,getState:()=>state,
 actions:{collect,toggleInvulnerability,struggle:struggleTap,selectSlot:index=>itemSlots?.select(index),useSelectedSlot,toggleFlash,toggleMap:()=>{$('map-wrap').hidden=!$('map-wrap').hidden;drawMap()},
  openInventory,closeInventory,pause,exitFullscreen:()=>{if(document.fullscreenElement===document.documentElement)try{document.exitFullscreen?.()?.catch?.(()=>{})}catch{}},closeCredits:()=>{if($('credits').hidden)return false;$('credits').hidden=true;return true}},
 onLook:(dx,dy)=>{yaw+=dx*.0022;pitch=Math.max(-1.25,Math.min(1.25,pitch-dy*.0022));const h=hiding?.state;if(h?.hidden&&h.locker){const d=Math.atan2(Math.sin(yaw-h.locker.facingYaw),Math.cos(yaw-h.locker.facingYaw));yaw=h.locker.facingYaw+Math.max(-.28,Math.min(.28,d));pitch=Math.max(-.10,Math.min(.10,pitch))}},
 onPointerFailure:()=>notice('画面をドラッグ、または矢印キーで視点を操作できます。',7)
});
canvas.addEventListener('webglcontextlost',e=>{
 e.preventDefault();renderingUnavailable=true;operationTime=0;qaRoute=null;introSequence?.cancel?.();deathSequence?.reset();infectionSequence?.reset();sound.stopCue('chant');
 setState('paused');$('pause').querySelector('p').textContent='描画が停止しました。ページを再読み込みしてください。';
 $('resume').disabled=true;$('retry-pause').disabled=true;$('start').disabled=true;$('retry').disabled=true;
 $('error').textContent='描画を再開するには、ページを再読み込みしてください。';
});
const invalidateTitleFrame=()=>{titleFrameDirty=true};
window.addEventListener('resize',invalidateTitleFrame);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)invalidateTitleFrame()});
const titleResizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(invalidateTitleFrame):null;
titleResizeObserver?.observe(canvas);

installModalAccessibility({document,window});
deathSequence=createDeathSequence({document,onFinish:completeDeath,onChant:event=>{if(event==='start'||event==='resume')sound.cue('chant');else if(event==='pause')sound.stopCue('chant')}});document.body.append(deathSequence.root);
infectionSequence=createInfectionSequence({document,onFinish:()=>finish(false,'infection'),onEscape:escapeWarningRoom,onPanel:()=>sound.cue('warning_tone')});document.body.append(infectionSequence.root);
fullscreenControl=createFullscreenControl({document,buttons:[$('fullscreen-menu'),$('fullscreen-pause')],onChange:active=>{
 if(!active&&infectionSequence?.phase==='running'){infectionSequence.cancel();escapeWarningRoom({wasFullscreen:true})}
},onError:()=>{const message='全画面にできませんでした。通常表示で続けられます。';if($('fullscreen-status'))$('fullscreen-status').textContent=message;if(state==='paused'&&$('pause-description'))$('pause-description').textContent=message;else if(state==='playing')notice(message,4)}});

async function load(){
 // Each of these has a renderer reader and a rig/geometry reader during boot.
 beginModelLoadBatch(['bacteria','hazmat','skinstealer','locker','warning-signs-set','level0'].map(name=>`assets/models/${name}.glb`));
 try{renderer=new Renderer(canvas);try{if(new URLSearchParams(location.search).has('direct'))throw Error('direct rendering requested');pipeline=createRenderPipeline(renderer);document.body.classList.add('pipeline')}catch(error){console.warn('Render pipeline unavailable; drawing directly.',error);pipeline=null}requestAnimationFrame(tick);world=await loadWorld();
 const sources=[['assets/models/bacteria.glb',o=>bacteria=o],[ALMOND_WATER_MODEL_URL,o=>waterModel=o],['assets/models/hazmat.glb',o=>hazmatModel=o],['assets/models/skinstealer.glb',o=>skinModel=o],['assets/models/locker.glb',o=>lockerModel=o],['assets/models/flashlight.glb',o=>flashlightModel=o],['assets/models/sculpture-bust-roza.glb',o=>bustModel=o],...Object.entries(DRESSING_MODELS).map(([type,url])=>[url,o=>dressingModels[type]=o])];
 // Overlap a few independent downloads without decoding every large GLB at once.
 let sourceIndex=0,sourceError=null;
 $('load-label').textContent=`Loading actor 0 / ${sources.length}`;
 await Promise.all(Array.from({length:Math.min(lowMemoryDevice?2:3,sources.length)},async()=>{
  while(!sourceError&&sourceIndex<sources.length){
   const [url,assign]=sources[sourceIndex++];
   try{assign(await renderer.load(url));loadCount++;if(!sourceError){$('load-label').textContent=`Loading actor ${loadCount} / ${sources.length}`;$('load-fill').style.width=loadCount/(sources.length+4)*100+'%'}}
   catch(error){sourceError=error}
  }
 }));
 if(sourceError)throw sourceError;
 sourceScene=await createSourceWorldVisual(renderer,world.layout,(loaded,total)=>{$('load-label').textContent=`Loading original room ${loaded} / ${total}`;$('load-fill').style.width=(sources.length+loaded)/(sources.length+total)*100+'%'});
 stageObjects=sourceScene.models.map(model=>({model,items:[],portal:[],landmarks:[]}));
 // The field's single grass texture is stretched over ~96 m; add its own fine detail.
 for(const model of sourceScene.models)if(model.instanceId==='dreamcore')model.meshes=model.meshes.map(mesh=>mesh.material?.name==='grass'?{...mesh,material:{...mesh.material,detail:.55}}:mesh);
 // Outer faces of the Original walls are unlit black in their baked atlas.
 {const fills={BR_2:[.3,.28,.11],StripeWallpaper:[.3,.28,.11],Dot_Wallpaper:[.3,.28,.11],GreenSkirting:[.16,.17,.08]},shared=new Map();
  for(const model of sourceScene.models)if(model.sourceModel==='assets/models/original-backrooms.glb')model.meshes=model.meshes.map(mesh=>{
   const fill=fills[mesh.material?.name];if(!fill)return mesh;
   if(!shared.has(mesh.material))shared.set(mesh.material,{...mesh.material,darkFill:fill});
   return {...mesh,material:shared.get(mesh.material)}})}
 try{doorFrames=createDoorFrames(renderer,await loadDoorFrames(),world.layout)}catch(error){console.warn('Door casings unavailable.',error);doorFrames=[]}
 wallWriting=await createWallWriting(renderer);
 warningRoom=await createWarningRoomVisual(renderer,sourceScene);
 warningWallRepair=createForbiddenRoomWallRepair(renderer,sourceScene);
 nav=world.nav;bustPyramid=createBustPyramid({model:bustModel,nav,addBounds:({world,nav,position,material})=>createBustWorldBoundaries({world,nav,center:position,material})});bustModel.visible=false;objective=createEscapeObjective(nav,world.targets);registerAlmondWater(inventory);water=createAlmondWaterPickups({inventory,model:waterModel,nav,viaIndex:objective.maintenance.i});observations=createEnvironmentObservations(nav,{supplies:water.pickups});exploration=createExplorationJournal({nav,objective,water,explored,discovered});skinDirector=createSkinstealerDirector({nav});initializeMarkers();
 guidance=createGuidance({nav});
 try{watchers=createWatchers({model:bustModel,nav})}catch(error){console.warn('Watcher busts unavailable.',error)}
 try{straySigns=createStraySigns(warningRoom.catalog)}catch(error){console.warn('Stray signs unavailable.',error)}
 // Flood the first guidance field while the loading bar is still up.
 nav.distanceField?.(nav.exit);
 {const neighbours={};for(const join of world.layout.joins){(neighbours[join.a]??=[]).push(join.b);(neighbours[join.b]??=[]).push(join.a)}
  horror=createHorrorDirector({regionIds:nav.regionIds,outdoor:world.layout.instances.filter(i=>i.outdoor).map(i=>i.id),neighbours,alwaysLit:['baked']})}
 // Each breaker is the owner's electrical box on the wall with a small status
 // plate above it. Both are presentation only: without them the breakers still work.
 const mounts=[{id:'maintenance',title:'配電盤 A',...world.layout.maintenanceFixture},...(world.layout.breakers??[]).map((b,i)=>({id:b.id,title:'配電盤 '+'BCDEF'[i],...b.fixture}))];
 inventory.register({id:CROWBAR_ID,name:'バール',description:'歪んだ金属のカバーをこじ開ける。',maxStack:1,available:true,effect:null});
 try{dressing=createSetDressing({models:dressingModels,props:world.layout.props,nav,breakers:mounts})}catch(error){console.warn('Set dressing unavailable.',error);dressing=null}
 for(const model of Object.values(dressingModels))if(model)model.visible=false;
 try{breakerPanels=createBreakerPanels(renderer,mounts.map(m=>({...m,position:[m.position[0],1.72,m.position[2]],width:.34,height:.44})))}catch(error){console.warn('Breaker plates unavailable.',error);breakerPanels=null}
 hiding=createLockerHiding({nav,lockers:world.lockers??[],enterSeconds:LOCKER_TRANSITION_SECONDS,exitSeconds:LOCKER_TRANSITION_SECONDS});
 inventory.register({id:FLASHLIGHT_ID,name:'懐中電灯',description:'F で点灯・消灯。',maxStack:1,available:true,effect:null});
 flashlightPickup=createFlashlightPickup({nav,inventory,acquire:()=>inventory.add(FLASHLIGHT_ID,1),setVisible:visible=>{flashlightModel.visible=visible}});
 {const p=flashlightPickup.state.position;flashlightModel.matrix=flashlightFloorMatrix(flashlightModel,p,flashlightPickup.state.floor);}
 lockerVisual=await createLockerVisual(renderer,lockerModel);
 lockerInstances=(world.lockers??[]).map(l=>{const matrix=M.mul(M.pose(l.position[0],nav.floorAt(...l.approach),l.position[2],l.yaw,1),M.trs([0,0,0],undefined,l.scale));return {id:l.id,visual:lockerVisual.createInstance({matrix})}});
 lockerModel.visible=false;
 itemSlots=createItemSlots({inventory,document});$('hud').append(itemSlots.root);
 inventoryUI=createInventoryPanel({inventory,document,onClose:closeInventory,onUse:useItem});document.body.append(inventoryUI.root);
 const introConfig=await loadIntroConfig();introSequence=createIntroSequence({document,window,config:introConfig,onFinish:start,onVolumeChange:v=>{$('volume').value=String(Math.round(v*100));sound.setVolume(v)}});$('volume').addEventListener('input',()=>introSequence.setVolume(+$('volume').value/100));
 applyBacteriaMaterial(bacteria);animator=await createBacteriaAnimator(renderer,bacteria);
 bacteriaShadow={...bacteria,id:'bacteria-shadow',visible:false,foreground:false,matrix:M.identity(),meshes:bacteria.meshes.map(mesh=>({...mesh,material:{...mesh.material,texture:renderer.white,color:[.035,.032,.02,1],emissive:[0,0,0],rim:0,unlit:1}}))};
 // Adjust only this loaded instance's material, retaining the authored texture
 // and original GLB. The game flashlight otherwise clips the bright suit.
 hazmatModel.meshes=hazmatModel.meshes.map(mesh=>{const material=mesh.material,color=material?.color??[1,1,1,1];return {...mesh,material:{...material,color:[color[0]*.62,color[1]*.62,color[2]*.62,color[3]??1]}}});
 hazmatAnimator=await createSkinnedActor(renderer,hazmatModel,{url:'assets/models/hazmat.glb',type:'hazmat'});skinAnimator=await createSkinnedActor(renderer,skinModel,{url:'assets/models/skinstealer.glb',type:'skinstealer'});
 passages=[];exitDoor=[];activateStage(0);$('start').disabled=renderingUnavailable;$('load-label').textContent='準備完了 / オフラインでプレイできます';setState(renderingUnavailable?'paused':'menu');
 if(new URLSearchParams(location.search).has('qa')){
  window.__gameQA=Object.freeze({
   previewAwakening:()=>{start({showAwakening:true});return state==='awakening'},
   snapshot:()=>({state,shadowIntro:{...shadowIntro,visible:!!bacteriaShadow?.visible},pitDread,jam:{...jam},boxes:dressing?.boxes.map(b=>({id:b.id,position:[...b.position],opened:b.opened,contains:b.contains,stand:b.stand?.position??null}))??[],dressing:dressing?.models.length??0,struggle:struggle?{...struggle}:null,escapesLeft,aftermath,breakers:objective.breakers.map(b=>({id:b.id,position:[...b.position],restored:objective.isRestored(b.id)})),guide:guideInfo?{distance:guideInfo.distance,marks:guideInfo.items.length,hasRoute:guideInfo.hasRoute,aim:guideInfo.aim?[...guideInfo.aim]:null}:null,horror:horror?{dread:horror.dread,stage:horror.stage,dark:horror.darkRegions}:null,watchers:watchers?.snapshot()??null,straySigns:straySigns.length,render:pipeline?.stats??null,renderScale,sceneLight,busts:bustPyramid?.snapshot()??null,warningRoom:warningRoom?{signCount:warningRoom.signs.length,meshCount:warningRoom.signs.reduce((n,m)=>n+m.meshes.length,0),visibleSignCount:warningRoom.signs.filter(m=>m.visible!==false).length,doorMeshes:warningRoom.door?.meshes.length??0}:null,flashlight:flashlightPickup?.state??null,flash,locker:hiding?.state??null,lockers:world.lockers??[],skinstealer:skinState?{...skinState,position:[...skinState.position],humanVisible:!!hazmatModel?.visible,monsterVisible:!!skinModel?.visible,humanRigged:!!hazmatAnimator?.enabled,monsterRigged:!!skinAnimator?.enabled}:null,captureActor:skinCaptureActor,fallTime:fall?.time??null,observations:observations?.observations.map(o=>({id:o.id,region:o.region,position:[...o.position]}))??[],lastObservation:observations?.last?.id??null,regionId:stage?.id,regionTitle:stage?.title,floorHeight:nav.floorAt(...player),camera:{eye:[...camera.eye],yaw:camera.yaw,pitch:camera.pitch},sourceScene:sourceScene.stats,gateOpen:nav.isGateOpen?.('outdoor-door')??false,visualGateOpen:sourceScene.gates?.get('outdoor-door')?.open??false,player:[...player],yaw,pitch,elapsed,stamina,sprintReady,operationTime,objective:{...objective.state},routeHint:currentRouteHint()?{...currentRouteHint(),position:[...currentRouteHint().position]}:null,guidance:targetObjective()?{...targetObjective(),position:[...targetObjective().position]}:null,targets:{exit:{...objective.exit},maintenance:{...objective.maintenance},escape:objective.escape?{...objective.escape}:null},inventory:inventory.list(),slots:itemSlots?.snapshot()??null,pickups:water.pickups.map(p=>({id:p.id,position:[...p.position],collected:p.collected,visible:p.model.visible})),enemy:{active:enemy.active,pos:[...enemy.pos],mode:enemy.mode,memory:enemy.memory,lastKnown:enemy.lastKnown?[...enemy.lastKnown]:null,seesPlayer:!!enemy.seesPlayer,reactionRemaining:encounter.reactionRemaining},encounter:encounter.state,audio:sound.getDiagnostics?.()??null,renderingUnavailable,exploration:exploration.diagnostics,supplies:exploration.availableSupplies.map(p=>({id:p.id,position:[...p.position]})),explored:explored.size,discovered:[...discovered],qaRoute:qaRoute===null?null:qaRoute.length,qaMessage,signs:markerElements.filter(e=>!e.hidden).map(e=>e.textContent)}),
   renderSummary:()=>({stats:sourceScene.stats,instances:sourceScene.instances?.map(instance=>({id:instance.definition.id,model:instance.definition.model,models:instance.models.length,meshes:instance.models.reduce((sum,model)=>sum+model.meshes.length,0)}))??[],models:stageObjects.map(({model})=>({url:model.sourceModel??model.url??null,id:model.id??null,meshes:model.meshes.length,visible:model.visible!==false}))}),
   placeEnemy:({actor,position,angle}={})=>{if(actor!=='bacteria'||state!=='playing'||!Array.isArray(position)||position.length!==2||!position.every(Number.isFinite)||!nav.canWalk(...position)||!Number.isFinite(angle))return false;enemy.pos=[...position];enemy.yaw=angle;enemyDirector.activate();bacteria.visible=true;return true},
   routeToPoint:point=>routeQA(point),
   routeTo:id=>{const p=id==='water'?water.pickups.find(p=>!p.collected)?.position:objective.breakers.find(b=>b.id===id)?.position??(id==='maintenance'?objective.maintenance.position:id==='exit'?objective.exit.position:id==='escape'?objective.escape?.position:id.startsWith('region:')?world.get(id.slice(7))?.spawn:null);return routeQA(p)}

  });
  let wrap=document.createElement('div');wrap.style='position:fixed;right:15px;bottom:65px;z-index:20;display:flex;gap:5px;background:#101010;padding:8px';
  for(let [label,fn] of [['QA: クリア経路',()=>{$('difficulty').value='explore';start();qaAutomatic=true;qaRoute=[];notice('QA: 扉の調査、回路復旧、脱出まで歩いて検証します。',6)}],['QA: 敵の追跡',()=>{$('difficulty').value='normal';start();enemy.pos=nav.point(nav.path(nav.start,nav.exit)[15]);enemy.yaw=Math.atan2(player[0]-enemy.pos[0],player[1]-enemy.pos[1]);enemyDirector.activate();bacteria.visible=true;notice('QA: 近くの敵が視線・物音でプレイヤーを探します。',6)}]]){let b=document.createElement('button');b.textContent=label;b.style='width:auto;font-size:10px';b.onclick=fn;wrap.append(b)}document.body.append(wrap);
 }
 }catch(e){console.error(e);$('load-label').textContent='読み込みに失敗しました';$('error').textContent=e.message+'\nSTART-GAME.bat から起動し、ブラウザーを再読み込みしてください。';$('start').disabled=true}
 finally{endModelLoadBatch()}}
load();
