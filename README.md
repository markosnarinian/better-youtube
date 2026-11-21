# Better YouTube

A Safari Web Extension with five independent, persistent toolbar switches. All are enabled by default. It only requests access to `www.youtube.com`, `m.youtube.com`, and local extension storage. No account, analytics, remote code, or network-blocking permissions.

## Features

- **Quiet ads:** cover the player in black, mute ad playback, attempt to click the first visible/enabled Skip button, and restore the video’s prior mute state. The cover relays YouTube’s localized skip countdown and ad position/count when available, including multi-ad breaks. Sponsored slots and player promotions are hidden. **This Mac's current YouTube player rejects automatic Skip clicks.** Its real Skip button remains usable on the cover, so a manual click can finish the ad without uncovering or unmuting it. Automatic skipping is best-effort, not guaranteed.
- **No rabbit holes:** hide the recommendations sidebar, Up next, end screens, cards, next-video button, and autoplay cues. Disable YouTube’s autoplay control when it is enabled; switching this feature off restores the control if this extension disabled it.
- **PiP resume recovery:** after a PiP play event, check whether playback is progressing. If it is stalled, retry YouTube’s resume path and the native media play operation, with a bounded seek within the existing stream. Pausing cancels recovery. It never periodically resumes an intentionally paused video or reloads the video source.
- **No Shorts:** hide Shorts navigation, shelves, cards, search results and category chips; prevent playback on a direct `/shorts/` URL. A direct Shorts page may appear empty rather than redirecting you.
- **No comments:** hide the comments section and comments engagement panels.

Changes apply to already-open tabs after the extension is loaded and site access is granted. New navigation, inserted content, and replaced video elements are handled without reloading the page. Turning a hiding feature off reveals its content again.

The click-to-play feature has been removed: ordinary videos follow YouTube and Safari's normal playback behavior, including on navigation. Hiding Shorts still prevents direct Shorts playback. The popup, icon, switches, focus rings, and ad-cover Skip control use YouTube red (`#ff0033`).

## Load on this Mac (Safari 26 or later)

1. In Safari → Settings → Advanced, enable **Show features for web developers**.
2. In Settings → Developer, click **Add Temporary Extension…**. Authenticate Safari’s request to allow unsigned extensions yourself.
3. Select `/Users/markos/better-youtube/extension` (the folder containing `manifest.json`), or `dist/Better YouTube.zip`.
4. Enable **Better YouTube** in Settings → Extensions, and allow it on YouTube.
5. Reload existing YouTube tabs once. Click the Better YouTube toolbar icon to see the five switches. After source updates, use Settings → Extensions → Better YouTube → Reload, then reload YouTube tabs to remove previously injected code.

Apple removes temporary extensions when Safari quits or after 24 hours. **This is a development-loadable extension, not a permanently installed/signed Mac app.**

For a permanent installation, install full Xcode and use Apple’s packager, then choose your signing team and build the generated macOS app:

```sh copy Copy Packaging Command
xcrun safari-web-extension-packager ./extension --app-name "Better YouTube" --bundle-identifier com.betteryoutube.extension --macos-only --swift --project-location ./dist --no-open
```

Full Xcode is not installed on this machine, and distribution signing has not been configured for this project. Command Line Tools alone do not include the packager. No app has been published, signed for distribution, or submitted to Apple.

## Automated checks

With Node.js 24 or newer:

```sh copy Copy Test Commands
npm ci
npx playwright install webkit
npm test
npm run package
```

The test suite uses real WebKit DOM, CSS, events, and a locally generated H.264 video. It substitutes the extension storage API and deterministic YouTube-shaped markup. PiP state/stalled resume is simulated; actual native PiP is not automated by these tests. These are browser integration tests, **not proof that Safari has loaded the extension**.

The checked-in media fixture is generated locally, without third-party content. To regenerate it on macOS, run `swift scripts/test-media.swift`. To regenerate icons, run `swift scripts/icons.swift`.

## Click-to-play removal and red theme verification

The revised suite passes 16 WebKit integration tests. Ordinary videos play before preferences finish loading and after in-page navigation, even with an obsolete saved `clickToPlay: true` setting. Direct Shorts still obey their own switch, including when saved preferences arrive late. The popup has five persistent switches. Light/dark popup renders and the red manual-Skip control were captured and inspected. After reloading the installed Safari extension, a fresh watch-page navigation loaded the red styles, showed no Play gate, and played the 19.01-second video to its end without accepting a gate. The ZIP is rebuilt and checked against the source files.

## Original build verification on November 20, 2026

