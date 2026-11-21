const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const extension = path.join(root, 'extension');
const evidence = path.join(root, '.amp/in/artifacts');

// The storage API is substituted; DOM, video playback, events, CSS and timing are real WebKit.
async function storage(context) {
  await context.addInitScript(() => {
    const listeners = [];
    const messages = [];
    window.browser = {
      runtime: { onMessage: { addListener: listener => messages.push(listener) } },
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async (id, message) => messages.forEach(listener => listener(message))
      },
      storage: {
        onChanged: { addListener: listener => listeners.push(listener) },
        local: {
          get: async defaults => ({ ...defaults, ...JSON.parse(localStorage.getItem('preferences') || '{}') }),
          set: async values => {
            const old = JSON.parse(localStorage.getItem('preferences') || '{}');
            localStorage.setItem('preferences', JSON.stringify({ ...old, ...values }));
            const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) =>
              [key, { oldValue: old[key], newValue }]));
            if (!window.suppressStorageEvents) listeners.forEach(listener => listener(changes, 'local'));
          }
        }
      }
    };
  });
}

const fixture = `<!doctype html><html><head><style>
body { margin:30px; background:#f6f7f5; color:#20352a; font:16px -apple-system,sans-serif; }
#movie_player { position:relative; width:760px; height:428px; background:#202521; color:white; }
video { width:100%; height:100%; } .tile { display:block; margin:12px 0; padding:12px; background:#e2e8df; }
button { padding:8px; } #secondary { position:absolute; left:820px; top:90px; }
</style></head><body><h2>YouTube player fixture · Better YouTube</h2>
<ytd-watch-flexy><div id="player"><div id="movie_player"><video loop playsinline src="/media.mp4"></video>
<span class="ytp-ad-preview-text">You can skip in 5</span><span class="ytp-ad-simple-ad-badge">Ad 1 of 2</span>
<button class="ytp-ad-skip-button-modern" hidden>Skip ad</button>
<button class="ytp-autonav-toggle-button" aria-checked="true">Autoplay</button>
<div class="ytp-ce-element tile">End-of-video card</div><div class="html5-endscreen tile">End-screen wall</div>
<div class="ytp-ad-overlay-container tile">Ad pop-up</div></div></div>
<aside id="secondary" class="tile">Up next</aside><h3>Me at the zoo</h3>
<ytd-video-renderer id="ordinary" class="tile">An ordinary video</ytd-video-renderer>
<ytd-rich-item-renderer id="sponsor" class="tile"><ytd-ad-slot-renderer>Sponsored video</ytd-ad-slot-renderer></ytd-rich-item-renderer>
<ytd-reel-shelf-renderer id="shorts" class="tile">Shorts shelf</ytd-reel-shelf-renderer>
<ytd-video-renderer id="short-result" class="tile"><a href="/shorts/example">Shorts result</a></ytd-video-renderer>
<yt-chip-cloud-chip-renderer id="short-chip" class="tile">Shorts</yt-chip-cloud-chip-renderer>
<ytd-guide-entry-renderer id="short-guide" class="tile"><a title="Shorts">Shorts</a></ytd-guide-entry-renderer>
<grid-shelf-view-model id="short-grid" class="tile"><h2>Shorts</h2><a href="/shorts/grid">A short</a></grid-shelf-view-model>
<ytd-comments id="comments" class="tile">Comments</ytd-comments></ytd-watch-flexy>
<input id="search" aria-label="Search"></body></html>`;

async function setup(page, context, preferences = {}) {
  await storage(context);
  await context.route('https://www.youtube.com/**', async route => {
    if (route.request().url().endsWith('/media.mp4')) {
      return route.fulfill({ path: path.join(__dirname, 'media.mp4'), contentType: 'video/mp4' });
    }
    return route.fulfill({ body: fixture, contentType: 'text/html' });
  });
  await page.goto('https://www.youtube.com/watch?v=fixture');
  await page.evaluate(values => localStorage.setItem('preferences', JSON.stringify(values)), preferences);
  await page.evaluate(() => {
    const control = document.querySelector('.ytp-autonav-toggle-button');
    control.addEventListener('click', () => control.setAttribute('aria-checked',
      control.getAttribute('aria-checked') === 'true' ? 'false' : 'true'));
  });
  for (const file of ['defaults.js', 'player.js', 'settings.js']) {
    await page.addScriptTag({ path: path.join(extension, file) });
  }
  await expect(page.locator('#better-youtube-style')).toBeAttached();
}

