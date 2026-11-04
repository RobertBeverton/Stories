// data-mount="story-resume" data-slug="<slug>" on the story article.
// Drives the shell's <audio> for this story: resume banner, ?autoplay=1,
// progress saving, finished detection and Media Session. Replaces resume.js and
// the in-page half of mini-player.js; there is no document.currentScript.
//
// The audio can hold another story (the dock's Next/Previous, or a story already
// playing when this page opened). Every handler therefore checks
// audio.dataset.slug === this slug when it runs (see shell-audio.mjs), so this
// page never saves another story's position into its own record.
//
// Finished rules (design doc): completedAt is set on `ended`, and on the next
// foreground (visibilitychange, pageshow, loadedmetadata) when playback reached
// within COMPLETE_WINDOW_SEC of the real audio.duration (never the front-matter
// duration, which can be wrong).
import { h } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import { setupMediaSession } from "./media-session.mjs";
import { holdsStory, isSettling, shellAudio, startPosition as playFrom } from "./shell-audio.mjs";
import {
  COMPLETE_WINDOW_SEC, markCompleted, read, toViewModel, write,
} from "./progress.mjs";

const SAVE_EVERY_SEC = 5;
const RESUME_AUDIO_SEC = 5;
const RESUME_SCROLL_PX = 200;

