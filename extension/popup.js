(() => {
  const api = globalThis.browser || globalThis.chrome;
  const status = document.querySelector('#status');
  const inputs = [];
  for (const [key, title, description] of BetterYouTube.features) {
    const label = document.createElement('label');
    const copy = document.createElement('span');
    copy.className = 'copy';
    const name = document.createElement('span');
    name.className = 'title';
    name.id = `label-${key}`;
    name.textContent = title;
    const help = document.createElement('span');
    help.className = 'description';
    help.id = `help-${key}`;
    help.textContent = description;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.role = 'switch';
    input.name = key;
    input.disabled = true;
    input.setAttribute('aria-labelledby', name.id);
    input.setAttribute('aria-describedby', help.id);
    input.addEventListener('change', async () => {
      input.disabled = true;
      try {
        await api.storage.local.set({ [key]: input.checked });
        // Explicit notification also reaches Safari tabs without storage change events.
        const tabs = await api.tabs.query({ url: ['https://www.youtube.com/*', 'https://m.youtube.com/*'] });
        await Promise.all(tabs.map(tab => api.tabs.sendMessage(tab.id,
          { type: 'better-youtube-preferences-changed' }).catch(() => {})));
        status.textContent = `${title} ${input.checked ? 'enabled' : 'disabled'}. Saved.`;
      } catch {
        input.checked = !input.checked;
        status.textContent = 'Could not save. Please try again.';
      } finally { input.disabled = false; }
    });
    copy.append(name, help);
    label.append(copy, input);
    document.querySelector('#features').append(label);
    inputs.push(input);
  }
  api.storage.local.get(BetterYouTube.defaults).then(saved => {
    inputs.forEach(input => {
      input.checked = saved[input.name] !== false;
      input.disabled = false;
    });
  }).catch(() => { status.textContent = 'Could not load preferences. Reopen this popup to retry.'; });
})();
