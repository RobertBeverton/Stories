// data-mount="filters": the Library's browsing controls and view.
//
// It builds (inside the root) one Filters button that opens a bottom sheet
// (sheet.mjs) holding the filter chips (In progress, Not played, Has audio),
// a Tradition chip group (when the scope has two or more lore traditions inside
// one world) and the Order chips. Active filters show as removable chips, and a
// Clear button, in `[data-role="sort-slot"]`; the count is kept in
// `[data-role="results-status"]`; and it arranges the template's story rows
// (`[data-role="story-row"][data-slug]`, never recreated, so their play buttons
// keep working) into a `[data-role="library-view"]` placed before the rows' list:
//
//  - grouped (the default): one collapsed card per series (and one for single
//    stories), freshest first, each opening to an ordered list with "Show 10 more";
//    a scope with a single series drops the card and lists its stories directly.
//    World comes from the world switcher.
//  - flat: while a search is typed or any chip is on, the matching rows in one
//    list (20 at a time) with a "n of N stories" count.
//
// Rows are never removed; hidden ones carry `hidden` through data-hidden-by
// reasons (filters, search, page). Every row also gets data-state, --progress
// and data-new="true" (the New marker) for CSS.
import { cover } from "./cover.mjs";
import { basePath, h, onProgressChange } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import * as offline from "./offline.mjs";
import { getSort, readView, setSort, SORTS, writeView } from "./library-state.mjs";
import { readAll, readPlays, toViewModel } from "./progress.mjs";
import {
  buildSearchIndex, byMostHeard, collectionsFor, groupStories, isNew, matchesFilters, matchesQuery, orderStories, PAGE_SIZE, queryScore,
  seriesSummary, visibleLimit,
} from "./selectors.mjs";
import { createSheet } from "./sheet.mjs";
import { setHiddenReason, storyRows, updateNoResults } from "./visibility.mjs";
import { getWorld, knownWorld } from "./world-state.mjs";

const STATUSES = [
  ["in-progress", "In progress"],
  ["not-played", "Not played"],
];
const NOT_SAVED = "Not saved on this tablet";
const FLAT_PAGE = 20;
const GROUP_PAGE = 12;
const SORT_LABELS = { order: "Story order", newest: "Newest", plays: "Most heard" };
const NEXT_LABELS = { continue: "Continue", next: "Next up" };
const SVG_NS = "http://www.w3.org/2000/svg";
let uid = 0;