export function mount(el) {
  const slug = el.dataset.slug;
  if (!slug) return () => {};
  const audio = shellAudio();
  const disposers = [];
  const on = (target, type, fn) => {
    target.addEventListener(type, fn);
    disposers.push(() => target.removeEventListener(type, fn));
  };
  let story = null;
  let lastSaved = 0;

  // The message area: a template-provided [data-role="resume"], else our own.
  let area = el.querySelector('[data-role="resume"]');
  const ownArea = !area;
  if (ownArea) {
    area = h("div", { class: "resume-prompt", "data-role": "resume", role: "status" });
    const heading = el.querySelector("h1");
    if (heading) heading.after(area);
    else el.prepend(area);
  }
  area.hidden = true;
  disposers.push(() => {
    if (ownArea) area.remove();
    else area.replaceChildren();
  });

  /** The audio holds THIS page's story right now (re-checked on every event). */
  const mine = () => holdsStory(audio, slug);
  /**
   * Wraps an audio/document handler so it only runs while the audio is ours and the
   * player is not mid-swap (the element reads 0:00 then; saving it would erase the
   * record's real position).
   */
  const whenMine = (fn) => (event) => { if (mine() && !isSettling(audio)) fn(event); };

  const duration = () => (audio && Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : story?.durationSec ?? null);
  const viewModel = (record) => toViewModel(record, { durationSec: duration() });

  function show(...children) {
    area.replaceChildren(...children);
    area.hidden = children.length === 0;
  }

  function startPosition(record) {
    return viewModel(record).state === "in-progress" ? record.audioTime : 0;
  }

  function play() {
    const result = audio.play();
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        // The browser does not carry a tap on the previous page over to this
        // one, so play() can be blocked. Say so instead of staying silent.
        show(h("p", { class: "resume-note", "data-role": "autoplay-fallback" }, "Tap Play to start listening."));
      });
    }
  }

  /**
   * Starts (or resumes) playback the way a Play button should (the same rule the
   * player uses, see shell-audio.mjs). A story already playing is left alone: the
   * page's own button is Pause then, and nothing else should restart it.
   */
  function begin() {
    if (!audio.paused && !audio.ended) return;
    const to = playFrom(audio, read(slug));
    if (to !== null) audio.currentTime = to;
    play();
  }

  /**
   * Plays this story from `position`. While the audio holds it, seek and play. While
   * another story holds the audio, ask for this one the way a Play button does: the
   * player loads it, from the record this page has just written.
   */
  function playAt(position) {
    if (mine()) {
      audio.currentTime = position;
      play();
    } else {
      document.dispatchEvent(new CustomEvent("stories:play", { detail: { slug }, cancelable: true }));
    }
  }

  /** Foreground reconciliation: finish a story whose `ended` we never saw. */
  function reconcile() {
    const total = mine() && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    if (!total) return;
    if (!audio.paused && !audio.ended) return; // still listening
    const record = read(slug);
    if (record && viewModel(record).state === "finished") return; // already counted
    const reached = Math.max(audio.currentTime, record?.audioTime ?? 0);
    if (reached >= total - COMPLETE_WINDOW_SEC) {
      markCompleted(slug);
      lastSaved = 0;
    }
  }

  const record = read(slug);
  const params = new URLSearchParams(window.location.search);

  if (mine() && params.get("autoplay") === "1") {
    // The listener already chose Play on the previous page, so no resume banner.
    if (record) audio.currentTime = startPosition(record);
    play();
    try {
      params.delete("autoplay");
      const query = params.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
    } catch {
      // history unavailable: the param just stays
    }
  } else if (record && viewModel(record).state === "in-progress"
    && (record.audioTime > RESUME_AUDIO_SEC || record.scrollY > RESUME_SCROLL_PX)) {
    const resume = h("button", { type: "button", class: "btn btn-primary", "data-role": "resume-button" }, "Resume where you left off");
    const restart = h("button", { type: "button", class: "btn", "data-role": "restart-button" }, "Start over");
    // Both buttons start playback as well as moving to the place: they are Play buttons
    // with a position, and a tap that only moved the audio looked like it did nothing.
    resume.addEventListener("click", () => {
      if (record.scrollY) window.scrollTo({ top: record.scrollY, behavior: "smooth" });
      show();
      playAt(record.audioTime);
    });
    restart.addEventListener("click", () => {
      // Keep completedAt: starting over is not un-finishing a story.
      write(slug, { audioTime: 0, scrollY: 0, playing: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
      show();
      playAt(0);
    });
    show(resume, restart);
  }

  if (audio) {
    lastSaved = audio.currentTime;
    on(audio, "timeupdate", whenMine(() => {
      if (Math.abs(audio.currentTime - lastSaved) >= SAVE_EVERY_SEC) {
        write(slug, { audioTime: audio.currentTime, playing: !audio.paused });
        lastSaved = audio.currentTime;
      }
    }));
    on(audio, "play", whenMine(() => {
      show(); // playing now: a Resume banner would seek back to a stale place
      write(slug, { playing: true });
    }));
    on(audio, "pause", whenMine(() => {
      // `pause` fires just before `ended`; the ended handler records that case.
      if (!audio.ended) write(slug, { audioTime: audio.currentTime, playing: false });
    }));
    on(audio, "ended", whenMine(() => {
      markCompleted(slug);
      lastSaved = 0;
    }));
    on(audio, "loadedmetadata", whenMine(reconcile));
    on(audio, "error", whenMine(() => {
      const retry = h("button", { type: "button", class: "btn", "data-role": "retry-button" }, "Try again");
      retry.addEventListener("click", () => {
        show();
        audio.load();
        play();
      });
      show(h("p", { class: "resume-note", "data-role": "audio-error" }, "This story's audio would not load."), retry);
    }));
    on(document, "stories:play", (event) => {
      // Only when the audio already holds this story. Otherwise the player loads it
      // (player.mjs claims the event) and this module takes over once it is loaded.
      if (event.detail?.slug !== slug || !mine()) return;
      event.preventDefault(); // we handle it on this page
      begin();
    });
    on(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") reconcile();
      else savePosition();
    });
    on(window, "pageshow", reconcile);
    reconcile();
  }

  function savePosition() {
    const partial = { scrollY: window.scrollY };
    if (mine() && !audio.paused && !audio.ended) {
      partial.audioTime = audio.currentTime;
      partial.playing = true;
    }
    // Do not create a record just because the page was opened and left.
    if (partial.audioTime !== undefined || partial.scrollY > 0 || read(slug)) write(slug, partial);
  }
  on(window, "pagehide", savePosition);

  let disposeMedia = () => {};
  let disposed = false;
  if (audio) {
    loadLibrary().then((lib) => {
      if (disposed) return;
      story = lib?.bySlug.get(slug) ?? null;
      // The player (player.mjs) sets Media Session for whatever it holds; this only
      // covers a page whose own story is the one loaded, never another story's.
      if (mine()) disposeMedia = setupMediaSession(story, audio);
    });
  }

  return () => {
    disposed = true;
    // Handlers now belong to whichever story is loaded; clear only our own.
    if (mine()) disposeMedia();
    for (const dispose of disposers.reverse()) dispose();
  };
}
