// data-mount="parts" data-slug="<slug>": the part list for a story with
// `parts` in library.json. Highlights the part the audio clock is in (the
// button, and the matching heading in the story text) and jumps on tap.
// Stories without parts leave the root empty. The audio is the shell's
// <audio data-role="shell-audio"> (shell-audio.mjs), followed only while it holds this story. Part changes are never announced: no live region is
// created, and nothing scrolls the page.
import { h } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import { holdsStory, shellAudio } from "./shell-audio.mjs";

const EPSILON = 0.05; // seconds; a tick just before a boundary still counts as inside the part

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function cleanParts(parts) {
  if (!Array.isArray(parts)) return [];
  return parts.filter(
    (p) => p && typeof p.title === "string" && p.title.trim() !== "" && Number.isFinite(p.start) && p.start >= 0,
  );
}

/** Index of the last part that has started at `time`, or -1 before the first. */
export function currentPartIndex(parts, time) {
  let index = -1;
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i].start <= time + EPSILON) index = i;
  }
  return index;
}

export function mount(el) {
  let disposed = false;
  let cleanup = () => {};

  loadLibrary().then((lib) => {
    if (disposed) return;
    const parts = cleanParts(lib?.bySlug.get(el.dataset.slug)?.parts);
    if (parts.length === 0) {
      el.replaceChildren();
      return;
    }
    cleanup = build(el, el.dataset.slug, parts);
  });

  return () => {
    disposed = true;
    cleanup();
    el.replaceChildren();
  };
}

function build(el, slug, parts) {
  const audio = shellAudio();
  const body = (el.closest("article") ?? document).querySelector(".story-body");
  const bodyHeadings = body ? [...body.querySelectorAll("h1, h2, h3, h4, h5, h6")] : [];
  const headings = parts.map(
    (part) => bodyHeadings.find((heading) => heading.textContent.trim() === part.title.trim()) ?? null,
  );

  const buttons = parts.map((part, index) =>
    h(
      "button",
      { type: "button", class: "btn", "data-role": "part", "data-index": index },
      h("span", { class: "part-title" }, part.title),
      " ",
      h("span", { class: "part-time" }, formatTime(part.start)),
    ),
  );
  const list = h(
    "ul",
    { class: "parts-list", "data-role": "parts-list", "aria-label": "Parts of this story" },
    ...buttons.map((button) => h("li", {}, button)),
  );
  // Collapsed by default: ten rows push the story far down the page. The
  // summary names the current part so the list's value survives being closed.
  const nowLabel = h("span", { class: "parts-now" });
  const details = h(
    "details",
    { class: "parts-details", "data-role": "parts-details" },
    h("summary", {}, h("span", { class: "parts-label" }, "Parts"), nowLabel),
    list,
  );
  el.replaceChildren(details);

  // The shell's player may be playing another story; only follow our own.
  const ours = () => holdsStory(audio, slug);

  let shown = -2;
  function show(index) {
    if (index === shown) return;
    shown = index;
    buttons.forEach((button, i) => {
      if (i === index) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    nowLabel.textContent = index >= 0 ? parts[index].title : "";
  }

  // The heading in the text is marked only while this story is playing, so the
  // mark always means "you are hearing this part now". Paused, finished or
  // handed to another story: no mark, instead of a stale one.
  let marked = -2;
  function mark(index) {
    if (index === marked) return;
    marked = index;
    headings.forEach((heading, i) => heading?.classList.toggle("part-current", i === index));
  }

  const sync = () => {
    if (!ours()) {
      mark(-1);
      return;
    }
    const index = currentPartIndex(parts, audio.currentTime);
    show(index);
    mark(audio.paused || audio.ended ? -1 : index);
  };
  const onClick = (event) => {
    const button = event.target.closest?.('button[data-role="part"]');
    if (!button || !list.contains(button) || !ours()) return;
    const index = Number(button.dataset.index);
    // Seek only: a paused story stays paused, a playing one keeps playing.
    audio.currentTime = parts[index].start;
    show(index);
    mark(audio.paused || audio.ended ? -1 : index);
  };

  const events = ["timeupdate", "seeked", "loadedmetadata", "play", "playing", "pause", "ended", "emptied"];
  list.addEventListener("click", onClick);
  if (audio) for (const name of events) audio.addEventListener(name, sync);
  sync();

  return () => {
    list.removeEventListener("click", onClick);
    if (audio) for (const name of events) audio.removeEventListener(name, sync);
    headings.forEach((heading) => heading?.classList.remove("part-current"));
  };
}
