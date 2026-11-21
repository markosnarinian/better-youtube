(() => {
  if (globalThis.__betterYouTubeLoaded) return;
  globalThis.__betterYouTubeLoaded = true;
  let settings = { ...BetterYouTube.defaults };
  let route = '';
  let scheduled = false;
  let adCover;
  let skipPlacement;
  let attemptedSkip;
  let style;
  let autoplayControl;
  let preferencesLoaded = false;
  let finishLoading;
  const preferencesReady = new Promise(resolve => { finishLoading = resolve; });
  const pendingStarts = new Set();
  const mutedVideos = new Map();
  const boundVideos = new WeakSet();
  const recoveries = new WeakMap();
  const nativePlay = HTMLMediaElement.prototype.play;

  const selectors = {
    ads: [
      'ytd-ad-slot-renderer', 'ytd-display-ad-renderer', 'ytd-promoted-sparkles-web-renderer',
      'ytd-promoted-sparkles-text-search-renderer', 'ytd-in-feed-ad-layout-renderer',
      'ytd-action-companion-ad-renderer', 'ytd-companion-slot-renderer',
      'ytd-banner-promo-renderer', 'ytd-statement-banner-renderer', 'ytd-primetime-promo-renderer',
      'ytm-promoted-sparkles-web-renderer', 'ytm-companion-ad-renderer',
      'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
      'ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer)',
      'ytd-video-renderer:has(.badge-style-type-ad)',
      'ytd-compact-video-renderer:has(.badge-style-type-ad)',
      'yt-lockup-view-model:has(.ytwAdBadgeViewModelHost)',
      '#player-ads', '#masthead-ad', '.ytp-ad-overlay-container', '.ytp-ad-overlay-slot',
      '.ytp-ad-image-overlay', '.ytp-ad-survey', '.ytp-suggested-action',
      '.ytp-paid-content-overlay', '.ytp-ce-expanding-overlay', '.ytp-ad-player-overlay-flyout-cta',
      'ytd-mealbar-promo-renderer', 'ytm-mealbar-promo-renderer',
      'tp-yt-paper-dialog:has(ytd-premium-upsell-dialog-renderer)'
    ],
    distractions: [
      'ytd-watch-flexy #secondary', 'ytd-watch-next-secondary-results-renderer',
      'ytm-item-section-renderer[section-identifier="related-items"]',
      '.ytp-endscreen-content', '.html5-endscreen', '.ytp-ce-element',
      '.ytp-cards-teaser', '.ytp-cards-button', '.ytp-autonav-endscreen',
      '.ytp-upnext', '.ytp-next-button', '.ytp-autonav-toggle-button-container',
      'ytd-watch-flexy #related', 'ytm-related-videos-renderer'
    ],
    shorts: [
      'ytd-reel-shelf-renderer', 'ytm-reel-shelf-renderer', 'ytd-rich-shelf-renderer[is-shorts]',
      'ytd-reel-video-renderer', 'ytd-shorts', 'ytm-shorts-lockup-view-model',
      'yt-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2',
      'ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)',
      'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
      'ytd-guide-entry-renderer:has(a[href^="/shorts"])',
      'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',
      'ytd-video-renderer:has(a[href^="/shorts/"])',
      'ytd-compact-video-renderer:has(a[href^="/shorts/"])',
      'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
      'yt-lockup-view-model:has(a[href^="/shorts/"])',
      'grid-shelf-view-model:has(a[href^="/shorts/"])',
      'a[href^="/shorts"]', 'a[href^="https://www.youtube.com/shorts"]',
      '[tab-identifier="FEshorts"]', 'yt-tab-shape[tab-title="Shorts"]', '[data-byt-shorts-tab]'
    ],
    comments: ['ytd-comments', '#comments', 'ytm-comment-section-renderer',
      'ytm-comments-entry-point-header-renderer', 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]']
  };

  function videoKey() {
    const url = new URL(location.href);
    return `${url.pathname}?v=${url.searchParams.get('v') || ''}`;
  }

  function syncRoute() {
    const key = videoKey();
    if (key === route) return;
    route = key;
    restoreMuted();
    for (const video of document.querySelectorAll('video')) cancelRecovery(video);
  }

  function isMainVideo(video) {
    return video instanceof HTMLVideoElement && !!video.closest('#movie_player, #player, #shorts-player, ytd-reel-video-renderer');
  }

  function inPiP(video) {
    return video.webkitPresentationMode === 'picture-in-picture' || document.pictureInPictureElement === video;
  }

  function blocked(video) {
    syncRoute();
    return isMainVideo(video) && settings.shorts && location.pathname.startsWith('/shorts');
  }

  // Guard the page's play() calls before playback starts, not just after a play event.
  HTMLMediaElement.prototype.play = function play(...args) {
    if (!preferencesLoaded && isMainVideo(this) && location.pathname.startsWith('/shorts')) {
      return preferencesReady.then(() => play.apply(this, args));
    }
    if (blocked(this)) {
      schedule();
      return Promise.reject(new DOMException('Shorts playback is disabled.', 'NotAllowedError'));
    }
    return nativePlay.apply(this, args);
  };

  function restoreMuted() {
    for (const [video, muted] of mutedVideos) video.muted = muted;
    mutedVideos.clear();
  }

  function cancelRecovery(video) {
    clearTimeout(recoveries.get(video));
    recoveries.delete(video);
  }

  function recoverPiP(video) {
    cancelRecovery(video);
    if (!settings.pip || !inPiP(video) || video.paused || blocked(video)) return;
    const time = video.currentTime;
    const source = video.currentSrc;
    const timer = setTimeout(() => {
      recoveries.delete(video);
      if (!settings.pip || !inPiP(video) || video.paused || video.ended ||
          video.currentSrc !== source || blocked(video) || video.seeking ||
          video.currentTime > time + 0.1 || video.closest('.ad-showing, .ad-interrupting')) return;
      // Re-enter YouTube's own resume path. Never reload src or lose the PiP window.
      const player = video.closest('#movie_player');
      if (typeof player?.playVideo === 'function') player.playVideo();
      if (video.readyState >= 2 && video.seekable.length) {
        const start = video.seekable.start(0);
        const end = video.seekable.end(video.seekable.length - 1);
        const position = Math.min(end - 0.01, Math.max(start, video.currentTime));
        if (position >= start) video.currentTime = position;
      }
      nativePlay.call(video).catch(() => {});
    }, 1800);
    recoveries.set(video, timer);
  }

  function bindVideo(video) {
    if (boundVideos.has(video)) return;
    boundVideos.add(video);
    video.addEventListener('pause', () => { cancelRecovery(video); schedule(); });
    video.addEventListener('volumechange', () => {
      if (mutedVideos.has(video) && !video.muted) video.muted = true;
    });
    video.addEventListener('webkitpresentationmodechanged', () => {
      if (inPiP(video) && !blocked(video)) recoverPiP(video);
      else cancelRecovery(video);
    });
    video.addEventListener('enterpictureinpicture', () => recoverPiP(video));
    video.addEventListener('leavepictureinpicture', () => cancelRecovery(video));
    video.addEventListener('ended', () => cancelRecovery(video));
  }

  function buildStyles() {
    if (!document.documentElement) return;
    if (!style) {
      style = document.createElement('style');
      style.id = 'better-youtube-style';
    }
    if (!style.isConnected) document.documentElement.append(style);
    const css = Object.entries(selectors).filter(([key]) => settings[key])
      .map(([, rules]) => `${rules.join(',')} { display: none !important; }`).join('\n');
    const full = `${css}
      #movie_player, #shorts-player { isolation:isolate; }
      .byt-cover { position:absolute; inset:0; z-index:2147483646; display:flex; flex-direction:column;
        align-items:center; justify-content:center; gap:12px; background:#000; color:#fff;
        font:16px/1.5 -apple-system,BlinkMacSystemFont,sans-serif; text-align:center; padding:24px; }
      .byt-cover[hidden] { display:none !important; }
      .byt-cover strong { font-size:22px; font-weight:500; }
      .byt-cover small { color:#aeb7b0; font-size:13px; }
      .byt-cover button { border:1px solid #ff0033; border-radius:30px; padding:12px 25px;
        background:#ff0033; color:#fff; font:600 16px -apple-system,BlinkMacSystemFont,sans-serif; cursor:pointer; }
      .byt-cover button:focus-visible { outline:3px solid #ff0033; outline-offset:4px; }
      #better-youtube-ad-cover button { position:static !important; transform:none !important; opacity:1 !important;
        background:#ff0033 !important; color:#fff !important; }
      #better-youtube-ad-cover button * { color:inherit !important; }
      #better-youtube-ad-cover button svg path { fill:currentColor; }`;
    if (style.textContent !== full) style.textContent = full;
  }

  function makeCover(id, player) {
    const cover = document.createElement('div');
    cover.id = id;
    cover.className = 'byt-cover';
    player.append(cover);
    return cover;
  }

  function visible(element) {
    return !!element && element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none';
  }

  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  function restoreSkip() {
    if (!skipPlacement) return;
    const { button, parent, next } = skipPlacement;
    parent.insertBefore(button, next?.parentNode === parent ? next : null);
    skipPlacement = null;
  }

  function updateAds(player, videos) {
    const active = settings.ads && player.matches('.ad-showing, .ad-interrupting');
    for (const [video, muted] of mutedVideos) {
      if (!active || !videos.includes(video)) {
        video.muted = muted;
        mutedVideos.delete(video);
      }
    }
    if (!active) {
      restoreSkip();
      attemptedSkip = null;
      adCover?.remove(); adCover = null;
      return;
    }
    for (const video of videos) {
      if (!mutedVideos.has(video)) mutedVideos.set(video, video.muted);
      if (!video.muted) video.muted = true;
    }
    if (!adCover || adCover.parentElement !== player) {
      restoreSkip();
      adCover?.remove();
      adCover = makeCover('better-youtube-ad-cover', player);
      const title = document.createElement('strong');
      title.textContent = 'A quiet moment.';
      adCover.append(title, document.createElement('span'), document.createElement('small'));
      adCover.setAttribute('role', 'status');
      adCover.setAttribute('aria-live', 'polite');
    }
    // Keep YouTube's localized countdown/count instead of inventing time or ad totals.
    const skip = [...player.querySelectorAll('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button')]
      .find(button => visible(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    const countdown = player.querySelector('.ytp-ad-preview-text, .ytp-ad-preview-container .ytp-ad-text');
    const remaining = player.querySelector('.ytp-ad-duration-remaining');
    const badge = player.querySelector('.ytp-ad-simple-ad-badge, .ytp-ad-text.ytp-ad-badge');
    setText(adCover.children[1], skip ? 'Trying to skip. If needed, click Skip below.' :
      countdown?.textContent.trim() || (remaining?.textContent.trim()
        ? `Ad time remaining: ${remaining.textContent.trim()}` : 'Waiting for YouTube to allow skipping…'));
    setText(adCover.children[2], badge?.textContent.trim() || 'YouTube has not provided an ad count.');
    // Keep the real control usable: current YouTube rejects synthetic Skip clicks.
    if (skip && skip.parentElement !== adCover) {
      restoreSkip();
      skipPlacement = { button: skip, parent: skip.parentNode, next: skip.nextSibling };
      adCover.append(skip);
    }
    if (skip && attemptedSkip !== skip) skip.click();
    attemptedSkip = skip;
  }

  function updateAutoplay(player) {
    if (!settings.distractions) {
      // Undo only the setting we changed, and only on the same still-disabled control.
      if (autoplayControl?.isConnected && autoplayControl.getAttribute('aria-checked') === 'false') autoplayControl.click();
      autoplayControl = null;
      return;
    }
    const control = player.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
    if (control) { control.click(); autoplayControl = control; }
  }

  function update() {
    scheduled = false;
    syncRoute();
    buildStyles();
    // Some search/category chips have no Shorts URL or semantic identifier.
    for (const tab of document.querySelectorAll('yt-chip-cloud-chip-renderer, yt-tab-shape, tp-yt-paper-tab, ytm-pivot-bar-item-renderer, ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer')) {
      tab.toggleAttribute('data-byt-shorts-tab', tab.textContent.trim() === 'Shorts');
    }
    const player = document.querySelector('#movie_player') || document.querySelector('#shorts-player') || document.querySelector('#player');
    if (!player) {
      restoreMuted();
      restoreSkip();
      attemptedSkip = null;
      adCover?.remove(); adCover = null;
      return;
    }
    const videos = [...player.querySelectorAll('video')];
    for (const video of videos) {
      bindVideo(video);
      if (blocked(video) && !video.paused) {
        if (!preferencesLoaded) pendingStarts.add(video);
        video.pause();
      }
    }
    updateAutoplay(player);
    updateAds(player, videos);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(update, 0);
  }

  document.addEventListener('better-youtube-settings', event => {
    let incoming;
    try { incoming = JSON.parse(event.detail); } catch { return; }
    for (const key of Object.keys(settings)) {
      if (typeof incoming?.[key] === 'boolean') settings[key] = incoming[key];
    }
    preferencesLoaded = true;
    finishLoading();
    for (const video of pendingStarts) {
      if (video.isConnected && !blocked(video)) nativePlay.call(video).catch(() => {});
    }
    pendingStarts.clear();
    if (!settings.ads) restoreMuted();
    if (!settings.pip) document.querySelectorAll('video').forEach(cancelRecovery);
    schedule();
  });
  // Capture native/autoplay starts too, including videos inserted before the next DOM scan.
  document.addEventListener('play', event => {
    const video = event.target;
    if (!isMainVideo(video)) return;
    bindVideo(video);
    if (!preferencesLoaded && location.pathname.startsWith('/shorts')) {
      pendingStarts.add(video); video.pause(); schedule(); return;
    }
    if (blocked(video)) video.pause();
    else recoverPiP(video);
    schedule();
  }, true);
  document.addEventListener('yt-navigate-finish', schedule);
  window.addEventListener('popstate', schedule);
  new MutationObserver(records => {
    if (records.some(record => !record.target.closest?.('.byt-cover, #better-youtube-style'))) schedule();
  }).observe(document, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'src', 'href', 'hidden', 'disabled', 'aria-disabled'], characterData: true });
  // Fallback for player updates that don't mutate DOM (also throttled by Safari in background tabs).
  setInterval(schedule, 500);
  document.dispatchEvent(new CustomEvent('better-youtube-ready'));
  schedule();
})();
