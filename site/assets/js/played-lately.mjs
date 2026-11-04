// data-mount="played-lately": the three most recently played stories, finished
// or not, so a replayed favourite never disappears. Hidden when there is no
// history. Titles, links and art come from library.json only.
import { cover } from "./cover.mjs";
import { h, renderIfChanged } from "./dom.mjs";
import { safeHref } from "./escape.mjs";
import { loadLibrary } from "./library.mjs";
import { readAll } from "./progress.mjs";
import { pickPlayedLately } from "./selectors.mjs";
import { onLiveProgress, withLiveProgress } from "./shell-audio.mjs";

const STATE_LABEL = { finished: "Finished", "in-progress": "In progress" };

export function mount(el) {
  let disposed = false;
  let library = null;

  function render() {
    if (disposed || !library) return;
    const picks = pickPlayedLately(library.stories, withLiveProgress(readAll()), 3);
    if (picks.length === 0) {
      el.hidden = true;
      el.replaceChildren();
      delete el.dataset.renderSignature;
      return;
    }
    el.hidden = false;
    const signature = picks.map((p) => `${p.story.slug}:${p.state}`).join("|");
    renderIfChanged(el, signature, () => {
      const list = h("ul", { class: "lately", "data-role": "list" });
      for (const { story, state } of picks) {
        const world = library.worlds.find((w) => w.name === story.world);
        list.append(
          h(
            "li",
            { "data-role": "item" },
            h(
              "a",
              {
                class: "lately-item",
                href: safeHref(story.url),
                "data-slug": story.slug,
                "data-state": state,
                "data-world": story.world,
                "data-icon": story.icon,
                "data-accent": world?.accent,
              },
              cover(story),
              h("span", { class: "lately-title", "data-role": "title" }, story.title),
              h("span", { class: "lately-state", "data-role": "state" }, STATE_LABEL[state]),
            ),
          ),
        );
      }
      return [list];
    });
  }

  const stop = onLiveProgress(render);
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
