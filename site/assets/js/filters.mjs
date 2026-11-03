// data-mount="filters": filter chips for the library list, plus the row markers.
// Filters: world (from world-switcher / stories:world), series, under 15
// minutes, and a status group (in progress, finished, new).
// Rows are `[data-role="story-row"][data-slug]`. This module also sets, on every
// row, data-state="new|in-progress|finished" (progress) and data-new="true" for
// the New marker, so CSS can draw them.
import { h, onProgressChange } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import { readAll, toViewModel } from "./progress.mjs";
import { isNew, matchesFilters, UNDER_MINUTES } from "./selectors.mjs";
import { setHiddenReason, storyRows, updateNoResults } from "./visibility.mjs";
import { getWorld } from "./world-state.mjs";

const STATUSES = [
  ["in-progress", "In progress"],
  ["finished", "Finished"],
  ["new", "New"],
];

export function mount(el) {
  let disposed = false;
  let library = null;
  const state = { world: getWorld(), series: "", under15: false, statuses: new Set() };
  let seriesSelect = null;
  const buttons = new Map();

  function seriesInWorld() {
    const names = library.stories
      .filter((s) => !state.world || s.world === state.world)
      .map((s) => s.series)
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }

  function rebuildSeries() {
    const names = seriesInWorld();
    if (!names.includes(state.series)) state.series = "";
    seriesSelect.replaceChildren(h("option", { value: "" }, "All series"));
    for (const name of names) seriesSelect.append(h("option", { value: name }, name));
    seriesSelect.value = state.series;
    seriesSelect.hidden = names.length < 2;
  }

  function apply() {
    if (disposed || !library) return;
    const records = readAll();
    const now = Date.now();
    const filter = { world: state.world, series: state.series, under15: state.under15, statuses: [...state.statuses] };
    for (const row of storyRows()) {
      const story = library.bySlug.get(row.dataset.slug);
      if (!story) continue;
      const record = records[story.slug];
      row.dataset.state = toViewModel(record, { durationSec: story.durationSec }).state;
      if (isNew(story, record, now)) row.dataset.new = "true";
      else delete row.dataset.new;
      setHiddenReason(row, "filters", !matchesFilters(story, record, filter, now));
    }
    updateNoResults();
  }

  function toggle(key, button, on) {
    button.setAttribute("aria-pressed", String(on));
    if (key === "under15") state.under15 = on;
    else if (on) state.statuses.add(key);
    else state.statuses.delete(key);
    apply();
  }

  function chip(key, label) {
    const button = h("button", { type: "button", "aria-pressed": "false", "data-filter": key }, label);
    button.addEventListener("click", () => toggle(key, button, button.getAttribute("aria-pressed") !== "true"));
    buttons.set(key, button);
    return button;
  }

  const onWorld = (event) => {
    state.world = event.detail?.world ?? "";
    if (seriesSelect) rebuildSeries();
    apply();
  };
  document.addEventListener("stories:world", onWorld);
  const stop = onProgressChange(apply);

  loadLibrary().then((lib) => {
    if (disposed || !lib) return;
    library = lib;
    if (state.world && !lib.worlds.some((w) => w.name === state.world)) state.world = "";
    seriesSelect = h("select", { "aria-label": "Series", "data-role": "series" });
    seriesSelect.addEventListener("change", () => {
      state.series = seriesSelect.value;
      apply();
    });
    const group = h(
      "div",
      { role: "group", "aria-label": "Filter stories", "data-role": "filters" },
      seriesSelect,
      chip("under15", `Under ${UNDER_MINUTES} minutes`),
      ...STATUSES.map(([key, label]) => chip(key, label)),
    );
    el.replaceChildren(group);
    rebuildSeries();
    apply();
  });

  return () => {
    disposed = true;
    document.removeEventListener("stories:world", onWorld);
    stop();
    el.replaceChildren();
    for (const row of storyRows()) setHiddenReason(row, "filters", false);
    updateNoResults();
  };
}
