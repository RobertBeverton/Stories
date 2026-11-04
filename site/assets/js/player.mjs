// The persistent player: owns the one <audio> that lives outside #view, so
// playback survives router navigation. dock.mjs builds the UI on top of it.
//
// What it does
//   - Claims `stories:play {slug}` (preventDefault) when it can find that
//     story's audio URL on the page or in its cache, so a Play button anywhere
//     plays in place instead of navigating. On a story's own page story-resume
//     claims it for the same element; with no known URL the play-button's own
//     ?autoplay=1 navigation takes over.
//   - Saves progress through progress.mjs as v2 records (which emits
//     `stories:progress`), marks stories finished, and reconciles on return to
//     the foreground, using the same rules as story-resume.
//   - Media Session: metadata (title, artist = world, real-URL artwork),
//     play, pause, seekto, seekbackward, seekforward, previoustrack and
//     nexttrack (the neighbours in the story's series), plus position state.
//
// Page modules (story-resume, parts) find the audio with shell-audio.mjs and may
// drive or save from it only while audio.dataset.slug is their own story's slug,
// re-checked on every event. So a page for story B never drives, or saves
// progress from, the audio of story A that is still playing, and picks the audio
// up on its own once start()/load() put B into it. The element keeps id="player"
// for good: ownership is the slug, never an id that comes and goes.
//
// Known browser limitation: Firefox on Android did not update the lock-screen
// title after next/previous even though metadata was set on each load while the
// page was hidden (device spike). The mitigation is to assign a fresh
// MediaMetadata again when `playing` fires and on every foreground return;
// there is no other workaround. Artwork is always a real URL, never data:.
import { basePath } from "./dom.mjs";
import { safeHref } from "./escape.mjs";
import { loadLibrary } from "./library.mjs";
import { cleanParts, currentPartIndex } from "./parts.mjs";
import {
  COMPLETE_WINDOW_SEC, markCompleted, read, toViewModel, write,
} from "./progress.mjs";
import { startPosition } from "./shell-audio.mjs";

export const SAVE_EVERY_SEC = 5;
export const SKIP_SEC = 15;
export const RESTART_AFTER_SEC = 5; // "previous" restarts a story that is further in than this
export const RESTART_PART_AFTER_SEC = 3; // "previous part" restarts the current part when this far into it
export const SPEEDS = [0.75, 1, 1.25, 1.5];
const SPEED_KEY = "stories-speed";

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** An audio URL we are willing to put in the element: https, or same origin. */
export function playableUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === "https:" || (url.protocol === "http:" && url.origin === window.location.origin)) return url.href;
  } catch {
    // not a URL
  }
  return null;
}

/** The stories next to `slug` in its series, by seriesOrder. */
export function neighbours(library, slug) {
  const story = library?.bySlug.get(slug);
  if (!story || !story.series || story.seriesOrder === null || story.seriesOrder === undefined) return { prev: null, next: null };
  const series = library.stories
    .filter((s) => s.series === story.series && s.world === story.world && typeof s.seriesOrder === "number")
    .sort((a, b) => a.seriesOrder - b.seriesOrder);
  const i = series.findIndex((s) => s.slug === slug);
  return { prev: series[i - 1]?.slug ?? null, next: series[i + 1]?.slug ?? null };
}

/**
 * @param {HTMLAudioElement} audio the persistent element (outside #view)
 * @param {{doc?: Document}} [options]
 */