- **17 WebKit integration tests passed.** Coverage: reversible hiding, ordinary-video control case, dynamically inserted Shorts, current Shorts navigation and grid shelves, two-ad skipping, originally-muted and originally-unmuted restoration, disabling during a break, replaced video elements, unavailable ad metadata, actual H.264 playback, navigation reset, keyboard search isolation, early playback before saved settings load (both on/off), direct Shorts, autoplay restoration, consent-dialog layering, six popup switches and persistence, immediate popup updates without storage change broadcasts, a trusted manual Skip fallback, and simulated PiP recovery/cancellation.
- A live, signed-out YouTube watch page was opened in WebKit on this Mac. The scripts were injected directly and the settings bridge supplied defaults, rather than installing a Safari extension. DOM observations confirmed a paused video and hidden sidebar/comments; clicking Play started the real video and advanced playback to approximately 3.83 seconds with `readyState: 4` and no media error. This does not exercise Safari’s toolbar, extension storage, permissions, or native PiP. No live ad break was observed.
- Rendered popup, play-gate, and ad-cover screenshots were captured and inspected. Local evidence is under `.amp/in/artifacts/`; the Playwright report is under `playwright-report/`.
- The temporary extension was subsequently **loaded and enabled in Safari 27.2 on this Mac**, with YouTube site access. Accessibility clicks and Apple Events exercised the installed extension, rather than injected replacement scripts. All six actual toolbar switches saved their state and survived reopening/reloading. Autoplay was blocked on the watch page, and sidebar/comments hiding was observed.
- On live Safari Search results, turning Quiet ads and No Shorts off exposed one ad slot and 40 Shorts links; turning them on hid that slot and all 40 links without reloading. Turning No comments off restored the real comments element (`display: block`), while the sidebar remained hidden.
- Live Safari Home had five ad slots, all hidden, and no visible Shorts links. On a second watch page, disabling No rabbit holes restored the sidebar while comments stayed hidden; re-enabling it hid the sidebar. Disabling Wait for play and reloading allowed playback, advancing to 15.18 seconds, while its enabled state showed the Play gate and kept the video paused.
- A real streaming ad was covered and muted in Safari, including fullscreen. A trusted Skip click ended the ad and restored `muted: false`. Inspection of the exact served YouTube player (`6b3d0364`) confirmed that its Skip handler rejects events with `isTrusted === false`; synthetic clicks did not skip. The extension now tries only once per ready control and preserves the actual button on the black cover for a manual click. This is a documented gap from fully automatic skipping.
- Native Safari PiP was paused at 3 seconds and backgrounded for just over five minutes. Resuming via the native PiP Play button advanced playback to 8.72 seconds; two inspected PiP captures show different video frames, without returning to the original tab. The intermittent freeze was not reproduced, so recovery is best-effort rather than a proven fix. An earlier run was discarded because the initial Play gate had not been accepted.
- Real Safari checks found and fixed a clipped popup at Safari's 600px height limit, and missing delivery of storage change events to open tabs. The popup now explicitly notifies YouTube tabs after saving. Live inspection also identified href-less Shorts navigation and a newer grid-shelf heading, now covered by regression tests.
- Automation, Accessibility, screen capture, and JavaScript-from-Apple-Events permissions were approved interactively. Safari WebDriver still could not establish a session; native checks used Accessibility and Apple Events instead.

### Remaining real-Safari acceptance

The live player did not provide the exact skip countdown or ad count, and automatic skipping was rejected. Countdown/count display and automatic multi-ad sequencing were therefore verified with deterministic fixtures, not confirmed for this live player. The PiP freeze's cause has not been established and its fix is **not yet proven**. Every account/region-specific YouTube layout has not been exhaustively tested.

## Important limits

- YouTube changes its markup and runs account/region-specific experiments. Selectors cover known placements; “every trace” of Shorts or every promotional format cannot be guaranteed indefinitely.
- This does not remove ads from the stream, bypass unskippable ads, dismiss consent/sign-in dialogs, or bypass YouTube’s ad-block enforcement. It skips only when YouTube exposes an enabled Skip button.
- YouTube sometimes does not expose an exact skip countdown or ad total. The cover explicitly reports that information as unavailable instead of inventing numbers.
- A DOM overlay cannot cover Safari’s **native PiP window**. Ad muting still applies, but the black overlay is for the webpage player.
- Safari may suspend background pages. JavaScript cannot recover playback while the browser has fully suspended the page, and OS-level PiP decoder failures may require a Safari fix.

Apple documentation: [Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension) · [Packaging a web extension](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari).
