// A bounded fictional in-game warning sequence. It creates no OS windows.
// The game owns the safe return, audio, and the following death sequence.
const MESSAGES=Object.freeze([
  ['異常な信号を検出','この部屋の観測値が、記録された範囲を超えています。'],
  ['隔離手順を開始','発信元を特定できません。受信を継続しています。'],
  ['応答の不一致','同じ場所から、異なる時刻の信号が届いています。'],
  ['記録を照合できません','保存された経路と現在地が一致しません。'],
  ['接続状態が変化','境界の外側から応答がありました。'],
  ['観測値を再取得','座標の再計算を要求しています。'],
  ['同期に失敗','最後の正常な記録を読み込めません。'],
  ['送信元は不明','同一の信号が複数の場所で検出されました。'],
  ['経路を確認できません','現在の出口は記録に存在しません。'],
  ['受信を継続','停止要求に対する応答がありません。'],
  ['参照先が変更されました','保存された観測値を使用できません。'],
  ['境界情報が欠落','異常の範囲を確定できません。'],
  ['再接続を試行','同じ応答が繰り返し返されています。'],
  ['識別に失敗','位置情報を照合できませんでした。'],
  ['残された記録','最後の受信からの経過時間を計算できません。'],
  ['信号の重複','複数の受信記録が一致しています。'],
  ['経路情報を破棄','この先の位置を確認できません。'],
  ['応答が途絶えました','復旧手順を続行できません。'],
  ['観測を終了','記録の一部が読み取れません。'],
  ['接続が失われます','ここから先を記録できません。']
].map(Object.freeze));
export const INFECTION_PANEL_COUNT=MESSAGES.length;
export const INFECTION_DURATION=8;
const INTERVAL=.32;
// Keep the existing five warning cues spaced in ordinary real time. If a
// frame skips several cue boundaries, only the latest one is emitted.
const CUES=Object.freeze([0,1.15,2.3,3.45,4.6]);

export function createInfectionSequence({document,onFinish=()=>{},onEscape=()=>{},onPanel=()=>{}}={}){
  if(!document?.createElement||typeof document.addEventListener!=='function'||typeof onFinish!=='function'||typeof onEscape!=='function'||typeof onPanel!=='function')
    throw new TypeError('Infection sequence requires a document and callbacks');
  const root=document.createElement('section');root.className='infection-sequence';root.hidden=true;
  root.setAttribute('role','region');root.setAttribute('aria-label','ゲーム内の架空警告演出');
  const banner=document.createElement('div');banner.className='infection-sequence-banner';
  banner.textContent='ゲーム内の架空警告　/　ESC で中止して戻る';
  const live=document.createElement('span');live.className='infection-sequence-announcement';live.setAttribute('role','status');live.setAttribute('aria-live','polite');
  live.textContent='ゲーム内の架空警告が表示されています。エスケープキーで中止して戻れます。';
  const field=document.createElement('div');field.className='infection-sequence-field';field.setAttribute('aria-hidden','true');
  const panels=MESSAGES.map(([titleText,bodyText],index)=>{
    const panel=document.createElement('div');panel.className=`infection-sequence-panel infection-sequence-panel-${index+1}`;panel.hidden=true;
    const title=document.createElement('strong');title.className='infection-sequence-title';title.textContent=`警告 / ${String(index+1).padStart(2,'0')}`;
    const subtitle=document.createElement('div');subtitle.className='infection-sequence-subtitle';subtitle.textContent=titleText;
    const text=document.createElement('p');text.textContent=bodyText;
    const footer=document.createElement('div');footer.className='infection-sequence-footer';footer.textContent=`SIGNAL LOG / ${String(index+1).padStart(2,'0')}     ● 監視中`;
    panel.append(title,subtitle,text,footer);field.append(panel);return panel;
  });
  root.append(banner,field,live);
  let phase='idle',elapsed=0,disposed=false,lastCue=-1;
  const hidePanels=()=>{for(const panel of panels)panel.hidden=true};
  function start(){
    if(disposed||phase!=='idle')return false;
    elapsed=0;lastCue=0;hidePanels();panels[0].hidden=false;root.hidden=false;phase='running';onPanel(0);return true;
  }
  function update(dt){
    if(disposed||phase!=='running'||document.hidden||!Number.isFinite(dt)||dt<=0)return phase;
    elapsed=Math.min(INFECTION_DURATION,elapsed+dt);
    const count=Math.min(panels.length,1+Math.floor(elapsed/INTERVAL));
    for(let i=0;i<count;i++)if(panels[i].hidden)panels[i].hidden=false;
    let cue=lastCue;for(let i=lastCue+1;i<CUES.length;i++)if(elapsed>=CUES[i])cue=i;
    if(cue>lastCue){lastCue=cue;onPanel(cue)}
    if(elapsed>=INFECTION_DURATION){phase='complete';root.hidden=true;onFinish()}
    return phase;
  }
  function cancel(){if(disposed||phase!=='running')return false;phase='idle';elapsed=0;root.hidden=true;hidePanels();return true}
  function reset(){if(disposed)return false;phase='idle';elapsed=0;lastCue=-1;root.hidden=true;hidePanels();return true}
  function onKey(event){
    if(disposed||phase!=='running'||!(event.code==='Escape'||event.key==='Escape'))return;
    event.preventDefault?.();event.stopImmediatePropagation?.();
    if(cancel())onEscape();
  }
  document.addEventListener('keydown',onKey,true);
  function dispose(){if(disposed)return;phase='idle';root.hidden=true;disposed=true;document.removeEventListener?.('keydown',onKey,true);root.remove?.()}
  return Object.freeze({root,start,update,cancel,reset,dispose,get phase(){return phase}});
}
