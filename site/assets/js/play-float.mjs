// data-mount="play-float" data-slug="<slug>" data-title="<title>": a floating Play
// pill on the story page. It shows only while the page's own Play button
// (`[data-mount="play-button"][data-pause-when-playing]` for the same slug) has
// scrolled out of sight and the shell audio is not playing this story, so a long
// page never hides its one action. Once the story plays, the dock's mini player
// takes over and the pill goes away. A press clicks the page's own button, so
// there is one place that knows how to start, resume or replay. The label
// follows that button (Play, Resume, Play again).
import { h } from "./dom.mjs";
import { playsStory, shellAudio } from "./shell-audio.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const PLAY_GLYPH = "M8 5v14l11-7z";
const AUDIO_EVENTS = ["play", "playing", "pause", "ended", "emptied", "loadedmetadata"];

function playIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", PLAY_GLYPH);
  svg.append(path);
  return svg;
}

export function mount(el) {
  const slug = el.dataset.slug;
  const title = el.dataset.title ?? "";
  const target = [...document.querySelectorAll('[data-mount="play-button"][data-pause-when-playing]')].find((b) => b.dataset.slug === slug);
  if (!slug || !target) return () => {};

  const audio = shellAudio();
  const label = h("span", { "data-role": "label" }, "Play");
  const pill = h("button", { type: "button", class: "btn btn-primary play-float", "data-role": "play-float", hidden: true }, playIcon(), label);
  el.replaceChildren(pill);
  let inView = true; // until the observer reports, assume the page's button is in reach

  function sync() {
    const verb = target.querySelector('[data-role="label"]')?.textContent?.trim() || "Play";
    const playing = Boolean(audio) && playsStory(audio, slug);
    if (label.textContent !== verb) label.textContent = verb;
    pill.setAttribute("aria-label", title ? `${verb} ${title}` : verb);
    pill.hidden = inView || playing;
  }

  pill.addEventListener("click", () => target.click());

  // The bottom margin keeps a button hiding behind the dock counted as out of sight.
  const observer = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => {
        inView = entries[entries.length - 1].isIntersecting;
        sync();
      }, { rootMargin: "0px 0px -80px 0px" })
    : null;
  observer?.observe(target);

  const watch = new MutationObserver(sync);
  watch.observe(target, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-state", "data-playing"] });
  if (audio) for (const type of AUDIO_EVENTS) audio.addEventListener(type, sync);
  sync();

  return () => {
    observer?.disconnect();
    watch.disconnect();
    if (audio) for (const type of AUDIO_EVENTS) audio.removeEventListener(type, sync);
    el.replaceChildren();
  };
}
