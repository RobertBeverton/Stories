# Spike 0a: audio on a locked phone and tablet

This is a human test on real devices. It decides whether the Stories app gets a
router with one persistent audio player (design doc, section 1, "Shell" and
"Player"), or the fallback of a player on each story page. See
[the design](../plans/2026-11-03-stories-app-redesign-design.md) (Rollout, step 0a)
and WP-S in [the implementation plan](../plans/2026-11-03-stories-app-redesign-implementation.md).

The test page is `site/spikes/audio-spike.html`. It is one file with no network
requests: the audio (two tracks, in two flavours), the icon and the manifest are
all embedded. It is published at:

    https://robertbeverton.github.io/Stories/spikes/audio-spike.html

Lock-screen controls need a secure context, so the page must be tested from that
HTTPS URL, not from `localhost` files or a copy on the device.

## 1. Deploy the page (one time, about 5 minutes)

The page only exists on the live site once it is on `main`. The build workflow
(`.github/workflows/build.yml`) runs on every push to `main`, builds with
`npm run build`, and the `deploy` job publishes `_site/` to GitHub Pages.

The branch `wp/spike` was cut from the scaffold commit, so a pull request from it
would also carry the scaffold. Use a clean branch with just the spike commit:

```bash
git fetch origin
git checkout -b spike-deploy origin/main
git cherry-pick <the single commit on wp/spike that adds the two spike files>
git push -u origin spike-deploy
gh pr create --base main --head spike-deploy --title "Add audio spike page" --body "Adds site/spikes/audio-spike.html and docs/spikes/audio-spike.md only."
```

Then:

1. Check the pull request shows exactly two changed files (`site/spikes/audio-spike.html` and `docs/spikes/audio-spike.md`). The workflow also runs on the pull request as a build check.
2. Merge the pull request. This pushes to `main` and starts "Build and Deploy".
3. Open the repository's Actions tab and wait for "Build and Deploy" to go green (the `deploy` job shows the URL).
4. On a computer, open `https://robertbeverton.github.io/Stories/spikes/audio-spike.html`. You should see "Audio spike", a "This device" box and the buttons. If you get a 404, the deploy has not finished; wait a minute and reload.

The page is `noindex` and is not linked from the site. Remove it after the spike
(delete the two files in a later pull request).

## 2. What to write down first

Before testing, fill in the device block (the page's "This device" box also shows
most of this):

| Item | Phone | Tablet |
|---|---|---|
| Model (for example iPhone 13, iPad 9th gen, Pixel 8, Galaxy Tab S8) | | |
| Platform (iOS, iPadOS or Android) | | |
| OS version (Settings, General, About, or Settings, About phone) | | |
| Browser used for the tab test (Safari on Apple, Chrome on Android) | | |
| Low Power Mode, or Battery saver / Battery optimisation for the browser | off | off |
| Auto-Lock / screen timeout set to | 30 seconds | 30 seconds |

Tips that apply to every test:

- Turn the device volume up to about half, and silent switch off (iPhone and iPad: the ring/silent switch or the Control Centre mute). The default track is a very quiet tone, so you should hear a faint wobbling hum in a quiet room. If you hear nothing at all, raise the volume and check again.
- Do the whole script once with "Quiet tone" (the default), then repeat checks 3 to 6 with "Pure silence". Some platforms treat a silent track as not-playing and suspend it. If silence behaves worse than the tone, that is a finding, so record it.
- "Lock the screen" means press the side/power button once. Do not swipe the browser away and do not switch to another app unless a step says so.
- To read the log while locked, you cannot: unlock after the wait and read the log. That is the point. Lines with GAP or DRIFT show where JavaScript was frozen.
- Before each device run, tap "Clear log" so the results belong to that run.
- To keep results, tap "Copy log" and paste it into a note or message to yourself. If copy fails, tap "Select all" and use the Copy option in the pop-up menu.

## 3. The checks, defined

