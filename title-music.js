// Title-only YouTube player. The visitor chooses whether to load the service.
const VIDEO_ID = 'K8cZHQk8MFU';
const menu = document.getElementById('menu');
const credits = document.getElementById('credits');

if (menu) {
  const section = document.createElement('section');
  section.className = 'title-music';
  section.setAttribute('aria-label', 'タイトル音楽');
  section.innerHTML = `
    <div class="title-music-cabinet">
      <div class="title-music-screen"><div id="title-youtube-player"></div></div>
    </div>
    <div class="title-music-meta">
      <label class="title-music-consent"><input type="checkbox"> 説明と利用規約に同意して YouTube を読み込む</label>
      <p class="title-music-status" role="status" aria-live="polite">読み込み後、画面が見えているときに自動再生を試みます。</p>
      <p class="title-music-notice">YouTube に接続情報が送信されます。読み込みにより <a href="youtube-privacy.html" target="_blank" rel="noopener">この機能のプライバシー説明</a> と <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 利用規約</a> に同意します。</p>
      <details class="title-music-privacy"><summary>動画とプライバシーについて</summary>
        <p>この音楽機能は YouTube API サービスを使用します。読み込むと YouTube / Google に IP アドレスなどの接続・端末情報が送信され、Cookie 等が使われる場合があります。YouTube は動画や広告を配信する場合があります。この機能自体は YouTube のログイン情報を取得・保存せず、再生履歴を独自に記録しません。</p>
        <p>読み込みによって、この音楽機能での <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 利用規約</a> と <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google プライバシーポリシー</a> に同意するものとします。</p>
      </details>
    </div>`;
  menu.append(section);

  const screen = section.querySelector('.title-music-screen');
  const consent = section.querySelector('.title-music-consent input');
  const status = section.querySelector('.title-music-status');
  let accepted = false, player = null, ready = false, loading = false;
  let visible = false, attempted = false;
  let attemptToken = 0, script = null, timer = null;
  const eligible = () => accepted && ready && visible && !document.hidden && !menu.hidden && (!credits || credits.hidden);
  function clearTimer() { if (timer !== null) window.clearTimeout(timer); timer = null; }
  function pause() { if (ready && player) { try { player.pauseVideo(); } catch (_) {} } }
  function play() {
    if (!eligible()) return;
    try { player.playVideo(); } catch (_) { status.textContent = '再生できませんでした。プレーヤーの操作をお試しください。'; }
  }
  function maybeAutoplay() {
    if (eligible() && !attempted) { attempted = true; play(); }
  }
  function visibilityChanged() {
    const isMenuVisible = !menu.hidden;
    if (!isMenuVisible || document.hidden || (credits && !credits.hidden)) {
      pause();
      if (accepted) attempted = true;
      if (ready) status.textContent = '一時停止しました。再開は YouTube プレーヤーで操作してください。';
    }
    // Once interrupted, resume only through the YouTube player's own controls.
    if (isMenuVisible && !document.hidden && (!credits || credits.hidden)) maybeAutoplay();
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.target === screen) {
      visible = entry.isIntersecting && entry.intersectionRatio > 0.5;
      if (!visible) pause(); else maybeAutoplay();
    }
  }, {threshold: [0, 0.5, 0.5001, 1]});
  observer.observe(screen);
  const stateObserver = new MutationObserver(visibilityChanged);
  stateObserver.observe(menu, {attributes: true, attributeFilter: ['hidden']});
  if (credits) stateObserver.observe(credits, {attributes: true, attributeFilter: ['hidden']});
  document.addEventListener('visibilitychange', visibilityChanged);
  document.getElementById('start')?.addEventListener('click', pause, {capture: true});

  function fail(message) {
    clearTimer();
    loading = false;
    ready = false;
    attemptToken++;
    try { player?.destroy?.(); } catch (_) {}
    player = null;
    // destroy() removes the iframe; provide a fresh mount for retry.
    screen.replaceChildren(Object.assign(document.createElement('div'), {id: 'title-youtube-player'}));
    script?.remove(); script = null;
    status.textContent = message;
  }
  function initializePlayer(token) {
    if (token !== attemptToken || !loading || player || !window.YT?.Player) return;
    try {
      player = new window.YT.Player('title-youtube-player', {
        width: '100%', height: '100%', videoId: VIDEO_ID,
        playerVars: {playsinline: 1, origin: location.origin, loop: 1, playlist: VIDEO_ID},
        events: {
          onReady: event => {
            if (token !== attemptToken) { try { event.target.destroy(); } catch (_) {} return; }
            clearTimer(); player = event.target; loading = false; ready = true;
            status.textContent = '音が出ない場合は YouTube プレーヤーの再生操作をお試しください。';
            maybeAutoplay();
          },
          onAutoplayBlocked: () => {
            if (token === attemptToken) status.textContent = '自動再生がブロックされました。YouTube プレーヤーで再生してください。';
          },
          onStateChange: event => {
            if (token === attemptToken && event.data === window.YT.PlayerState.PLAYING && !eligible()) pause();
          },
          onError: () => {
            if (token === attemptToken) fail('動画を読み込めませんでした。同意のチェックを外してから再度入れると再試行できます。');
          }
        }
      });
    } catch (_) { fail('YouTube を読み込めませんでした。同意のチェックを外してから再度入れると再試行できます。'); }
  }
  function loadApi() {
    if (loading || ready) return;
    loading = true;
    status.textContent = 'YouTube を読み込んでいます…';
    const token = ++attemptToken;
    timer = window.setTimeout(() => { if (token === attemptToken && loading) fail('YouTube の読み込みがタイムアウトしました。同意のチェックを外してから再度入れると再試行できます。'); }, 15000);
    if (window.YT?.Player) { initializePlayer(token); return; }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try { previous?.(); } finally { initializePlayer(token); }
    };
    script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { if (token === attemptToken) fail('YouTube を読み込めませんでした。同意のチェックを外してから再度入れると再試行できます。'); };
    document.head.append(script);
  }
  consent.addEventListener('change', () => {
    if (consent.checked) {
      accepted = true;
      attempted = false;
      loadApi();
      return;
    }
    accepted = false;
    attempted = false;
    clearTimer();
    loading = false;
    ready = false;
    attemptToken++;
    try { player?.destroy?.(); } catch (_) {}
    player = null;
    screen.replaceChildren(Object.assign(document.createElement('div'), {id: 'title-youtube-player'}));
    script?.remove(); script = null;
    status.textContent = '読み込み後、画面が見えているときに自動再生を試みます。';
  });
}
