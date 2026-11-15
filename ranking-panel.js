import {formatRankingTime,normalizeRankingName} from './ranking.js';

const MODES=Object.freeze({normal:'標準',easy:'やさしい',explore:'探索'});
const mode=value=>Object.hasOwn(MODES,value)?value:'normal';
const exclusionText=reason=>({
  invulnerability:'無敵を使用したプレイは記録しません。',
  checkpoint:'進行状況を引き継いだプレイは記録しません。',
  qa:'検証用のプレイは記録しません。',
  difficultychanged:'途中で探索モードを変更したプレイは記録しません。',
  clockinvalid:'計測時間を確認できないため、記録しません。',
})[String(reason??'').replace(/[-_]/g,'')]||'このプレイは集計ルールの対象外です。';

// Presentation only: the game supplies the finished run and its single store
// submission. Opening this panel never starts a clock or submits another score.
export function createRankingPanel({document,window,store,getDifficulty=()=> 'normal'}) {
  const $=id=>document.getElementById(id);
  const modal=$('ranking-modal'),result=$('ranking-result'),select=$('ranking-difficulty');
  const input=$('ranking-name'),nameField=$('ranking-name-field'),nameStatus=$('ranking-name-status');
  let current=null;

  function read(difficulty) {
    try {
      const records=store.read(difficulty);
      return {records:Array.isArray(records)?records.slice(0,10):[],persisted:store.snapshot().persistence!==false};
    } catch {return {records:[],persisted:false}}
  }
  function renderTable() {
    const difficulty=mode(select.value),{records,persisted}=read(difficulty);
    const rows=$('ranking-rows');rows.replaceChildren();
    $('ranking-caption').textContent=`${MODES[difficulty]}のクリアタイム上位10件`;
    for(const [index,entry] of records.entries()) {
      const row=document.createElement('tr'),rank=document.createElement('th');
      rank.scope='row';rank.textContent=String(index+1);
      const name=document.createElement('td');name.textContent=normalizeRankingName(entry.name);
      const time=document.createElement('td');time.textContent=formatRankingTime(entry.durationMs);time.className='ranking-time';
      if(entry.id===current?.run.id) {
        row.dataset.current='true';
        const badge=document.createElement('small');badge.className='ranking-current';badge.textContent='今回';name.append(badge);
      }
      row.append(rank,name,time);rows.append(row);
    }
    $('ranking-table').hidden=!records.length;$('ranking-empty').hidden=!!records.length;
    $('ranking-storage').hidden=persisted;
    $('ranking-storage').textContent=persisted?'':'このブラウザーでは保存できません。ページを閉じると今回の変更は失われます。';
  }
  function renderResult() {
    if(!current)return;
    const {run,submission}=current,eligible=run.eligible!==false,view=read(mode(run.difficulty));
    const saved=eligible&&submission?.saved===true&&Number.isInteger(submission.rank)&&submission.rank>=1&&submission.rank<=10;
    $('ranking-result-summary').textContent=`${MODES[mode(run.difficulty)]} / ${!eligible?'ランキング対象外':saved?`${submission.rank}位`:'TOP 10 圏外'}`;
    $('ranking-result-note').textContent=!eligible?exclusionText(run.reason):saved?
      (submission.persisted===false?'このページ内の記録です。ブラウザーには保存できません。':'このブラウザーに保存しました。'):
      (view.persisted?'上位10件のクリア記録を保存しています。':'このページ内で上位10件を表示します。ブラウザーには保存できません。');
    const entry=saved?view.records.find(record=>record.id===run.id):null;
    nameField.hidden=!entry;
    if(entry)input.value=normalizeRankingName(entry.name);
  }
  function saveName() {
    if(!current||nameField.hidden)return;
    const name=normalizeRankingName(input.value),entry=read(mode(current.run.difficulty)).records.find(record=>record.id===current.run.id);
    input.value=name;
    if(entry?.name===name)return;
    try {
      current.submission=store.rename(current.run.id,name);
      renderResult();
      nameStatus.textContent=current.submission.saved?
        (current.submission.persisted===false?'名前を変更しました。このページ内だけに保存されます。':'名前を保存しました。'):
        'この記録は上位10件にありません。';
    } catch {nameStatus.textContent='名前を保存できませんでした。'}
    if(!modal.hidden)renderTable();
  }
  function open(difficulty=getDifficulty()) {
    select.value=mode(difficulty);renderTable();modal.querySelector('.ranking-scroll').scrollTop=0;modal.hidden=false;
  }
  function close() {modal.hidden=true;}
  function clearResult() {
    close();current=null;result.hidden=true;nameField.hidden=true;nameStatus.textContent='';input.value='ゲスト';
  }
  function showResult({run,submission}) {
    current={run,submission};nameStatus.textContent='';renderResult();result.hidden=false;
  }

  $('ranking-open').addEventListener('click',()=>open());
  $('ranking-result-open').addEventListener('click',()=>open(current?.run.difficulty));
  $('ranking-close').addEventListener('click',close);
  select.addEventListener('change',renderTable);
  input.addEventListener('input',()=>{nameStatus.textContent=''});
  input.addEventListener('change',saveName);
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.isComposing){event.preventDefault();event.stopPropagation();saveName();}
  });
  // Stop Escape before the game's document listener can pause/resume anything.
  document.addEventListener('keydown',event=>{
    if(!modal.hidden&&(event.key==='Escape'||event.code==='Escape')) {
      event.preventDefault();event.stopImmediatePropagation();close();
    }
  },true);
  return {showResult,clearResult,open,close};
}
