// data-mount="continue": the big Continue card on Home. Shows the most recent
// unfinished story; with no history, the newest story. Everything displayed
// comes from library.json; storage only decides which story and how far.
import { h, onProgressChange, renderIfChanged } from "./dom.mjs";
import { safeHref } from "./escape.mjs";
import { loadLibrary } from "./library.mjs";
import { readAll } from "./progress.mjs";
import { pickContinue } from "./selectors.mjs";

const KICKER = { resume: "Continue", start: "Start here", again: "Play again" };
const ACTION = { resume: "Resume", start: "Play", again: "Play again" };

export function mount(el) {
  let disposed = false;
  let library = null;

  function render() {
    if (disposed || !library) return;
    const pick = pickContinue(library.stories, readAll());
    if (!pick) {
      el.hidden = true;
      return;
    }
    const { story, kind, fraction } = pick;
    const percent = Math.round(fraction * 100);
    const signature = [story.slug, kind, percent].join("|");
    el.hidden = false;
    renderIfChanged(el, signature, () => {
      const world = library.worlds.find((w) => w.name === story.world);
      const card = h(
        "a",
        {
          "data-role": "card",
          "data-state": kind,
          "data-slug": story.slug,
          "data-world": story.world,
          "data-icon": story.icon,
          "data-accent": world?.accent,
          href: `${safeHref(story.url)}?autoplay=1`,
        },
        h("span", { "data-role": "kicker" }, KICKER[kind]),
        h("span", { "data-role": "title" }, story.title),
        kind === "resume"
          ? h("progress", { "data-role": "bar", max: 100, value: percent, "aria-label": `${percent}% listened` })
          : null,
        h("span", { "data-role": "action" }, ACTION[kind]),
      );
      return [card];
    });
  }

  const stop = onProgressChange(render);
  loadLibrary().then((lib) => {
    if (disposed) return;
    library = lib;
    if (!lib) {
      el.hidden = true;
      return;
    }
    render();
  });

  return () => {
    disposed = true;
    stop();
    el.replaceChildren();
    delete el.dataset.renderSignature;
  };
}
