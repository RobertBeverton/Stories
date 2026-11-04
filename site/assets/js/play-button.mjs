// data-mount="play-button" data-slug="<slug>": a Play button.
// Click fires a cancelable `stories:play` {slug}. Whoever owns playback for that
// story (story-resume on its own page, the player) calls preventDefault().
// If nobody does, the button navigates to the story with ?autoplay=1, which
// story-resume handles on arrival. The label follows progress: "Resume" while in
// progress, "Play again" when finished, otherwise the template's own label. A
// button with child elements but no [data-role="label"] (an icon-only row
// button) keeps its content and only has its aria-label verb ("Play ...") swapped.
//
// A button marked `data-pause-when-playing` (the story page's own) is also a
// Pause button: while the shell audio holds this story and plays it, the label
// reads "Pause", the glyph is a pause, and a press pauses instead of asking to
// play. It follows the audio however playback was started (this page, the dock,
// Home, Library, the lock screen).
import { onProgressChange } from "./dom.mjs";
import { safeHref } from "./escape.mjs";
import { loadLibrary } from "./library.mjs";
import { nav } from "./nav.mjs";
import { read, toViewModel } from "./progress.mjs";
import { playsStory, shellAudio } from "./shell-audio.mjs";

const PAUSE_GLYPH = "M6 5h4v14H6zM14 5h4v14h-4z";
// Playback can change without a `play` event (a story swapped in while playing fires `playing`).
const AUDIO_EVENTS = ["play", "playing", "pause", "ended", "emptied", "loadedmetadata"];

export function mount(el) {
  const slug = el.dataset.slug;
  if (!slug) return () => {};
  // The label child, else the button itself when it holds only text.
  const labelEl = el.querySelector('[data-role="label"]') ?? (el.children.length === 0 ? el : null);
  const original = labelEl?.textContent;
  const originalAria = el.getAttribute("aria-label");
  const glyph = el.querySelector("svg path");
  const originalGlyph = glyph?.getAttribute("d");
  const audio = el.hasAttribute("data-pause-when-playing") ? shellAudio() : null;
  let library = null;
  let disposed = false;

  const pausing = () => Boolean(audio) && playsStory(audio, slug);

  function syncLabel() {
    const state = toViewModel(read(slug), { durationSec: library?.bySlug.get(slug)?.durationSec }).state;
    const playing = pausing();
    el.dataset.state = state;
    if (playing) el.dataset.playing = "true";
    else delete el.dataset.playing;
    const verb = playing ? "Pause" : state === "finished" ? "Play again" : state === "in-progress" ? "Resume" : "Play";
    if (labelEl) labelEl.textContent = verb === "Play" ? original : verb;
    if (originalAria?.startsWith("Play")) el.setAttribute("aria-label", verb + originalAria.slice("Play".length));
    if (audio && glyph) glyph.setAttribute("d", playing ? PAUSE_GLYPH : originalGlyph);
  }

  function onClick(event) {
    event.preventDefault();
    if (pausing()) {
      audio.pause();
      return;
    }
    const request = new CustomEvent("stories:play", { detail: { slug }, cancelable: true });
    if (!document.dispatchEvent(request)) return; // handled in place
    loadLibrary().then((lib) => {
      const story = lib?.bySlug.get(slug);
      if (story) nav.open(`${safeHref(story.url)}?autoplay=1`);
    });
  }

  el.addEventListener("click", onClick);
  const stop = onProgressChange(syncLabel);
  if (audio) for (const type of AUDIO_EVENTS) audio.addEventListener(type, syncLabel);
  syncLabel();
  loadLibrary().then((lib) => {
    if (disposed) return;
    library = lib;
    syncLabel();
  });

  return () => {
    disposed = true;
    el.removeEventListener("click", onClick);
    stop();
    if (audio) for (const type of AUDIO_EVENTS) audio.removeEventListener(type, syncLabel);
    if (labelEl) labelEl.textContent = original;
    if (originalAria !== null) el.setAttribute("aria-label", originalAria);
    if (audio && glyph) glyph.setAttribute("d", originalGlyph);
    delete el.dataset.state;
    delete el.dataset.playing;
  };
}