async function settings(page, values) {
  await page.evaluate(values => browser.storage.local.set(values), values);
}

test('each hiding switch is reversible and leaves ordinary videos alone', async ({ page, context }) => {
  await setup(page, context);
  for (const [key, selectors] of Object.entries({
    ads: ['#sponsor', '.ytp-ad-overlay-container'],
    distractions: ['#secondary', '.ytp-ce-element', '.html5-endscreen'],
    shorts: ['#shorts', '#short-result', '#short-chip', '#short-guide', '#short-grid'], comments: ['#comments']
  })) {
    for (const selector of selectors) await expect(page.locator(selector)).toBeHidden();
    await settings(page, { [key]: false });
    for (const selector of selectors) await expect(page.locator(selector)).toBeVisible();
    await settings(page, { [key]: true });
    for (const selector of selectors) await expect(page.locator(selector)).toBeHidden();
  }
  await expect(page.locator('#ordinary')).toBeVisible();
  await page.evaluate(() => {
    const item = document.createElement('ytd-reel-shelf-renderer');
    item.id = 'dynamic-short'; item.textContent = 'New Shorts'; document.body.append(item);
  });
  await expect(page.locator('#dynamic-short')).toBeHidden();
});

for (const originallyMuted of [false, true]) {
  test(`ad sequence covers, counts, skips and restores muted=${originallyMuted}`, async ({ page, context }) => {
    await setup(page, context);
    await page.evaluate(muted => {
      const player = document.querySelector('#movie_player');
      player.querySelector('video').muted = muted;
      player.classList.add('ad-showing');
      window.skipped = 0;
      player.querySelector('.ytp-ad-skip-button-modern').onclick = () => {
        window.skipped++;
        if (window.skipped === 1) {
          player.querySelector('.ytp-ad-simple-ad-badge').textContent = 'Ad 2 of 2';
          player.querySelector('.ytp-ad-skip-button-modern').hidden = true;
        } else { player.classList.remove('ad-showing'); }
      };
    }, originallyMuted);
    await expect(page.locator('#better-youtube-ad-cover')).toContainText('You can skip in 5');
    await expect(page.locator('#better-youtube-ad-cover')).toContainText('Ad 1 of 2');
    await expect.poll(() => page.locator('video').evaluate(v => v.muted)).toBe(true);
    expect(await page.evaluate(() => window.skipped)).toBe(0);
    await page.locator('.ytp-ad-skip-button-modern').evaluate(button => button.hidden = false);
    await expect.poll(() => page.evaluate(() => window.skipped)).toBe(1);
    await expect(page.locator('#better-youtube-ad-cover')).toContainText('Ad 2 of 2');
    await page.locator('.ytp-ad-skip-button-modern').evaluate(button => button.hidden = false);
    await expect.poll(() => page.evaluate(() => window.skipped)).toBe(2);
    await expect(page.locator('#better-youtube-ad-cover')).toHaveCount(0);
    await expect.poll(() => page.locator('video').evaluate(v => v.muted)).toBe(originallyMuted);
  });
}

test('a real Skip click remains usable when YouTube rejects automatic clicks', async ({ page, context }) => {
  await setup(page, context);
  await page.evaluate(() => {
    const player = document.querySelector('#movie_player');
    const button = player.querySelector('.ytp-ad-skip-button-modern');
    button.hidden = false;
    button.onclick = event => {
      if (event.isTrusted) player.classList.remove('ad-showing');
    };
    player.classList.add('ad-showing');
  });
  await expect(page.locator('#better-youtube-ad-cover')).toBeVisible();
  fs.mkdirSync(evidence, { recursive: true });
  await page.locator('#movie_player').screenshot({ path: path.join(evidence, 'manual-skip-fixture.png') });
  await page.getByRole('button', { name: 'Skip ad', exact: true }).click();
  await expect(page.locator('#better-youtube-ad-cover')).toHaveCount(0);
  await expect.poll(() => page.locator('video').evaluate(v => v.muted)).toBe(false);
  await expect(page.getByRole('button', { name: 'Skip ad', exact: true })).toBeVisible();
});

