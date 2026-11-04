// Shared helpers for the page-module tests (jsdom files only).
import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";

const fixture = (name) => fs.readFileSync(path.resolve(process.cwd(), "test/fixtures", name), "utf8");

export const library = JSON.parse(fixture("library.json"));
export const progressV1 = JSON.parse(fixture("progress-v1.json"));
export const progressV2 = JSON.parse(fixture("progress-v2.json"));
export const storyPageHtml = fixture("story-page.html");
export const libraryPageHtml = fixture("library-page.html");

/** The fixed "now" for time-dependent rules (the fixture publish dates are around it). */
export const NOW = new Date("2026-11-03T12:00:00Z").getTime();

export function useFixedNow() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
}

/** Puts records into localStorage verbatim (any shape, to test v1 and corrupt data). */
export function seed(records) {
  for (const [slug, record] of Object.entries(records)) {
    localStorage.setItem(`story-progress:${slug}`, typeof record === "string" ? record : JSON.stringify(record));
  }
}

/** Makes fetch return the fixture library for `<base>/library.json` (with or without the `?v=<build id>` the page adds). */
export function stubLibraryFetch(data = library) {
  const fetchMock = vi.fn(async (url) => {
    if (String(url).split("?")[0] !== "/Stories/library.json") return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => structuredClone(data) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Loads fixture markup into the document, keeping data-base on <html>. */
export function loadPage(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  document.documentElement.dataset.base = doc.documentElement.dataset.base ?? "";
  document.body.replaceChildren(...doc.body.childNodes);
}

/** Replaces the page's real <audio> with a controllable stand-in on the same element. */
export function fakeAudio(audio, { duration = 600 } = {}) {
  let currentTime = 0;
  let paused = true;
  let ended = false;
  let dur = duration;
  Object.defineProperties(audio, {
    currentTime: { get: () => currentTime, set: (v) => { currentTime = v; }, configurable: true },
    duration: { get: () => dur, configurable: true },
    paused: { get: () => paused, configurable: true },
    ended: { get: () => ended, configurable: true },
  });
  audio.play = vi.fn(() => { paused = false; ended = false; audio.dispatchEvent(new Event("play")); return Promise.resolve(); });
  audio.pause = vi.fn(() => { paused = true; audio.dispatchEvent(new Event("pause")); });
  audio.load = vi.fn();
  return {
    setDuration: (v) => { dur = v; },
    tick(t) { currentTime = t; audio.dispatchEvent(new Event("timeupdate")); },
    end() {
      currentTime = dur;
      paused = true;
      ended = true;
      audio.dispatchEvent(new Event("pause"));
      audio.dispatchEvent(new Event("ended"));
    },
    pauseAt(t) { currentTime = t; paused = true; audio.dispatchEvent(new Event("pause")); },
    setPaused: (v) => { paused = v; },
  };
}

export const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
