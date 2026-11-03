// Sleep timer for the persistent audio element.
//
// Designed from the device spike (docs/spikes/audio-spike.md; Pixel 10, Firefox
// installed to the home screen, plus desktop): JS timers, `timeupdate` and a
// 60 s setTimeout all kept running with the screen locked. Not tested: iOS. So
// the timer never trusts one clock:
//
//   1. a setTimeout armed for the start of the fade,
//   2. a check on every `timeupdate` (the audio clock keeps ticking while the
//      page is hidden), against BOTH the wall-clock deadline and the amount of
//      audio actually listened to, so a wall clock that jumps cannot make a
//      child's story run on, and
//   3. a check when the page comes back (visibilitychange, pageshow, resume),
//      because the OS may freeze the page and skip timers entirely.
//
// The last 10 seconds fade the volume down, then the audio pauses. Browsers
// that ignore `volume` (iOS) simply pause at the deadline. A pause that happens
// while the timer is only counting down does not cancel it; if the deadline
// passes while paused the timer quietly ends without touching playback, so
// pressing Play later is never cut short by an old timer.
export const SLEEP_MINUTES = [10, 15, 30, 45, 60];
export const FADE_MS = 10_000;
const STEP_MS = 250;
const MAX_TICK_JUMP_SEC = 2; // a bigger media-time jump is a seek, not listening

/**
 * @param {HTMLMediaElement} audio
 * @param {{now?: () => number, fadeMs?: number, stepMs?: number}} [options]
 */
export function createSleepTimer(audio, { now = () => Date.now(), fadeMs = FADE_MS, stepMs = STEP_MS } = {}) {
  const listeners = new Set();
  const disposers = [];
  let run = null; // { minutes, deadline, durationMs, listenedMs, lastMedia, fadeTimer, tickTimer, volume }

  const remainingMs = () => (run ? Math.max(0, Math.min(run.deadline - now(), run.durationMs - run.listenedMs)) : 0);
  const snapshot = () => ({
    active: Boolean(run),
    minutes: run?.minutes ?? 0,
    remainingMs: remainingMs(),
    fading: Boolean(run?.tickTimer),
  });
  const notify = () => {
    for (const fn of [...listeners]) fn(snapshot());
  };

  function clearTimers() {
    if (!run) return;
    clearTimeout(run.fadeTimer);
    clearInterval(run.tickTimer);
    run.fadeTimer = null;
    run.tickTimer = null;
  }

  function end({ pause }) {
    if (!run) return;
    clearTimers();
    if (pause) audio.pause();
    if (run.volume !== undefined) audio.volume = run.volume;
    run = null;
    notify();
  }

  function arm() {
    clearTimeout(run.fadeTimer);
    run.fadeTimer = setTimeout(evaluate, Math.max(0, remainingMs() - fadeMs));
  }

  function fadeStep() {
    const left = remainingMs();
    if (left <= 0) return end({ pause: !audio.paused });
    audio.volume = Math.max(0, Math.min(1, run.volume * (left / fadeMs)));
  }

  function evaluate() {
    if (!run) return;
    const left = remainingMs();
    if (left <= 0) return end({ pause: !audio.paused });
    // Not yet time to fade, or nothing is playing to fade: check again later.
    if (left > fadeMs || audio.paused) return arm();
    if (!run.tickTimer) {
      run.volume = audio.volume;
      run.tickTimer = setInterval(fadeStep, stepMs);
      fadeStep();
      notify();
    }
  }

  function onTimeUpdate() {
    if (!run) return;
    const delta = audio.currentTime - run.lastMedia;
    run.lastMedia = audio.currentTime;
    if (delta > 0 && delta <= MAX_TICK_JUMP_SEC) run.listenedMs += (delta * 1000) / (audio.playbackRate || 1);
    evaluate();
  }

  function on(target, type, fn) {
    target.addEventListener(type, fn);
    disposers.push(() => target.removeEventListener(type, fn));
  }
  on(audio, "timeupdate", onTimeUpdate);
  on(audio, "play", () => {
    if (!run) return;
    run.lastMedia = audio.currentTime;
    evaluate();
  });
  // A pause during the fade is the listener (or the lock screen) saying
  // "enough": finish the timer and put the volume back.
  on(audio, "pause", () => {
    if (run?.tickTimer) end({ pause: false });
  });
  if (typeof document !== "undefined") {
    on(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") evaluate();
    });
    on(document, "resume", evaluate); // Page Lifecycle: the page was frozen, then thawed
    on(window, "pageshow", evaluate);
  }

  return {
    /** Starts (or restarts) the timer. @param {number} minutes */
    start(minutes) {
      if (!(minutes > 0)) throw new RangeError("sleep timer needs a positive number of minutes");
      end({ pause: false });
      const durationMs = minutes * 60_000;
      run = {
        minutes,
        deadline: now() + durationMs,
        durationMs,
        listenedMs: 0,
        lastMedia: audio.currentTime,
        fadeTimer: null,
        tickTimer: null,
        volume: undefined,
      };
      arm();
      notify();
    },
    cancel() {
      end({ pause: false });
    },
    state: snapshot,
    /** @param {(state: ReturnType<typeof snapshot>) => void} fn @returns {() => void} */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      end({ pause: false });
      for (const dispose of disposers.splice(0)) dispose();
      listeners.clear();
    },
  };
}