test('disabling ads during a break and replacing the video restore the old mute state', async ({ page, context }) => {
  await setup(page, context);
  await page.locator('#movie_player').evaluate(p => p.classList.add('ad-showing'));
  await expect.poll(() => page.locator('video').evaluate(v => v.muted)).toBe(true);
  await page.evaluate(() => {
    window.oldVideo = document.querySelector('video');
    oldVideo.replaceWith(oldVideo.cloneNode());
  });
  await expect.poll(() => page.evaluate(() => oldVideo.muted)).toBe(false);
  await expect.poll(() => page.locator('video').evaluate(v => v.muted)).toBe(true);
  await settings(page, { ads: false });
  await expect.poll(() => page.locator('video').evaluate(v => v.muted)).toBe(false);
  await expect(page.locator('#better-youtube-ad-cover')).toHaveCount(0);
});

test('ad information is honest when countdown and total are unavailable', async ({ page, context }) => {
  await setup(page, context);
  await page.evaluate(() => {
    document.querySelector('.ytp-ad-preview-text').remove();
    document.querySelector('.ytp-ad-simple-ad-badge').remove();
    document.querySelector('#movie_player').classList.add('ad-showing');
  });
  await expect(page.locator('#better-youtube-ad-cover')).toContainText('Waiting for YouTube');
  await expect(page.locator('#better-youtube-ad-cover')).toContainText('not provided an ad count');
});

