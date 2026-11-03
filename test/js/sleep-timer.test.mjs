// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FADE_MS, createSleepTimer } from "../../site/assets/js/sleep-timer.mjs";

const MIN = 60_000;

function makeAudio() {
  const audio = new EventTarget();
  Object.assign(audio, { currentTime: 0, paused: false, volume: 1, playbackRate: 1 });
  audio.pause = vi.fn(() => {
    audio.paused = true;
    audio.dispatchEvent(new Event("pause"));
  });
  return audio;
}

/** Plays `seconds` of wall time in 0.25 s timeupdates, advancing media time at `rate`. */
function play(audio, seconds, { rate = 1 } = {}) {
  for (let i = 0; i < seconds * 4; i++) {
    audio.currentTime += 0.25 * rate;
    vi.advanceTimersByTime(250);
    audio.dispatchEvent(new Event("timeupdate"));
  }
}

const setVisible = () => {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

let audio;
let timer;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T20:00:00Z"));
  audio = makeAudio();
  timer = createSleepTimer(audio);
});
afterEach(() => {
  timer.dispose();
  vi.useRealTimers();
});

describe("sleep timer", () => {
  it("is off until started and reports remaining time", () => {
    expect(timer.state()).toMatchObject({ active: false, remainingMs: 0 });
    timer.start(10);
    expect(timer.state()).toMatchObject({ active: true, minutes: 10, remainingMs: 10 * MIN, fading: false });
    vi.advanceTimersByTime(MIN);
    expect(timer.state().remainingMs).toBe(9 * MIN);
  });

  it("rejects a non-positive duration", () => {
    expect(() => timer.start(0)).toThrow(RangeError);
    expect(() => timer.start(NaN)).toThrow(RangeError);
  });

  it("fades the volume out over the last seconds, then pauses and restores the volume", () => {
    timer.start(1);
    vi.advanceTimersByTime(MIN - FADE_MS - 1000);
    expect(audio.volume).toBe(1);
    vi.advanceTimersByTime(1000 + 1);
    expect(timer.state().fading).toBe(true);
    vi.advanceTimersByTime(FADE_MS / 2);
    expect(audio.volume).toBeGreaterThan(0.3);
    expect(audio.volume).toBeLessThan(0.7);
    expect(audio.pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FADE_MS / 2 + 500);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.volume).toBe(1);
    expect(timer.state().active).toBe(false);
  });

  it("pauses from the audio clock (timeupdate) even if the setTimeout never fires", () => {
    timer.start(1);
    vi.setSystemTime(Date.now() + MIN + 1); // frozen timers: only wall time moved
    audio.currentTime += 0.25;
    audio.dispatchEvent(new Event("timeupdate"));
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(timer.state().active).toBe(false);
  });

  it.each([
    ["visibilitychange", setVisible],
    ["pageshow", () => window.dispatchEvent(new Event("pageshow"))],
    ["resume", () => document.dispatchEvent(new Event("resume"))],
  ])("pauses on %s when the page was frozen past the deadline", (_name, fire) => {
    timer.start(5);
    vi.setSystemTime(Date.now() + 5 * MIN + 1);
    fire();
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(timer.state().active).toBe(false);
  });

  it("also stops when enough audio was listened to even if the wall clock jumped backwards", () => {
    timer.start(1);
    for (let i = 0; i < 62 * 4 && timer.state().active; i++) {
      audio.currentTime += 0.25;
      vi.setSystemTime(Date.now() - MIN); // the clock keeps stepping back
      audio.dispatchEvent(new Event("timeupdate"));
    }
    expect(audio.pause).toHaveBeenCalled();
    expect(timer.state().active).toBe(false);
  });

  it("counts media time against the playback rate", () => {
    audio.playbackRate = 2;
    timer.start(1);
    play(audio, 30, { rate: 2 }); // 30 s of wall time, 60 s of media
    expect(audio.pause).not.toHaveBeenCalled();
    expect(timer.state().remainingMs).toBeLessThanOrEqual(30_500);
  });

  it("does not count a seek as listening", () => {
    timer.start(10);
    audio.currentTime = 500;
    audio.dispatchEvent(new Event("timeupdate"));
    expect(timer.state().remainingMs).toBeGreaterThan(9.9 * MIN);
  });

  it("a pause during the fade finishes the timer and restores the volume", () => {
    timer.start(1);
    vi.advanceTimersByTime(MIN - FADE_MS / 2);
    expect(timer.state().fading).toBe(true);
    audio.pause();
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.volume).toBe(1);
    expect(timer.state().active).toBe(false);
  });

  it("keeps counting through a pause; expiring while paused ends it without touching playback", () => {
    timer.start(1);
    audio.pause();
    audio.pause.mockClear();
    vi.advanceTimersByTime(2 * MIN);
    expect(timer.state().active).toBe(false);
    expect(audio.pause).not.toHaveBeenCalled();
  });

  it("restarting replaces the run; cancel stops it and restores the volume mid-fade", () => {
    timer.start(1);
    timer.start(30);
    expect(timer.state().minutes).toBe(30);
    timer.start(1);
    vi.advanceTimersByTime(MIN - 3000);
    expect(audio.volume).toBeLessThan(1);
    timer.cancel();
    expect(audio.volume).toBe(1);
    vi.advanceTimersByTime(10 * MIN);
    expect(audio.pause).not.toHaveBeenCalled();
  });

  it("notifies listeners on start, fade and end, and nothing after dispose", () => {
    const seen = [];
    const off = timer.onChange((s) => seen.push(s.active ? (s.fading ? "fading" : "active") : "off"));
    timer.start(1);
    vi.advanceTimersByTime(MIN + 1000);
    expect(seen).toEqual(["active", "fading", "off"]);
    off();
    timer.start(1);
    expect(seen).toHaveLength(3);
    timer.dispose();
    audio.pause.mockClear();
    vi.advanceTimersByTime(10 * MIN);
    audio.dispatchEvent(new Event("timeupdate"));
    expect(audio.pause).not.toHaveBeenCalled();
  });

  it("does not end the timer when the page merely becomes hidden", () => {
    timer.start(5);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(timer.state().active).toBe(true);
  });
});