/** The sliders icon on the Filters button (decorative). */
function slidersIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({ width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "aria-hidden": "true" })) svg.setAttribute(k, v);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M4 7h10M18 7h2M4 17h2M10 17h10");
  svg.append(path);
  for (const [cx, cy] of [[16, 7], [8, 17]]) {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", cx);
    c.setAttribute("cy", cy);
    c.setAttribute("r", "2");
    svg.append(c);
  }
  return svg;
}

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
  let searchIndex = null;
  const saved = readView();
  const state = {
    world: getWorld(),
    audio: saved.audio,
    saved: saved.saved && offline.offlineSupported(),
    statuses: new Set(saved.statuses),
    collection: saved.collection,
    sort: getSort(),
    open: { ...saved.open },
    pages: { ...saved.pages },
    flatPages: saved.flatPages,
    groupPages: saved.groupPages,
  };
  const hadState = state.audio || state.saved || state.statuses.size > 0 || state.collection || Object.keys(state.open).length > 0 || state.flatPages > 1;

  const canSave = offline.offlineSupported();
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
  const notice = h("p", { class: "offline-toast", role: "status", "aria-live": "polite", "data-role": "offline-notice" });
  const savedEmptyEl = h("p", { class: "saved-empty", role: "status", "data-role": "saved-empty", hidden: true },
    "Nothing saved yet. ", h("a", { href: `${basePath()}/offline/` }, "Open Offline"), " to save stories.");
  view.append(savedEmptyEl);
  view.after(notice);

  // ---- controls ----
  const buttons = new Map();
  const sheet = createSheet({ id: "filters-sheet", title: "Filters" });
  const countBadge = h("b", { "data-role": "filter-count", hidden: true });
  const openButton = h("button", { type: "button", class: "btn filters-open", "data-role": "filters-open", "aria-haspopup": "dialog" }, slidersIcon(), h("span", {}, "Filters"), countBadge);
  const chipsRow = h("div", { class: "sheet-wrap", role: "group", "aria-label": "Filter stories", "data-role": "filters" });
  const collectionBox = h("div", { class: "sheet-wrap", role: "group", "aria-label": "Tradition", "data-role": "collection" });
  const collectionSection = h("div", { "data-role": "collection-section", hidden: true }, h("p", { class: "sheet-label" }, "Tradition"), collectionBox);
  const sortBox = h("div", { class: "sheet-wrap", role: "group", "aria-label": "Sort stories", "data-role": "sort" });
  const sortButtons = new Map();
  for (const value of SORTS) {
    const button = h("button", { type: "button", class: "btn", "data-sort": value, "aria-pressed": String(state.sort === value) }, SORT_LABELS[value]);
    button.addEventListener("click", () => setOrder(value));
    sortButtons.set(value, button);
    sortBox.append(button);
  }
  const clearButton = h("button", { type: "button", class: "btn btn-quiet", "data-role": "clear", hidden: true }, "Clear");
  const sheetClear = h("button", { type: "button", class: "btn", "data-role": "sheet-clear" }, "Clear filters");
  const sheetDone = h("button", { type: "button", class: "btn btn-primary", "data-role": "sheet-done" }, "Show stories");
  const activeEl = h("div", { class: "active-filters", "data-role": "active-filters" });

  function setOrder(value) {
    state.sort = SORTS.includes(value) ? value : "order";
    setSort(state.sort);
    if (library) regroup();
    render();
  }

  function chip(key, label) {
    const button = h("button", { type: "button", class: "btn", "aria-pressed": String(key === "audio" ? state.audio : key === "saved" ? state.saved : state.statuses.has(key)), "data-filter": key }, label);
    button.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(on));
      if (key === "audio") state.audio = on;
      else if (key === "saved") state.saved = on;
      else if (on) state.statuses.add(key);
      else state.statuses.delete(key);
      state.flatPages = 1;
      render();
    });
    buttons.set(key, button);
    return button;
  }
  chipsRow.append(...STATUSES.map(([key, label]) => chip(key, label)), chip("audio", "Has audio"), ...(canSave ? [chip("saved", "Saved on this tablet")] : []));
  sheet.body.append(
    h("p", { class: "sheet-label" }, "Show"), chipsRow,
    collectionSection,
    h("p", { class: "sheet-label" }, "Order"), sortBox,
    h("div", { class: "sheet-actions" }, sheetClear, sheetDone),
  );
  sheet.attach();
  el.replaceChildren(openButton);
  if (sortSlot) sortSlot.replaceChildren(activeEl, clearButton);
  else el.append(activeEl, clearButton);
  openButton.addEventListener("click", () => sheet.open(openButton));
  sheetDone.addEventListener("click", () => sheet.close());

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
    const head = h("h2", { class: "series-head" }, toggle);
    const el2 = h("section", { class: "series-group", "data-role": "series-group", "data-key": group.key }, head, nextSlot, body);
    const parts = { el: el2, head, toggle, summary, bar, nextSlot, list, more, body, eyebrow: toggle.querySelector('[data-role="group-world"]'), group };
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
    if (collectionBox.dataset.signature !== signature) {
      collectionBox.dataset.signature = signature;
      const choose = (name) => {
        state.collection = name;
        state.flatPages = 1;
        render();
      };
      collectionBox.replaceChildren(...["", ...found.map((c) => c.name)].map((name) => {
        const button = h("button", { type: "button", class: "btn", "data-collection": name }, name || "Any");
        button.addEventListener("click", () => choose(name));
        return button;
      }));
    }
    for (const button of collectionBox.children) button.setAttribute("aria-pressed", String(button.dataset.collection === state.collection));
    collectionSection.hidden = found.length < 2 || !state.world; // a tradition makes sense inside one world
  }

  /** Active filters as removable chips, the Filters badge, and the sheet's own buttons. */
  function syncControls(matchedCount, query) {
    const active = [];
    for (const [key, label] of STATUSES) if (state.statuses.has(key)) active.push([label, () => { state.statuses.delete(key); buttons.get(key).setAttribute("aria-pressed", "false"); }]);
    if (state.audio) active.push(["Has audio", () => { state.audio = false; buttons.get("audio").setAttribute("aria-pressed", "false"); }]);
    if (state.saved) active.push(["Saved", () => { state.saved = false; buttons.get("saved")?.setAttribute("aria-pressed", "false"); }]);
    if (state.collection) active.push([state.collection, () => { state.collection = ""; }]);
    const filters = active.length;
    if (state.sort !== "order") active.push([SORT_LABELS[state.sort], () => { state.sort = "order"; setSort("order"); if (library) regroup(); }]);
    const signature = active.map(([label]) => label).join("|");
    if (activeEl.dataset.signature !== signature) {
      activeEl.dataset.signature = signature;
      activeEl.replaceChildren(...active.map(([label, remove]) => {
        const button = h("button", { type: "button", class: "btn active-chip", "data-role": "active-chip", "aria-label": `Remove ${label}` }, label, h("span", { "aria-hidden": "true" }, " ✕"));
        button.addEventListener("click", () => {
          remove();
          state.flatPages = 1;
          render();
        });
        return button;
      }));
    }
    const count = active.length;
    countBadge.textContent = String(count);
    countBadge.hidden = count === 0;
    openButton.setAttribute("aria-label", count ? `Filters, ${plural(count, "choice", "choices")} on` : "Filters");
    openButton.dataset.active = String(count > 0);
    for (const [value, button] of sortButtons) button.setAttribute("aria-pressed", String(state.sort === value));
    sheetDone.textContent = `Show ${plural(matchedCount, "story", "stories")}`;
    sheetClear.disabled = filters === 0;
    clearButton.hidden = !(query.trim() || filters >= 2);
  }

  function render() {
    if (disposed || !library) return;
    const records = readAll();
    const plays = readPlays(records);
    const now = Date.now();
    const query = currentQuery();
    const scope = library.stories.filter((s) => !state.world || s.world === state.world);
    rebuildCollections(scope);
    const flat = Boolean(query.trim()) || state.sort === "plays" || state.audio || state.saved || state.statuses.size > 0 || Boolean(state.collection);
    const savedSlugs = canSave ? offline.getStore().savedSlugs() : new Set();
    const offlineNow = typeof navigator !== "undefined" && navigator.onLine === false;
    const filter = { world: state.world, audio: state.audio, saved: state.saved, savedSlugs, statuses: [...state.statuses], collection: state.collection, lore: library.lore };

    // Row state, and which stories match everything.
    const matched = [];
    for (const story of library.stories) {
      const row = rowBySlug.get(story.slug);
      if (!row) continue;
      const record = records[story.slug];
      const vm = toViewModel(record, { durationSec: story.durationSec });
      row.dataset.state = vm.state;
      row.style.setProperty("--progress", `${Math.round(vm.fraction * 100)}%`);
      const playsEl = row.querySelector('[data-role="plays"]');
      if (playsEl) {
        const n = plays[story.slug] ?? 0;
        const label = n > 0 ? ` · Heard ${n === 1 ? "once" : `${n} times`}` : "";
        if (playsEl.textContent !== label) playsEl.textContent = label;
      }
      if (isNew(story, record, now)) row.dataset.new = "true";
      else delete row.dataset.new;
      markOffline(row, canSave && savedSlugs.has(story.slug) ? "saved" : canSave && offlineNow ? "unavailable" : "");
      const ok = matchesFilters(story, record, filter, now);
      setHiddenReason(row, "filters", !ok);
      if (ok && matchesQuery(story, query, searchIndex)) matched.push(story);
    }

    const pageHidden = new Set();
    const rowsOf = (stories) => stories.map((s) => rowBySlug.get(s.slug)).filter(Boolean);

    if (flat) {
      groupsEl.hidden = true;
      groupsMore.hidden = true;
      flatEl.hidden = false;
      const sorted = state.sort === "plays" ? byMostHeard(matched, plays, records) : orderStories(matched, state.sort);
      // With a query, best matches first (the sort order breaks ties: the sort is stable).
      const ordered = query.trim() ? sorted.map((s) => ({ s, score: queryScore(s, query, searchIndex) })).sort((a, b) => b.score - a.score).map((x) => x.s) : sorted;
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
      const solo = inScope.length === 1; // one series: no card, just its stories
      groupsEl.dataset.solo = String(solo);
      for (const g of groups) {
        const parts = cards.get(g.key);
        parts.el.hidden = !shown.has(g.key);
        if (parts.el.hidden) continue;
        parts.head.hidden = solo;
        parts.nextSlot.hidden = solo;
        const expanded = solo || (state.open[g.key] ?? false);
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
    syncControls(matched.length, query);
    updateNoResults();
    const savedEmpty = state.saved && matched.length === 0 && savedSlugs.size === 0;
    savedEmptyEl.hidden = !savedEmpty;
    if (savedEmpty) {
      const note = document.querySelector('[data-role="no-results"]');
      if (note) { note.textContent = ""; note.hidden = true; }
    }
    persist();
    if (!hadRendered) {
      hadRendered = true;
      if (hadState && window.scrollY === 0 && history.state?.scrollY > 0) window.scrollTo(0, history.state.scrollY);
    }
  }
  let hadRendered = false;

  /** data-offline on a row: "saved", "unavailable" (offline and not saved) or absent. */
  function markOffline(row, value) {
    if (value) row.dataset.offline = value;
    else delete row.dataset.offline;
    const link = row.querySelector(".row-title") ?? row.querySelector("a");
    if (!link) return;
    if (value === "unavailable") link.setAttribute("aria-description", NOT_SAVED);
    else link.removeAttribute("aria-description");
  }

  let noticeTimer = 0;
  /** Offline, a tap on a story that is not saved says so instead of going nowhere. */
  const onRowTap = (event) => {
    const row = event.target?.closest?.('[data-role="story-row"][data-offline="unavailable"]');
    if (!row || !event.target.closest("a, button")) return;
    event.preventDefault();
    event.stopPropagation(); // the router and the play button never see it
    notice.textContent = "";
    notice.textContent = NOT_SAVED;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.textContent = ""; }, 5000);
  };

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
      audio: state.audio,
      saved: state.saved,
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
  clearButton.addEventListener("click", () => clearAll());
  sheetClear.addEventListener("click", () => clearAll({ keepQuery: true }));
  function clearAll({ keepQuery = false } = {}) {
    state.audio = false;
    state.saved = false;
    state.statuses.clear();
    state.collection = "";
    state.flatPages = 1;
    for (const button of buttons.values()) button.setAttribute("aria-pressed", "false");
    const input = document.querySelector('input[data-mount="search"], [data-mount="search"] input');
    if (!keepQuery && input && input.value) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true })); // search.mjs updates its rows and calls us back
    }
    render();
    if (!keepQuery) input?.focus();
  }
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
  const onOffline = () => render();
  document.addEventListener("stories:offline", onOffline);
  window.addEventListener("online", onOffline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("click", onRowTap, true);
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
    document.removeEventListener("stories:offline", onOffline);
    window.removeEventListener("online", onOffline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("click", onRowTap, true);
    clearTimeout(noticeTimer);
    stop();
    for (const row of originalRows) {
      originalList?.append(row);
      setHiddenReason(row, "filters", false);
      setHiddenReason(row, "page", false);
      delete row.dataset.offline;
      row.querySelector(".row-title")?.removeAttribute("aria-description");
    }
    view.remove();
    notice.remove();
    sheet.destroy();
    el.replaceChildren();
    sortSlot?.replaceChildren();
    if (status) {
      delete status.dataset.managed;
      status.textContent = "";
    }
    updateNoResults();
  };
}
