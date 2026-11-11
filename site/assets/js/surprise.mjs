// data-mount="surprise" (an empty anchor on Home). Opens the Surprise me sheet when
// anything dispatches `stories:surprise` on document (the Home tile does).
// The sheet asks which world, picks a story straight away (never heard to the
// end first, then longest ago; see selectors.pickSurprise) and offers Play and
// "Another one", which never repeats an offer until the world runs out. The last
// world chosen is remembered per device. Titles, links and art come from
// library.json; audio never starts without a press on Play.
import { cover } from "./cover.mjs";
import { h } from "./dom.mjs";
import { safeHref } from "./escape.mjs";
import { loadLibrary } from "./library.mjs";
import { nav } from "./nav.mjs";
import { readAll, readPlays, toViewModel } from "./progress.mjs";
import { pickSurprise, worldsByRecent } from "./selectors.mjs";
import { createSheet } from "./sheet.mjs";

const KEY = "stories-surprise-world";

function savedWorld() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

function saveWorld(world) {
  try {
    if (world) localStorage.setItem(KEY, world);
    else localStorage.removeItem(KEY);
  } catch {
    // not remembered
  }
}

const times = (n) => (n === 1 ? "once" : `${n} times`);

export function mount() {
  let disposed = false;
  let library = null;
  let world = "";
  let offered = [];
  let current = null;

  const sheet = createSheet({ id: "surprise-sheet", title: "Surprise me!" });
  sheet.el.classList.add("surprise-sheet");
  const chips = h("div", { class: "sheet-chips", role: "group", "aria-label": "Which world?" });
  const result = h("div", { class: "surprise-result", "data-role": "surprise-result", "aria-live": "polite" });
  const playButton = h("button", { type: "button", class: "btn btn-primary btn-lg", "data-role": "surprise-play" }, "Play");
  const againButton = h("button", { type: "button", class: "btn btn-lg", "data-role": "surprise-again" }, "Another one");
  const actions = h("div", { class: "sheet-actions" }, playButton, againButton);
  sheet.body.append(h("p", { class: "sheet-label" }, "Which world?"), chips, result, actions);

  function drawChips() {
    const ordered = worldsByRecent(library.worlds, library.stories, readAll());
    const items = [{ name: "", title: "All worlds" }, ...ordered];
    chips.replaceChildren(...items.map((w) => h("button", {
      type: "button", class: "btn", "data-world": w.name, "aria-pressed": String(w.name === world),
    }, w.title)));
    const on = chips.querySelector('[aria-pressed="true"]');
    if (on) chips.scrollLeft = Math.max(0, on.offsetLeft - (chips.clientWidth - on.offsetWidth) / 2);
  }

  function showPick() {
    const records = readAll();
    const pick = pickSurprise(library.stories, { records, plays: readPlays(records), world, exclude: offered });
    current = pick?.story ?? null;
    if (!pick) {
      result.replaceChildren(h("p", { class: "empty" }, "No stories in this world yet."));
      playButton.disabled = true;
      againButton.disabled = true;
      return;
    }
    offered.push(pick.story.slug);
    playButton.disabled = false;
    againButton.disabled = pick.poolSize < 2;
    const story = pick.story;
    const state = toViewModel(records[story.slug], { durationSec: story.durationSec }).state;
    const status = pick.plays > 0 ? `Heard ${times(pick.plays)}` : state === "in-progress" ? "Started, not finished" : "Not heard yet";
    const meta = [story.series, story.durationSec ? `${Math.max(1, Math.round(story.durationSec / 60))} min` : null].filter(Boolean).join(" · ");
    result.replaceChildren(
      cover(story),
      h("div", { class: "surprise-text" },
        h("p", { class: "surprise-status" }, status),
        h("h3", { class: "surprise-title" }, story.title),
        meta ? h("p", { class: "surprise-meta" }, meta) : null),
    );
  }

  function choose(next) {
    world = next;
    saveWorld(world);
    offered = [];
    for (const button of chips.children) button.setAttribute("aria-pressed", String(button.dataset.world === world));
    showPick();
  }

  chips.addEventListener("click", (event) => {
    const button = event.target.closest?.("button[data-world]");
    if (button && chips.contains(button)) choose(button.dataset.world);
  });
  againButton.addEventListener("click", showPick);
  playButton.addEventListener("click", () => {
    const story = current;
    if (!story) return;
    sheet.close({ restoreFocus: false });
    const request = new CustomEvent("stories:play", { detail: { slug: story.slug }, cancelable: true });
    if (!document.dispatchEvent(request)) return; // the player took it
    nav.open(`${safeHref(story.url)}?autoplay=1`);
  });

  function onSurprise() {
    if (!library || sheet.isOpen()) return;
    const known = savedWorld();
    world = library.worlds.some((w) => w.name === known) ? known : "";
    offered = [];
    drawChips();
    showPick();
    sheet.open();
  }

  document.addEventListener("stories:surprise", onSurprise);
  loadLibrary().then((lib) => {
    if (!disposed) library = lib;
  });

  return () => {
    disposed = true;
    document.removeEventListener("stories:surprise", onSurprise);
    sheet.destroy();
  };
}

