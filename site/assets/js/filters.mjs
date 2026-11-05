// data-mount="filters": the Library's browsing controls and view.
//
// It builds (inside the root) one scrolling row of filter chips (In progress,
// Not played, Has audio, Under 15 min); puts the sort select, and, when the scope has two
// or more lore traditions, a Tradition select, into `[data-role="sort-slot"]`;
// keeps the count in
// `[data-role="results-status"]`; and arranges the template's story rows
// (`[data-role="story-row"][data-slug]`, never recreated, so their play buttons
// keep working) into a `[data-role="library-view"]` placed before the rows' list:
//
//  - grouped (the default): one collapsed card per series (and one for single
//    stories), freshest first, each opening to an ordered list with "Show 10 more";
//    a scope with a single series opens it. World comes from the world switcher.
//  - flat: while a search is typed or any chip is on, the matching rows in one
//    list (20 at a time) with a "n of N stories" count.
//
// Rows are never removed; hidden ones carry `hidden` through data-hidden-by
// reasons (filters, search, page). Every row also gets data-state, --progress
// and data-new="true" (the New marker) for CSS.
import { cover } from "./cover.mjs";
import { h, onProgressChange } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import { getSort, readView, setSort, SORTS, writeView } from "./library-state.mjs";
import { readAll, toViewModel } from "./progress.mjs";
import {
  collectionsFor, groupStories, isNew, matchesFilters, matchesQuery, orderStories, PAGE_SIZE,
  seriesSummary, UNDER_MINUTES, visibleLimit,
} from "./selectors.mjs";
import { setHiddenReason, storyRows, updateNoResults } from "./visibility.mjs";
import { getWorld, knownWorld } from "./world-state.mjs";

const STATUSES = [
  ["in-progress", "In progress"],
  ["not-played", "Not played"],
];
const FLAT_PAGE = 20;
const GROUP_PAGE = 12;
const SORT_LABELS = { order: "Story order", newest: "Newest" };
const NEXT_LABELS = { continue: "Continue", next: "Next up" };
let uid = 0;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Puts `items` in `parent` in this order, touching the DOM only when it differs. */
function ensureOrder(parent, items) {
  const same = parent.children.length === items.length && items.every((item, i) => parent.children[i] === item);
  if (same) return;
  for (const item of items) parent.append(item);
}

