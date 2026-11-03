// data-mount="play-button" data-slug="<slug>": a Play button.
// Click fires a cancelable `stories:play` {slug}. Whoever owns playback for that
// story (story-resume on its own page, the wave 2 player) calls preventDefault().
// If nobody does, the button navigates to the story with ?autoplay=1, which
// story-resume handles on arrival. The label follows progress: "Resume" while in
// progress, "Play again" when finished, otherwise the template's own label.
import { onProgressChange } from "./dom.mjs";
import { safeHref } from "./escape.mjs";
import { loadLibrary } from "./library.mjs";
import { nav } from "./nav.mjs";
import { read, toViewModel } from "./progress.mjs";

export function mount(el) {
  const slug = el.dataset.slug;
  if (!slug) return () => {};
  const labelEl = el.querySelector('[data-role="label"]') ?? el;
  const original = labelEl.textContent;
  let library = null;
  let disposed = false;

  function syncLabel() {
    const state = toViewModel(read(slug), { durationSec: library?.bySlug.get(slug)?.durationSec }).state;
    el.dataset.state = state;
    labelEl.textContent = state === "finished" ? "Play again" : state === "in-progress" ? "Resume" : original;
  }

  function onClick(event) {
    event.preventDefault();
    const request = new CustomEvent("stories:play", { detail: { slug }, cancelable: true });
    if (!document.dispatchEvent(request)) return; // handled in place
    loadLibrary().then((lib) => {
      const story = lib?.bySlug.get(slug);
      if (story) nav.go(`${safeHref(story.url)}?autoplay=1`);
    });
  }

  el.addEventListener("click", onClick);
  const stop = onProgressChange(syncLabel);
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
    labelEl.textContent = original;
    delete el.dataset.state;
  };
}