test('ordinary videos play without a gate before settings load and after navigation', async ({ page, context }) => {
  await setup(page, context, { clickToPlay: true }); // Ignore an obsolete saved preference.
  const attempt = () => page.locator('video').evaluate(v => v.play().then(() => 'playing', e => e.name));
  expect(await attempt()).toBe('playing');
  await expect(page.getByRole('button', { name: 'Play video' })).toHaveCount(0);
  await expect.poll(() => page.locator('video').evaluate(v => v.paused)).toBe(false);
  const initial = await page.locator('video').evaluate(v => v.currentTime);
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(initial + .1);
  await page.evaluate(() => {
    history.pushState({}, '', '/watch?v=second');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  expect(await attempt()).toBe('playing');
  await page.reload();
  for (const file of ['defaults.js', 'player.js']) {
    await page.addScriptTag({ path: path.join(extension, file) });
  }
  expect(await attempt()).toBe('playing');
  await page.addScriptTag({ path: path.join(extension, 'settings.js') });
  await expect.poll(() => page.locator('video').evaluate(v => v.paused)).toBe(false);
});

for (const shorts of [false, true]) {
  test(`early Shorts playback respects saved shorts=${shorts}`, async ({ page, context }) => {
    await setup(page, context, { shorts });
    await page.goto('https://www.youtube.com/shorts/example');
    for (const file of ['defaults.js', 'player.js']) await page.addScriptTag({ path: path.join(extension, file) });
    await page.evaluate(() => {
      const v = document.querySelector('video');
      v.muted = true;
      window.earlyPlayback = v.play().then(() => 'playing', error => error.name);
    });
    await page.addScriptTag({ path: path.join(extension, 'settings.js') });
    expect(await page.evaluate(() => window.earlyPlayback)).toBe(shorts ? 'NotAllowedError' : 'playing');
    await expect.poll(() => page.locator('video').evaluate(v => v.paused)).toBe(shorts);
  });
}

test('direct Shorts cannot play even after a play request, but switch off restores it', async ({ page, context }) => {
  await setup(page, context);
  await page.evaluate(() => history.pushState({}, '', '/shorts/example'));
  expect(await page.locator('video').evaluate(v => v.play().catch(e => e.name))).toBe('NotAllowedError');
  await settings(page, { shorts: false });
  await page.locator('video').evaluate(v => v.play());
  await expect.poll(() => page.locator('video').evaluate(v => v.paused)).toBe(false);
});

test('autoplay control is disabled and restored only if originally enabled', async ({ page, context }) => {
  await setup(page, context);
  const control = page.locator('.ytp-autonav-toggle-button');
  await expect(control).toHaveAttribute('aria-checked', 'false');
  await settings(page, { distractions: false });
  await expect(control).toHaveAttribute('aria-checked', 'true');
  await control.click();
  await settings(page, { distractions: true });
  await settings(page, { distractions: false });
  await expect(control).toHaveAttribute('aria-checked', 'false');
});

test('PiP recovery targets a stalled resume, cancels on pause and obeys its switch (simulated PiP)', async ({ page, context }) => {
  await setup(page, context);
  await page.evaluate(() => {
    const v = document.querySelector('video');
    v.muted = true;
    // Simulate a native PiP resume that says playing but has not restarted the media.
    // The recovery must actually start the real H.264 video, not just call a mock.
    Object.defineProperties(v, {
      webkitPresentationMode: { configurable: true, value: 'picture-in-picture' },
      paused: { configurable: true, value: false }
    });
    v.dispatchEvent(new Event('play'));
  });
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  await settings(page, { pip: false });
  await page.locator('video').evaluate(v => { v.pause(); v.dispatchEvent(new Event('play')); });
  const pausedTime = await page.locator('video').evaluate(v => v.currentTime);
  await page.waitForTimeout(2100);
  expect(await page.locator('video').evaluate(v => v.currentTime)).toBeCloseTo(pausedTime, 1);
  await settings(page, { pip: true });
  await page.locator('video').evaluate(v => {
    v.dispatchEvent(new Event('play'));
    Object.defineProperty(v, 'paused', { configurable: true, value: true });
    v.dispatchEvent(new Event('pause'));
  });
  await page.waitForTimeout(2100);
  expect(await page.locator('video').evaluate(v => v.currentTime)).toBeCloseTo(pausedTime, 1);
});

test('player covers do not obscure page-level consent dialogs', async ({ page, context }) => {
  await setup(page, context);
  await page.evaluate(() => {
    document.querySelector('#movie_player').classList.add('ad-showing');
    const dialog = document.createElement('div');
    dialog.id = 'consent';
    dialog.textContent = 'Consent';
    dialog.style.cssText = 'position:fixed;inset:100px;z-index:2200;background:white';
    document.body.append(dialog);
  });
  expect(await page.evaluate(() => document.elementFromPoint(300, 200).id)).toBe('consent');
});

test('popup saves all five switches, survives reload, and renders light/dark states', async ({ page, context }) => {
  await storage(context);
  await context.route('https://extension.test/**', route => {
    const file = new URL(route.request().url()).pathname.slice(1) || 'popup.html';
    return route.fulfill({ path: path.join(extension, file) });
  });
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto('https://extension.test/popup.html');
  await expect(page.getByRole('switch')).toHaveCount(5);
  await expect(page.getByRole('switch', { name: 'Wait for play', exact: true })).toHaveCount(0);
  for (const input of await page.getByRole('switch').all()) await expect(input).toBeChecked();
  expect(await page.locator('footer').evaluate(footer => footer.getBoundingClientRect().bottom)).toBeLessThanOrEqual(600);
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: path.join(evidence, 'popup-default.png'), fullPage: true });
  for (const input of await page.getByRole('switch').all()) await input.uncheck();
  await page.reload();
  for (const input of await page.getByRole('switch').all()) await expect(input).not.toBeChecked();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: path.join(evidence, 'popup-disabled-dark.png'), fullPage: true });
});

test('popup changes reach an open player without storage change broadcasts', async ({ page, context }) => {
  await setup(page, context);
  await page.evaluate(() => {
    window.suppressStorageEvents = true;
    const controls = document.createElement('section');
    controls.innerHTML = '<div id="features"></div><p id="status"></p>';
    document.body.prepend(controls);
  });
  await page.addScriptTag({ path: path.join(extension, 'popup.js') });
  const toggle = page.getByRole('switch', { name: 'No comments', exact: true });
  await expect(page.locator('#comments')).toBeHidden();
  await toggle.uncheck();
  await expect(page.locator('#comments')).toBeVisible();
  await toggle.check();
  await expect(page.locator('#comments')).toBeHidden();
});

test('render ad cover state', async ({ page, context }) => {
  await setup(page, context);
  fs.mkdirSync(evidence, { recursive: true });
  await page.locator('#movie_player').evaluate(p => p.classList.add('ad-showing'));
  await expect(page.locator('#better-youtube-ad-cover')).toBeVisible();
  await page.locator('#movie_player').screenshot({ path: path.join(evidence, 'ad-cover.png') });
});
