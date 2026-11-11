// data-mount="played-lately": the "Pick a story" row on Home. Two stories, then a
// Surprise me tile that opens the Surprise me sheet (surprise.mjs).
//   - The two are the most recently played stories (finished or not, so a
//     replayed favourite never disappears), leaving out the story the Continue
//     card already shows.
//   - With less history than that, the row is filled with the newest stories
//     (not the Continue story), marked "Not played yet", so it is never bare.
// Titles, links and art come from library.json only.
import { cover } from "./cover.mjs";
import { h, renderIfChanged } from "./dom.mjs";
import { safeHref } from "./escape.mjs";
import { loadLibrary } from "./library.mjs";
import { readAll, readPlays } from "./progress.mjs";
import { byNewest, pickContinue, pickPlayedLately } from "./selectors.mjs";
import { onLiveProgress, withLiveProgress } from "./shell-audio.mjs";

const SHOWN = 2;

function stateLabel(state, plays) {
  if (state === "finished") return plays > 1 ? `Heard ${plays} times` : "Finished";
  if (state === "in-progress") return "In progress";
  return "Not played yet";
}

/** A die drawn with the same round strokes as the line icons (decorative). */
function dice() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  for (const [name, value] of Object.entries({ x: 4, y: 4, width: 16, height: 16, rx: 4 })) rect.setAttribute(name, String(value));
  svg.append(rect);
  for (const [cx, cy] of [[9, 9], [15, 9], [9, 15], [15, 15]]) {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", String(cy));
    dot.setAttribute("r", "1.3");
    svg.append(dot);
  }
  return svg;
}

export function mount(el) {
  let disposed = false;
  let library = null;

  function choose(records) {
    const resume = pickContinue(library.stories, records);
    const skip = resume?.story.slug;
    const played = pickPlayedLately(library.stories, records, SHOWN + 1)
      .filter((p) => p.story.slug !== skip)
      .slice(0, SHOWN);
    if (played.length < SHOWN) {
      const taken = new Set([skip, ...played.map((p) => p.story.slug)]);
      const fill = [...library.stories].sort(byNewest).filter((s) => !taken.has(s.slug)).slice(0, SHOWN - played.length);
      for (const story of fill) played.push({ story, state: "new", fraction: 0 });
    }
    return played;
  }

  function render() {
    if (disposed || !library) return;
    const records = withLiveProgress(readAll());
    const plays = readPlays(records);
    const picks = choose(records);
    const signature = picks.map((p) => `${p.story.slug}:${p.state}:${plays[p.story.slug] ?? 0}`).join("|");
    el.hidden = false;
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
              h("span", { class: "lately-state", "data-role": "state" }, stateLabel(state, plays[story.slug] ?? 0)),
            ),
          ),
        );
      }
      const tile = h(
        "button",
        { type: "button", class: "lately-item lately-surprise", "data-role": "surprise-tile" },
        h("span", { class: "cover", "aria-hidden": "true" }, dice()),
        h("span", { class: "lately-title" }, "Surprise me!"),
        h("span", { class: "lately-state" }, "Something new"),
      );
      tile.addEventListener("click", () => document.dispatchEvent(new CustomEvent("stories:surprise")));
      list.append(h("li", { "data-role": "item" }, tile));
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