export function createPlayer(audio, { doc = document } = {}) {
  const listeners = new Set();
  const timeListeners = new Set();
  const disposers = [];
  const urlCache = new Map(); // slug -> playable audio URL
  let library = null;
  let active = false; // the user started something in this document
  let settling = false; // a new source is loading: ignore events that would write a bogus position
  let pendingStart = 0;
  let lastSaved = 0;
  let disposed = false;
  let error = false;
  let prefetched = null;
  let lastPosition = 0;

  const slug = () => audio.dataset.slug || null;
  const story = () => library?.bySlug.get(slug()) ?? null;
  const duration = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : story()?.durationSec ?? null);

  const emit = () => { for (const fn of [...listeners]) fn(); };

  function on(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    disposers.push(() => target.removeEventListener(type, fn, options));
  }

  // --- source resolution ----------------------------------------------------
  function urlFromDom(forSlug) {
    for (const el of doc.querySelectorAll("[data-audio-url]")) {
      if (el.dataset.slug === forSlug) {
        const url = playableUrl(el.dataset.audioUrl);
        if (url) return url;
      }
    }
    return null;
  }
  function knownUrl(forSlug) {
    const url = urlFromDom(forSlug) ?? urlCache.get(forSlug) ?? null;
    if (url) urlCache.set(forSlug, url);
    return url;
  }
  if (slug() && audio.getAttribute("src")) urlCache.set(slug(), audio.src);
  try {
    const saved = Number(storage()?.getItem(SPEED_KEY));
    if (saved >= 0.5 && saved <= 3) {
      audio.defaultPlaybackRate = saved;
      audio.playbackRate = saved;
    }
  } catch {
    // default speed
  }

  /** Finds a story's audio URL, fetching its page when it is not on screen (next/previous). */
  async function resolveUrl(forSlug) {
    const known = knownUrl(forSlug);
    if (known) return known;
    const entry = library?.bySlug.get(forSlug);
    if (!entry) return null;
    try {
      const res = await fetch(safeHref(entry.url), { credentials: "same-origin" });
      if (!res.ok) return null;
      const parsed = new DOMParser().parseFromString(await res.text(), "text/html");
      for (const el of parsed.querySelectorAll("[data-audio-url]")) {
        if (el.dataset.slug === forSlug) {
          const url = playableUrl(el.dataset.audioUrl);
          if (url) {
            urlCache.set(forSlug, url);
            return url;
          }
        }
      }
    } catch {
      // offline: no next/previous for now
    }
    return null;
  }

  // --- progress -------------------------------------------------------------
  const viewModel = (record) => toViewModel(record, { durationSec: duration() });
  const storyParts = () => cleanParts(story()?.parts);

  function save(partial) {
    if (settling || !slug()) return;
    write(slug(), partial);
  }
  function savePosition() {
    if (!slug() || settling) return;
    const partial = {};
    if (!audio.paused && !audio.ended) {
      partial.audioTime = audio.currentTime;
      partial.playing = true;
    }
    if (partial.audioTime !== undefined) save(partial);
  }
  function reconcile() {
    const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    if (!total || !slug() || settling) return;
    if (!audio.paused && !audio.ended) return;
    const record = read(slug());
    if (record && viewModel(record).state === "finished") return;
    const reached = Math.max(audio.currentTime, record?.audioTime ?? 0);
    if (reached >= total - COMPLETE_WINDOW_SEC) {
      markCompleted(slug());
      lastSaved = 0;
    }
  }

  // --- Media Session ----------------------------------------------------------
  const session = () => (typeof navigator !== "undefined" ? navigator.mediaSession ?? null : null);

  function worldTitle(entry) {
    return library?.worlds.find((w) => w.name === entry?.world)?.title ?? "Stories";
  }
  function setMetadata() {
    const s = session();
    if (!s || typeof MediaMetadata === "undefined" || !slug()) return;
    const entry = story();
    const base = basePath();
    try {
      // A fresh object every time: Firefox Android only refreshes on assignment.
      s.metadata = new MediaMetadata({
        title: entry?.title ?? "Stories",
        artist: worldTitle(entry),
        album: entry?.series ?? "",
        artwork: [
          { src: new URL(`${base}/assets/app-icon-192.png`, doc.baseURI).href, sizes: "192x192", type: "image/png" },
          { src: new URL(`${base}/assets/app-icon-512.png`, doc.baseURI).href, sizes: "512x512", type: "image/png" },
        ],
      });
    } catch {
      // a browser that rejects the artwork list still plays
    }
  }
  function setPosition() {
    const s = session();
    const total = duration();
    if (!s?.setPositionState || !total || !Number.isFinite(audio.duration)) return;
    try {
      s.setPositionState({ duration: total, playbackRate: audio.playbackRate || 1, position: Math.min(audio.currentTime, total) });
    } catch {
      // out-of-range values are the browser's to reject
    }
  }
  function setHandlers() {
    const s = session();
    if (!s) return;
    const { next } = neighbours(library, slug());
    const handlers = {
      play: () => resume(),
      pause: () => audio.pause(),
      stop: () => audio.pause(),
      seekto: (d) => {
        if (d?.fastSeek && typeof audio.fastSeek === "function") audio.fastSeek(d.seekTime);
        else seek(d?.seekTime ?? 0);
      },
      seekbackward: (d) => skip(-(d?.seekOffset || SKIP_SEC)),
      seekforward: (d) => skip(d?.seekOffset || SKIP_SEC),
      previoustrack: slug() ? () => previous() : null,
      nexttrack: next ? () => go(next) : null,
    };
    for (const [action, fn] of Object.entries(handlers)) {
      try {
        s.setActionHandler(action, fn);
      } catch {
        // an action this browser does not know
      }
    }
  }
  /** Re-asserts metadata and handlers (page modules may have cleared them on unmount). */
  function refreshSession() {
    if (disposed || !slug()) return;
    setMetadata();
    setHandlers();
    setPosition();
  }

  // --- transport --------------------------------------------------------------
  function play() {
    const result = audio.play();
    if (result && typeof result.catch === "function") result.catch(() => { emit(); });
  }
  /** Resume playback of whatever is loaded (lock-screen play, dock toggle). */
  function resume() {
    if (!slug()) return;
    active = true;
    if (audio.ended) audio.currentTime = 0;
    play();
    emit();
  }
  function pause() {
    audio.pause();
  }
  function toggle() {
    if (audio.paused || audio.ended) resume();
    else pause();
  }
  function seek(seconds) {
    const total = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    const to = Math.min(total, Math.max(0, Number(seconds) || 0));
    audio.currentTime = to;
    setPosition();
    emit();
  }
  function skip(delta) {
    seek(audio.currentTime + delta);
  }
  function setRate(rate) {
    if (!(rate > 0)) return;
    audio.defaultPlaybackRate = rate; // a new src resets playbackRate to this
    audio.playbackRate = rate;
    try {
      storage()?.setItem(SPEED_KEY, String(rate));
    } catch {
      // not remembered
    }
    emit();
  }

  /** Loads another story into the persistent element. */
  function load(forSlug, url, { startAt = 0 } = {}) {
    if (slug() && !settling && !audio.paused) {
      save({ audioTime: audio.currentTime, playing: false });
    }
    settling = true;
    pendingStart = startAt;
    error = false;
    prefetched = null;
    audio.dataset.slug = forSlug;
    audio.src = url;

    urlCache.set(forSlug, url);
    lastSaved = startAt;
    emit();
  }

  /** The Play button behaviour: start or resume `forSlug`, loading it first if needed. */
  function start(forSlug, url) {
    const record = read(forSlug);
    active = true;
    if (slug() !== forSlug) {
      load(forSlug, url, { startAt: viewModel(record).state === "in-progress" ? record.audioTime : 0 });
    } else {
      const to = startPosition(audio, record);
      if (to !== null) audio.currentTime = to;
    }
    play();
    refreshSession();
    emit();
  }

  async function go(forSlug) {
    const url = await resolveUrl(forSlug);
    if (!url || disposed) return;
    const record = read(forSlug);
    load(forSlug, url, { startAt: viewModel(record).state === "in-progress" ? record.audioTime : 0 });
    active = true;
    play();
    refreshSession();
  }
  function previous() {
    const { prev } = neighbours(library, slug());
    if (audio.currentTime > RESTART_AFTER_SEC || !prev) seek(0);
    else go(prev);
  }

  /** The part before this one, or the start of the current part when well into it. */
  function previousPart() {
    const parts = storyParts();
    const i = currentPartIndex(parts, audio.currentTime);
    if (i < 0) seek(0);
    else if (audio.currentTime - parts[i].start > RESTART_PART_AFTER_SEC || i === 0) seek(parts[i].start);
    else seek(parts[i - 1].start);
  }
  function nextPart() {
    const parts = storyParts();
    const next = parts[currentPartIndex(parts, audio.currentTime) + 1];
    if (next) seek(next.start);
  }

  // --- the page the shell is showing -------------------------------------------
  const wantsAutoplay = () => new URLSearchParams(doc.defaultView?.location.search ?? "").get("autoplay") === "1";
  /**
   * Called on first mount and before each swapped view's modules mount.
   * Loads the page's story into the audio when nothing has been started (or the
   * link carries ?autoplay=1); otherwise leaves another story's audio alone.
   * Page modules decide for themselves, by slug, whether they may use it.
   */
  function syncPage() {
    const article = doc.querySelector('[data-mount="story-resume"][data-slug]');
    const pageSlug = article?.dataset.slug;
    const url = pageSlug ? playableUrl(article.dataset.audioUrl ?? "") ?? knownUrl(pageSlug) : null;
    if (!pageSlug || !url) return; // no story here
    urlCache.set(pageSlug, url);
    if (slug() === pageSlug) {
      // A ?autoplay=1 arrival makes story-resume seek to the SAVED position; make
      // that the live one so a story already playing does not jump back.
      if (wantsAutoplay() && !audio.paused && !audio.ended) save({ audioTime: audio.currentTime, playing: true });
      return;
    }
    if (!active || wantsAutoplay()) {
      load(pageSlug, url, { startAt: 0 });
      active = false;
    }
    // else: another story is in the dock; leave it alone
  }

  // --- events -----------------------------------------------------------------
  on(doc, "stories:play", (event) => {
    const wanted = event.detail?.slug;
    const url = wanted ? knownUrl(wanted) : null;
    if (!url) return; // not ours: the button's own ?autoplay=1 navigation handles it
    // On that story's own page, while the audio already holds it, story-resume
    // claims the event itself; claiming it twice would start playback twice.
    const page = doc.querySelector('[data-mount="story-resume"][data-slug]');
    if (page?.dataset.slug === wanted && slug() === wanted) return;
    event.preventDefault();
    if (slug() === wanted && !audio.paused && !audio.ended) return; // already playing it
    start(wanted, url);
  });

  on(audio, "loadedmetadata", () => {
    if (settling) {
      settling = false;
      if (pendingStart > 0) audio.currentTime = pendingStart;
      lastSaved = pendingStart;
    }
    reconcile();
    emit();
  });
  on(audio, "play", () => {
    active = true;
    save({ playing: true });
    emit();
  });
  on(audio, "playing", () => {
    setMetadata(); // the Firefox Android lock-screen title only follows an assignment after playback starts
    setHandlers();
    setPosition();
    if (prefetched !== slug() && slug()) {
      prefetched = slug();
      const { prev, next } = neighbours(library, slug());
      for (const other of [next, prev]) if (other) resolveUrl(other);
    }
    emit();
  });
  on(audio, "pause", () => {
    if (!audio.ended) save({ audioTime: audio.currentTime, playing: false });
    emit();
  });
  on(audio, "ended", () => {
    if (!settling && slug()) markCompleted(slug());
    lastSaved = 0;
    emit();
  });
  on(audio, "timeupdate", () => {
    if (!settling && Math.abs(audio.currentTime - lastSaved) >= SAVE_EVERY_SEC) {
      save({ audioTime: audio.currentTime, playing: !audio.paused });
      lastSaved = audio.currentTime;
    }
    if (Math.abs(audio.currentTime - lastPosition) >= 1) {
      lastPosition = audio.currentTime;
      setPosition();
    }
    for (const fn of [...timeListeners]) fn();
  });
  for (const type of ["durationchange", "ratechange", "emptied", "seeked"]) on(audio, type, emit);
  on(audio, "error", () => {
    error = true;
    emit();
  });
  on(doc, "visibilitychange", () => {
    if (doc.visibilityState === "visible") {
      reconcile();
      refreshSession();
      emit();
    } else {
      savePosition();
    }
  });
  const view = doc.defaultView;
  if (view) {
    on(view, "pageshow", () => { reconcile(); refreshSession(); });
    on(view, "pagehide", savePosition);
  }

  loadLibrary().then((lib) => {
    if (disposed) return;
    library = lib;
    refreshSession();
    emit();
  });

  return {
    audio,
    syncPage,
    refreshSession,
    start,
    resume,
    pause,
    toggle,
    seek,
    skip,
    setRate,
    previous,
    previousPart,
    nextPart,
    next: () => { const { next } = neighbours(library, slug()); if (next) go(next); },
    retry() {
      error = false;
      audio.load?.();
      play();
      emit();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onTime(fn) {
      timeListeners.add(fn);
      return () => timeListeners.delete(fn);
    },
    state() {
      const { prev, next } = neighbours(library, slug());
      const parts = storyParts();
      const partIndex = currentPartIndex(parts, audio.currentTime || 0);
      return {
        slug: slug(),
        hasParts: parts.length > 0,
        hasNextPart: partIndex + 1 < parts.length,
        story: story(),
        world: worldTitle(story()),
        active,
        playing: Boolean(slug()) && !audio.paused && !audio.ended,
        ended: audio.ended,
        currentTime: audio.currentTime || 0,
        duration: duration(),
        rate: audio.playbackRate || 1,
        error,
        hasNext: Boolean(next),
        hasPrevStory: Boolean(prev),
      };
    },
    dispose() {
      disposed = true;
      listeners.clear();
      timeListeners.clear();
      for (const dispose of disposers.splice(0).reverse()) dispose();
      const s = session();
      for (const action of ["play", "pause", "stop", "seekto", "seekbackward", "seekforward", "previoustrack", "nexttrack"]) {
        try {
          s?.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    },
  };
}