export function mount(el) {
  let disposed = false;
  let library = null;
  const saved = readView();
  const state = {
    world: getWorld(),
    under15: saved.under15,
    audio: saved.audio,
    statuses: new Set(saved.statuses),
    collection: saved.collection,
    sort: getSort(),
    open: { ...saved.open },
    pages: { ...saved.pages },
    flatPages: saved.flatPages,
    groupPages: saved.groupPages,
  };
  const hadState = state.under15 || state.audio || state.statuses.size > 0 || state.collection || Object.keys(state.open).length > 0 || state.flatPages > 1;

  const originalRows = storyRows();
  const originalList = originalRows[0]?.parentElement ?? document.querySelector("#stories");
  const rowBySlug = new Map(originalRows.map((row) => [row.dataset.slug, row]));
  const status = document.querySelector('[data-role="results-status"]');
  const sortSlot = document.querySelector('[data-role="sort-slot"]');
  if (status) status.dataset.managed = "filters";

  // ---- the view's fixed parts ----
  const groupsEl = h("div", { class: "series-list", "data-role": "groups" });
  const groupsMore = h("button", { type: "button", class: "btn show-more", "data-role": "show-more-groups" });
  const flatList = h("ul", { class: "rows" });
  const flatMore = h("button", { type: "button", class: "btn show-more", "data-role": "flat-more" });
  const flatEl = h("div", { class: "flat-results", "data-role": "flat" }, flatList, flatMore);
  const view = h("div", { class: "library-view", "data-role": "library-view" }, groupsEl, groupsMore, flatEl);
  originalList?.before(view);

  // ---- controls ----
  const buttons = new Map();
  const chipsRow = h("div", { class: "chip-row", role: "group", "aria-label": "Filter stories", "data-role": "filters" });
  const collectionSelect = h("select", { class: "filter-select", "aria-label": "Tradition", "data-role": "collection", hidden: true });
  collectionSelect.addEventListener("change", () => {
    state.collection = collectionSelect.value;
    state.flatPages = 1;
    render();
  });
  const clearButton = h("button", { type: "button", class: "btn btn-quiet", "data-role": "clear", hidden: true }, "Clear");
  const sortSelect = h("select", { class: "filter-select", "aria-label": "Sort stories", "data-role": "sort" },
    ...SORTS.map((value) => h("option", { value }, SORT_LABELS[value])));
  sortSelect.value = state.sort;

  function chip(key, label) {
    const button = h("button", { type: "button", class: "btn", "aria-pressed": String(key === "under15" ? state.under15 : key === "audio" ? state.audio : state.statuses.has(key)), "data-filter": key }, label);
    button.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(on));
      if (key === "under15") state.under15 = on;
      else if (key === "audio") state.audio = on;
      else if (on) state.statuses.add(key);
      else state.statuses.delete(key);
      state.flatPages = 1;
      render();
    });
    buttons.set(key, button);
    return button;
  }
  chipsRow.append(...STATUSES.map(([key, label]) => chip(key, label)), chip("audio", "Has audio"), chip("under15", `Under ${UNDER_MINUTES} min`));
  el.replaceChildren(chipsRow);
  if (sortSlot) sortSlot.replaceChildren(clearButton, collectionSelect, sortSelect);
  else el.append(clearButton, collectionSelect, sortSelect);

  // ---- series cards, built once per series and kept ----
  const cards = new Map();
  let groups = [];

  function card(group) {
    if (cards.has(group.key)) return cards.get(group.key);
    const id = `series-body-${++uid}`;
    const summary = h("span", { class: "series-summary", "data-role": "group-summary" });
    const bar = h("i");
    const toggle = h(
      "button",
      { type: "button", class: "series-toggle", "aria-expanded": "false", "aria-controls": id, "data-role": "group-toggle" },
      cover({ icon: group.stories[0].icon, series: group.standalone ? null : group.name }, "series-cover"),
      h("span", { class: "series-text" },
        h("span", { class: "series-eyebrow", "data-role": "group-world", hidden: true }),
        h("span", { class: "series-name" }, group.standalone ? "Single stories" : group.name),
        summary,
        h("span", { class: "bar series-bar", "aria-hidden": "true" }, bar)),
    );
    const nextSlot = h("div", { class: "series-next-slot" });
    const list = h("ul", { class: "rows" });
    const more = h("button", { type: "button", class: "btn show-more", "data-role": "show-more" });
    const body = h("div", { class: "series-body", id, "data-role": "group-body", hidden: true }, list, more);
    const el2 = h("section", { class: "series-group", "data-role": "series-group", "data-key": group.key }, h("h2", { class: "series-head" }, toggle), nextSlot, body);
    const parts = { el: el2, toggle, summary, bar, nextSlot, list, more, body, eyebrow: toggle.querySelector('[data-role="group-world"]'), group };
    toggle.addEventListener("click", () => {
      state.open[group.key] = toggle.getAttribute("aria-expanded") !== "true";
      render();
    });
    more.addEventListener("click", () => {
      const before = visibleLimit(parts.group.stories.length, state.pages[group.key] ?? 1);
      state.pages[group.key] = (state.pages[group.key] ?? 1) + 1;
      render();
      rowBySlug.get(parts.group.stories[before]?.slug)?.querySelector("a")?.focus();
    });
    cards.set(group.key, parts);
    groupsEl.append(el2);
    return parts;
  }

  function regroup() {
    groups = groupStories(library.stories, state.sort);
    for (const group of groups) card(group).group = group;
  }

  // ---- render ----
  function currentQuery() {
    const input = document.querySelector('input[data-mount="search"], [data-mount="search"] input');
    return input?.value ?? "";
  }

  function rebuildCollections(scope) {
    const found = collectionsFor(scope, library.lore);
    if (state.collection && !found.some((c) => c.name === state.collection)) state.collection = "";
    const signature = found.map((c) => c.name).join("|");
    if (collectionSelect.dataset.signature !== signature) {
      collectionSelect.dataset.signature = signature;
      collectionSelect.replaceChildren(h("option", { value: "" }, "Any tradition"), ...found.map((c) => h("option", { value: c.name }, c.name)));
    }
    collectionSelect.value = state.collection;
    collectionSelect.hidden = found.length < 2 || !state.world; // a tradition makes sense inside one world
    collectionSelect.dataset.active = String(Boolean(state.collection));
  }

  function render() {
    if (disposed || !library) return;
    const records = readAll();
    const now = Date.now();
    const query = currentQuery();
    const scope = library.stories.filter((s) => !state.world || s.world === state.world);
    rebuildCollections(scope);
    const flat = Boolean(query.trim()) || state.under15 || state.audio || state.statuses.size > 0 || Boolean(state.collection);
    const filter = { world: state.world, under15: state.under15, audio: state.audio, statuses: [...state.statuses], collection: state.collection, lore: library.lore };

    // Row state, and which stories match everything.
    const matched = [];
    for (const story of library.stories) {
      const row = rowBySlug.get(story.slug);
      if (!row) continue;
      const record = records[story.slug];
      const vm = toViewModel(record, { durationSec: story.durationSec });
      row.dataset.state = vm.state;
      row.style.setProperty("--progress", `${Math.round(vm.fraction * 100)}%`);
      if (isNew(story, record, now)) row.dataset.new = "true";
      else delete row.dataset.new;
      const ok = matchesFilters(story, record, filter, now);
      setHiddenReason(row, "filters", !ok);
      if (ok && matchesQuery(story, query)) matched.push(story);
    }

    const pageHidden = new Set();
    const rowsOf = (stories) => stories.map((s) => rowBySlug.get(s.slug)).filter(Boolean);

    if (flat) {
      groupsEl.hidden = true;
      groupsMore.hidden = true;
      flatEl.hidden = false;
      const ordered = orderStories(matched, state.sort);
      ensureOrder(flatList, rowsOf(ordered));
      const limit = visibleLimit(ordered.length, state.flatPages, FLAT_PAGE);
      ordered.slice(limit).forEach((s) => pageHidden.add(s.slug));
      flatMore.hidden = limit >= ordered.length;
      flatMore.textContent = `Show ${Math.min(FLAT_PAGE, ordered.length - limit)} more`;
    } else {
      flatEl.hidden = true;
      groupsEl.hidden = false;
      const inScope = groups.filter((g) => !state.world || g.world === state.world);
      const limit = visibleLimit(inScope.length, state.groupPages, GROUP_PAGE);
      const shown = new Set(inScope.slice(0, limit).map((g) => g.key));
      const outside = groups.filter((g) => !inScope.includes(g));
      ensureOrder(groupsEl, [...inScope, ...outside].map((g) => cards.get(g.key).el));
      groupsMore.hidden = limit >= inScope.length;
      groupsMore.textContent = `Show ${Math.min(GROUP_PAGE, inScope.length - limit)} more series`;
      const showWorld = !state.world && library.worlds.length > 1;
      for (const g of groups) {
        const parts = cards.get(g.key);
        parts.el.hidden = !shown.has(g.key);
        if (parts.el.hidden) continue;
        const expanded = state.open[g.key] ?? inScope.length === 1;
        parts.toggle.setAttribute("aria-expanded", String(expanded));
        parts.body.hidden = !expanded;
        parts.el.dataset.expanded = String(expanded);
        const info = seriesSummary(g.stories, records);
        const text = plural(info.total, "story", "stories") + (info.allHeard ? " · all heard" : info.heard > 0 ? ` · ${info.heard} heard` : "");
        if (parts.summary.textContent !== text) parts.summary.textContent = text;
        parts.bar.style.width = `${Math.round((info.heard / info.total) * 100)}%`;
        parts.bar.parentElement.hidden = info.heard === 0;
        parts.eyebrow.hidden = !showWorld;
        if (showWorld) parts.eyebrow.textContent = library.worlds.find((w) => w.name === g.world)?.title ?? g.world;
        fillNext(parts, info.next);
        ensureOrder(parts.list, rowsOf(g.stories));
        const rowLimit = visibleLimit(g.stories.length, state.pages[g.key] ?? 1);
        g.stories.slice(rowLimit).forEach((s) => pageHidden.add(s.slug));
        parts.more.hidden = rowLimit >= g.stories.length;
        parts.more.textContent = `Show ${Math.min(PAGE_SIZE, g.stories.length - rowLimit)} more`;
      }
    }
    for (const [slug, row] of rowBySlug) setHiddenReason(row, "page", pageHidden.has(slug));

    // Count (a live region), clear button and the empty message.
    const total = scope.length;
    const text = flat && matched.length !== total ? `${matched.length} of ${total} stories` : plural(total, "story", "stories");
    if (status && status.textContent !== text) status.textContent = text;
    clearButton.hidden = !flat;
    updateNoResults();
    persist();
    if (!hadRendered) {
      hadRendered = true;
      if (hadState && window.scrollY === 0 && history.state?.scrollY > 0) window.scrollTo(0, history.state.scrollY);
    }
  }
  let hadRendered = false;

  function fillNext(parts, next) {
    const signature = next && next.kind !== "start" ? `${next.kind}|${next.story.slug}` : "";
    if (parts.nextSlot.dataset.signature === signature) return;
    parts.nextSlot.dataset.signature = signature;
    if (!next || next.kind === "start") { // nothing heard yet: the card itself is the way in, no repeated hint
      parts.nextSlot.replaceChildren();
      return;
    }
    parts.nextSlot.replaceChildren(
      h("a", { class: "series-next", href: next.story.url, "data-role": "group-next" },
        h("span", { class: "series-next-label" }, `${NEXT_LABELS[next.kind]}: `),
        h("span", { class: "series-next-title" }, next.story.title)),
    );
  }

  function persist() {
    writeView({
      under15: state.under15,
      audio: state.audio,
      statuses: [...state.statuses],
      collection: state.collection,
      open: state.open,
      pages: state.pages,
      flatPages: state.flatPages,
      groupPages: state.groupPages,
    });
  }

  // ---- events ----
  groupsMore.addEventListener("click", () => {
    state.groupPages += 1;
    render();
  });
  flatMore.addEventListener("click", () => {
    const before = flatList.querySelectorAll("li:not([hidden])").length;
    state.flatPages += 1;
    render();
    flatList.querySelectorAll("li:not([hidden])")[before]?.querySelector("a")?.focus();
  });
  sortSelect.addEventListener("change", () => {
    state.sort = SORTS.includes(sortSelect.value) ? sortSelect.value : "order";
    setSort(state.sort);
    if (library) regroup();
    render();
  });
  clearButton.addEventListener("click", () => {
    state.under15 = false;
    state.audio = false;
    state.statuses.clear();
    state.collection = "";
    state.flatPages = 1;
    for (const button of buttons.values()) button.setAttribute("aria-pressed", "false");
    const input = document.querySelector('input[data-mount="search"], [data-mount="search"] input');
    if (input && input.value) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true })); // search.mjs updates its rows and calls us back
    }
    render();
    input?.focus();
  });
  const onWorld = (event) => {
    state.world = event.detail?.world ?? "";
    state.groupPages = 1;
    render();
  };
  const onSearch = () => {
    state.flatPages = 1;
    render();
  };
  document.addEventListener("stories:world", onWorld);
  document.addEventListener("stories:search", onSearch);
  const stop = onProgressChange(render);

  loadLibrary().then((lib) => {
    if (disposed || !lib) return;
    library = lib;
    state.world = knownWorld(state.world, lib.worlds); // a stale choice becomes All
    regroup();
    render();
  });

  return () => {
    disposed = true;
    document.removeEventListener("stories:world", onWorld);
    document.removeEventListener("stories:search", onSearch);
    stop();
    for (const row of originalRows) {
      originalList?.append(row);
      setHiddenReason(row, "filters", false);
      setHiddenReason(row, "page", false);
    }
    view.remove();
    el.replaceChildren();
    sortSlot?.replaceChildren();
    if (status) {
      delete status.dataset.managed;
      status.textContent = "";
    }
    updateNoResults();
  };
}
