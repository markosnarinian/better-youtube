(() => {
  const api = globalThis.browser || globalThis.chrome;
  let settings = { ...BetterYouTube.defaults };
  let loaded = false;
  const send = () => loaded && document.dispatchEvent(new CustomEvent('better-youtube-settings', {
    detail: JSON.stringify(settings)
  }));
  document.addEventListener('better-youtube-ready', send);
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(settings)) {
      if (key in changes) settings[key] = typeof changes[key].newValue === 'boolean'
        ? changes[key].newValue : BetterYouTube.defaults[key];
    }
    send();
  });
  // Safari temporary extensions may not broadcast storage changes to content scripts.
  api.runtime.onMessage.addListener(message => {
    if (message?.type === 'better-youtube-preferences-changed') load();
  });
  function load() {
    return api.storage.local.get(BetterYouTube.defaults).then(saved => {
      for (const key of Object.keys(settings)) {
        if (typeof saved[key] === 'boolean') settings[key] = saved[key];
      }
      loaded = true;
      send();
    }).catch(error => {
      console.warn('Better YouTube: unable to load settings; using defaults', error);
      loaded = true;
      send();
    });
  }
  load();
})();
