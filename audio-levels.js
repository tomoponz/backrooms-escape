/** User level multipliers, applied before the existing master compressor. */
export const AUDIO_LEVEL_KEY='backrooms.audio.levels.v1';
export const AUDIO_ITEMS=Object.freeze([
  {key:'ambience',label:'蛍光灯の音',group:'環境'},
  {key:'player_walk',label:'歩行',group:'プレイヤー'},
  {key:'player_run',label:'走行',group:'プレイヤー'},
  {key:'enemy_step',label:'敵の足音',group:'敵'},
  {key:'enemy_breath',label:'敵の呼吸（削除済み）',group:'敵'},
  {key:'capture',label:'Bacteria に捕まった時',group:'敵'},
  {key:'skin_voice',label:'Skinstealer の声',group:'敵'},
  {key:'alert',label:'敵に気づかれた時',group:'効果音'},
  {key:'door',label:'扉が開く音',group:'効果音'},
  {key:'locked',label:'扉の施錠音',group:'効果音'},
  {key:'warning_tone',label:'警告音',group:'効果音'},
  {key:'chant',label:'お経',group:'効果音'},
  {key:'bust_fall',label:'胸像が崩れる音',group:'効果音'},
  {key:'pry',label:'バールでこじ開ける音',group:'効果音'},
  {key:'locker_open',label:'ロッカーを開ける音',group:'効果音'},
  {key:'locker_close',label:'ロッカーを閉める音',group:'効果音'},
  {key:'transform',label:'Skinstealer への変貌音',group:'敵'},
  {key:'heartbeat',label:'心拍音（捕獲中と直後）',group:'敵'},
  {key:'chase_bgm',label:'追跡中の BGM',group:'敵'},
  {key:'flash',label:'ライトの切り替え',group:'音源未設定'},
  {key:'escape',label:'脱出',group:'音源未設定'},
  {key:'death',label:'ゲームオーバー',group:'音源未設定'},
  {key:'pickup',label:'アイテム取得',group:'音源未設定'},
  {key:'power',label:'電源操作',group:'音源未設定'},
  {key:'relay',label:'リレー操作',group:'音源未設定'}
]);
export function normalizeAudioLevels(input){
  const source=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  return Object.fromEntries(AUDIO_ITEMS.map(({key})=>[key,typeof source[key]==='number'&&Number.isFinite(source[key])?Math.min(8,Math.max(0,source[key])):1]));
}
export function readAudioLevels(){try{return normalizeAudioLevels(JSON.parse(globalThis.localStorage?.getItem(AUDIO_LEVEL_KEY)||'{}'))}catch{return normalizeAudioLevels({})}}
export function writeAudioLevels(levels){try{globalThis.localStorage.setItem(AUDIO_LEVEL_KEY,JSON.stringify(normalizeAudioLevels(levels)));return true}catch{return false}}
