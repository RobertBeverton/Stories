// How page modules (story-resume, parts, play-button, continue) find and use the
// persistent audio.
//
// There is ONE <audio data-role="shell-audio"> outside #view, and it can hold
// any story: the page's own, or another one the dock is playing (Next/Previous,
// or a Play button elsewhere). Ownership is therefore not a property of the
// page. It is the slug: a page module may drive or save from the audio only
// while audio.dataset.slug is its own slug, and must check that again on every
// event (the dock can switch the story at any time). Modules never rely on an
// id that the shell adds or removes.
import { onProgressChange } from "./dom.mjs";
import { MIN_PROGRESS_SEC, toViewModel } from "./progress.mjs";

/** The shell's audio element, or null on a page without one. */
export function shellAudio(doc = document) {
  return doc.querySelector('audio[data-role="shell-audio"]') ?? doc.querySelector("audio#player");
}

/**
 * True while the player is swapping the audio to another story (set by player.mjs).
 * The element reads 0:00 and fires events then, so nothing may save a position from it.
 */
export function isSettling(audio) {
  return Boolean(audio) && audio.dataset.settling === "1";
}

/** True while the audio holds `slug`'s story. */
export function holdsStory(audio, slug) {
  return Boolean(audio) && Boolean(slug) && audio.dataset.slug === slug;
}

/** True while the audio holds `slug`'s story and is playing it. */
export function playsStory(audio, slug) {
  return holdsStory(audio, slug) && !audio.paused && !audio.ended;
}

/**
 * Where a Play press on a story already held by the audio should start, as
 * seconds, or null to carry on from the current position. One rule for the
 * player and story-resume, so every Play button agrees:
 *   - an ended story starts again from 0;
 *   - a paused story whose record says finished (Play again) starts from 0;
 *   - an unstarted audio (under a second in) goes to the saved position;
 *   - otherwise the listener's own position stands.
 * `record` is the story's progress record (or null).
 */
export function startPosition(audio, record) {
  if (audio.ended) return 0;
  const { state } = toViewModel(record);
  if (audio.paused && state === "finished") return 0;
  if (audio.currentTime < MIN_PROGRESS_SEC && state === "in-progress") return record.audioTime;
  return null;
}

/**
 * `records` (progress.readAll()) with the story that is playing right now
 * brought up to the audio clock. Progress is saved every few seconds, so
 * anything that shows a live bar (Home) reads through this instead of waiting
 * for the next save. Only a playing story counts: a loaded, paused one has
 * already saved its position.
 */
export function withLiveProgress(records, audio = shellAudio()) {
  const slug = audio?.dataset.slug;
  if (!slug || audio.paused || audio.ended || !(audio.currentTime >= MIN_PROGRESS_SEC)) return records;
  const base = records[slug] ?? { v: 2, scrollY: 0 };
  return { ...records, [slug]: { ...base, audioTime: audio.currentTime, playing: true, savedAt: Date.now() } };
}

const LIVE_EVENTS = ["play", "playing", "pause", "ended", "emptied", "loadedmetadata", "seeked"];

/**
 * Calls `fn` whenever progress may have changed: a saved record (this tab or
 * another), the audio starting, pausing, ending or seeking, and the audio clock
 * at most once per `everyMs`. @returns {() => void} a disposer
 */
export function onLiveProgress(fn, { audio = shellAudio(), everyMs = 1000 } = {}) {
  const stopSaved = onProgressChange(fn);
  if (!audio) return stopSaved;
  let last = 0;
  const onTime = () => {
    const now = Date.now();
    if (now - last >= everyMs) {
      last = now;
      fn();
    }
  };
  for (const type of LIVE_EVENTS) audio.addEventListener(type, fn);
  audio.addEventListener("timeupdate", onTime);
  return () => {
    stopSaved();
    for (const type of LIVE_EVENTS) audio.removeEventListener(type, fn);
    audio.removeEventListener("timeupdate", onTime);
  };
}
