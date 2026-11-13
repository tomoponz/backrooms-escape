// The official player is visible only on the title screen.
const VIDEO_ID = 'K8cZHQk8MFU';
const menu = document.getElementById('menu');
const credits = document.getElementById('credits');

if (menu) {
  const section = document.createElement('section');
  section.className = 'title-music';
  section.setAttribute('aria-label', 'タイトル音楽');
  section.innerHTML = `<div class="title-music-cabinet"><div class="title-music-screen"><div id="title-youtube-player"></div></div></div>`;
  menu.append(section);

  const screen = section.querySelector('.title-music-screen');
  let player = null, ready = false, loading = false;
  let visible = false, attempted = false, attemptToken = 0, timer = null;
  const eligible = () => ready && visible && !document.hidden && !menu.hidden && (!credits || credits.hidden);
  function clearTimer() { if (timer !== null) window.clearTimeout(timer); timer = null; }
  function pause() { if (ready && player) { try { player.pauseVideo(); } catch (_) {} } }
  function maybeAutoplay() {
    if (eligible() && !attempted) {
      attempted = true;
      try { player.playVideo(); } catch (_) { /* YouTube controls remain available. */ }
    }
  }
  function visibilityChanged() {
    if (menu.hidden || document.hidden || (credits && !credits.hidden)) {
      pause();
      attempted = true;
    } else {
      maybeAutoplay();
    }
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
    // Keep any YouTube-provided error visible and allow a normal page reload.
    console.warn(message);
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
            maybeAutoplay();
          },
          onAutoplayBlocked: () => { /* Use the visible YouTube player's own controls. */ },
          onStateChange: event => {
            if (token === attemptToken && event.data === window.YT.PlayerState.PLAYING && !eligible()) pause();
          },
          onError: () => { if (token === attemptToken) fail('YouTube player error.'); }
        }
      });
    } catch (_) { fail('YouTube player could not be initialized.'); }
  }
  function loadApi() {
    if (loading || ready) return;
    loading = true;
    const token = ++attemptToken;
    timer = window.setTimeout(() => { if (token === attemptToken && loading) fail('YouTube player loading timed out.'); }, 15000);
    if (window.YT?.Player) { initializePlayer(token); return; }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try { previous?.(); } finally { initializePlayer(token); }
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { if (token === attemptToken) fail('YouTube API could not be loaded.'); };
    document.head.append(script);
  }
  loadApi();
}