| # | Check | What the page does | PASS looks like | FAIL looks like |
|---|---|---|---|---|
| 1 | Playback continues while locked | Play track A, lock for 2 minutes | Audio is audible (tone) or the lock screen shows it playing for the whole 2 minutes, and no PAUSE event is logged by the system | Playback stops, the lock screen controls vanish, or a `pause` event appears you did not cause |
| 2 | `timeupdate` while locked | Logs a line every 5 s of wall time with the count of events | Log lines continue at roughly 5 s spacing across the whole locked period, and no GAP line | A GAP line, or timestamps jump across the locked period |
| 3 | `ended` while locked | Track B is 15 s. Play B, lock at once. Auto-advance is on | An `EVENT ended` line stamped about 15 s after play while `hidden=true`, followed by a `LOAD` of track A and `play() resolved` | `ended` is missing until you unlock, or logged late (stamp after you unlocked), or `play() REJECTED` |
| 4 | 60 s `setTimeout` while locked | "Start 60 s timer", then lock with audio playing | `TIMER fired after 60.0x s ... hidden=true`, late by under 2 s | Fired late by more than 5 s, or only fires after you unlock |
| 5 | Previous and next from the lock screen | Tap the lock screen next and previous buttons while audio plays | `MEDIASESSION nexttrack handler fired` and `previoustrack` lines with `hidden=true`, the track swaps (A to B and back) and audio continues | Buttons absent or greyed, no log line, or the log line appears but audio stops |
| 6 | Pause for 30 s, then resume | "Pause 30 s then resume" (the page's own timer), and separately the lock-screen pause then play after 30 s | `PAUSE-TEST play() resolved` and playback resumes from the same position (media position unchanged +/- 1 s). Lock-screen play after 30 s: `MEDIASESSION play handler fired` and `EVENT play after 30.x s paused` | `play() REJECTED` (NotAllowedError), no resume, the media position reset, or the lock-screen controls disappeared after the pause |
| 7 | Installed icon vs Safari tab | Repeat 1 to 6 from the installed icon | Same results as in the tab | Better or worse than the tab: record which and how |

## 4. Script A: Safari tab (iPhone, then iPad)

Use Safari, in a normal tab (not Private). Do the phone first, then the iPad.

1. Open `https://robertbeverton.github.io/Stories/spikes/audio-spike.html` in Safari. The "This device" box must say `Secure context: true` and `Installed / standalone: false`.
2. Tap "Clear log".
3. Leave "Quiet tone" selected and "On ended" checked.
4. Tap "Load and play A (4 min)". You should hear the faint hum and the clock should count up.
5. Check 5 first, while unlocked: pull down Control Centre. The now-playing card shows "Track A (4 min)" with Previous and Next. Leave it. Tap "Next" on the page: the title changes to Track B; tap "Previous" to return to Track A. Tap "Load and play A (4 min)" again to restart at the start of A.
6. Tap "Start 60 s timer". Immediately press the side button to lock the screen. Wait 70 seconds on a timer (use another device or a watch). Do not touch the locked phone for the first 60 seconds.
7. At 70 s, wake the screen and look at the lock screen. Record whether the now-playing controls are still there and whether the clock/audio were still playing (check 1). Do not unlock yet. Press the lock-screen next button once, wait 5 seconds, press previous once, wait 5 seconds. (check 5)
8. Unlock and return to Safari. Read the log. Look for `TIMER fired` (check 4), `timeupdate x` lines during the locked period and any GAP or DRIFT line (check 2), and the two `MEDIASESSION` lines (check 5). Record in the results table.
9. Check 3: tap "Clear log". Tap "Load and play B (15 s)", and press the side button at once. Wait 40 seconds. Unlock. Read the log. Look for `EVENT ended`, its stamp and `hidden=true`, then `LOAD Track A`, then `play() resolved` or `play() REJECTED`. (If the auto-advance started A, the audio should now be playing A.)
10. Check 6, part one (page timer): tap "Load and play A (4 min)". Tap "Pause 30 s then resume". Lock the screen. Wait 45 seconds. Unlock. Read the log. Look for `PAUSE-TEST 30 s timer fired`, `play() resolved` or `REJECTED`, and the media position before and after.
11. Check 6, part two (lock-screen control): with A playing, lock the screen, press pause on the lock screen, wait 40 seconds (screen stays locked), press play on the lock screen, wait 10 seconds. Unlock. Read the log. Look for `EVENT pause`, `EVENT play  after 4x.x s paused` and the media position.
12. Tap "Copy log" and paste it somewhere you can send back. Also record the "This device" box.
13. Switch the radio to "Pure silence" and repeat steps 4 to 11 (clear the log first). Record differences. If silence is suspended or the lock screen controls disappear, that is a finding.

Repeat the same 13 steps on the tablet. On an Android tablet use Chrome in a normal tab, where "lock the screen" means the power button. Android also needs: Settings, Apps, Chrome, Battery, set to "Unrestricted" for one run and "Optimised" (the default) for another, and record which gave which result.

## 5. Script B: installed icon (iPhone and iPad)

Why: installed web apps on iOS (the Home Screen version) are a different process from Safari and have long-standing reports of audio and Media Session problems when backgrounded.

1. In Safari, open `https://robertbeverton.github.io/Stories/spikes/audio-spike.html` (the exact page, not the Stories home page).
2. Tap Share, then "Add to Home Screen". Keep the name "Audio Spike". Make sure "Open as Web App" is on if it is offered. Tap Add.
3. Close Safari fully (swipe it away from the app switcher).
4. Open the new "Audio Spike" icon on the Home Screen. The "This device" box must now say `Installed / standalone: true`. If it says false, the page opened in Safari, not in the icon: delete the icon and redo step 2 from the exact page URL.
5. Tap "Clear log". Run steps 3 to 12 of Script A, with these two additions: (a) after step 6, before locking, note that there is no browser address bar (this is the installed mode); (b) in step 8, "return to the app" means opening the Audio Spike icon again, and if the app has restarted (the log shows `---- page opened ----` a second time during the test), that is a FAIL for that check, so write it in the results.
6. Repeat the check 3 to 6 with "Pure silence" as in step 13 of Script A.
7. Tap "Copy log" and paste it where you can send it.

## 6. Script C: installed app on Android (Chrome, phone and tablet)

1. In Chrome, open `https://robertbeverton.github.io/Stories/spikes/audio-spike.html`.
2. Open the Chrome menu (three dots). Choose "Install app" if it is offered. If only "Add to Home screen" is offered, choose that, then choose "Install" if asked, otherwise "Add". Write which wording you saw.
3. Close the Chrome tab. Open the new "Spike" icon. The "This device" box must say `Installed / standalone: true`. If it says false, it opened in Chrome as a shortcut: record that "Install app" was not available (this is useful information, not a failure of audio).
4. Tap "Clear log" and run steps 3 to 12 of Script A. In step 8, "return" means opening the Spike icon again, and a second `---- page opened ----` line in the log during the test is a FAIL for that check.
5. Repeat with "Pure silence", and repeat with Chrome's battery setting as described in Script A (Unrestricted vs Optimised).

## 7. Results tables

Copy one block per device and mode. Write PASS, FAIL or N/A, plus the evidence (a
log line, or what you saw). N/A is only for checks that could not be run (say why).

Device: ______________  OS: ______________  Mode: tab / installed  Track: tone / silence

| # | Check | Result | Evidence (paste the log line or describe) |
|---|---|---|---|
| 1 | Playback continues while locked (2 min) | | |
| 2 | `timeupdate` fires while locked, no GAP | | |
| 3 | `ended` fires while locked, then `play()` of the next track resolves | | |
| 4 | 60 s `setTimeout` fires on time while locked | | |
| 5 | Lock-screen previous and next call the handlers and swap tracks | | |
| 6a | Page timer: pause 30 s then `play()` resumes | | |
| 6b | Lock-screen pause for 30 s then play resumes | | |
| 7 | App did not restart or reload during the run | | |

Summary table across the whole spike:

| Device | Mode | Tone result | Silence result | Notes |
|---|---|---|---|---|
| iPhone, Safari tab | | | | |
| iPhone, installed icon | | | | |
| iPad or Android tablet, browser tab | | | | |
| Tablet, installed icon | | | | |
| Android phone, installed (if any) | | | | |

## 8. Decision rubric (maps to the design)

The router with a persistent audio shell proceeds only if the devices your family
actually uses pass the checks that the shell depends on.

Definitions, applied to each device you care about, in the mode you will actually use (installed icon, if that is how it is used; otherwise tab):

- Core checks: 1, 2, 3, 5, 6b. These decide whether the persistent shell (one `<audio>` that survives navigation, driven by Media Session) is viable.
- Timing check: 4. This decides how the sleep timer is designed, not whether the shell proceeds.
- Stability check: 7. The app must not restart while locked.

PASS (proceed with WP-D: router and persistent audio shell):

- All core checks pass, and check 7 passes, on both the phone and the tablet in the mode used day to day, with the Quiet tone track. Silence passing too is a bonus; if only the tone passes, the shell ships with a quiet-tone keepalive decision, noted in the amended design.
- If check 4 fails (the timer is late or frozen while locked), the shell still proceeds, but the sleep timer must be computed from the media clock (`timeupdate`, `currentTime`) and pause on `ended` or on the next `timeupdate` rather than `setTimeout`. If check 3 fails but 2 passes, auto-advance and progress saving are designed to survive a missed `ended` (compare `currentTime` and duration on resume). Record these for the sleep-timer design.

FAIL (use the "player on the story page" fallback, amend the design doc, and WP-D is replaced):

- Any of 1, 2, 3 or 5 fails in the installed mode on a device you use, or
- Check 6b fails (a paused app cannot be resumed from the lock screen), or
- Check 7 fails (the app restarts or reloads while locked, which would lose the persistent audio element).

Mixed results: if the Safari tab passes and the installed icon fails, the shell can
still proceed only if the family uses Safari tabs, not the Home Screen icon. Say so
plainly and decide before WP-D starts: the design either ships the shell and
documents that the Home Screen icon is not recommended on that device, or takes the
fallback. Do not guess. If a result is unclear, rerun that one check twice before
deciding.

What to send back: the filled results tables, the device block, and the copied log
for each run (or the lines containing `ended`, `TIMER`, `MEDIASESSION`, `GAP`,
`DRIFT`, `REJECTED` and `page opened`).

## 9. What the log lines mean

| Prefix | Meaning |
|---|---|
| `EVENT play / pause / ended / seeked` | The audio element reported it. A `pause` you did not cause is the system suspending playback. |
| `timeupdate xN` | N `timeupdate` events fired since the last line (they are summarised every 5 s). |
| `GAP` | No `timeupdate` for over 2 s while playing: JavaScript or the media clock was suspended. |
| `DRIFT` | A 1 s ticker ran after over 3 s: JavaScript was suspended (this runs always, even when paused). |
| `MEDIASESSION name` | A lock-screen or notification control called the page's handler. `hidden=true` means the page was not visible. |
| `TIMER` | The 60 s `setTimeout` result with how late it was. |
| `PAUSE-TEST` | The 30 s pause then `play()` result. |
| `LIFECYCLE` | `visibilitychange`, `pagehide`, `pageshow`, `freeze`, `resume`, `blur` and `focus` events. `freeze` or a second `page opened` is the page being suspended or reloaded. |
| `play() REJECTED` | The browser refused to start audio from code with no tap: autoplay policy. |

## 10. Technical notes

- Audio source: two 16 kHz mono, 16 kbps MPEG audio files, generated with `ffmpeg` and embedded as base64: track A 240 s and track B 15 s, in two flavours. Tone is a 330 Hz (A) or 440 Hz (B) sine at 3% volume with a slow 0.25 Hz wobble; silence is digital zero. The tone is the default because some platforms treat pure silence differently from real audio (for example, suspending a silent element). Both are in the file so the same device can be tested with each.
- The audio plays from a Blob URL created at runtime from the embedded data. This is the page's own memory, not a network request.
- The log is stored in `localStorage` under `audio-spike-log-v1` (kept up to 3000 lines), so it survives a reload or restart, which is itself evidence. If storage is blocked the page still works and the log is shown on screen only.
- The page links a data-URI web app manifest with `start_url` `/Stories/spikes/audio-spike.html` and scope `/Stories/spikes/` so an installed icon opens this page, not the Stories home page. The site's own `manifest.webmanifest` is deliberately not used here. iOS also honours `apple-mobile-web-app-capable`. Whether Android Chrome offers "Install app" for a data-URI manifest cannot be verified from the build machine; Script C says what to record if it does not.
- The front matter of the spike file sets `permalink: /spikes/audio-spike.html` and `templateEngineOverride: false`, so Eleventy copies the page through untouched, and it is published at `/Stories/spikes/audio-spike.html`.
