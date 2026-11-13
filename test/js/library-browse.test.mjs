// @vitest-environment jsdom
// The grouped Library: series cards, expand/collapse, paged reveal, flat search
// and filter results, collections, persistence. All data invented.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../site/assets/js/offline.mjs";
import { mount as mountFilters } from "../../site/assets/js/filters.mjs";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { markCompleted, write } from "../../site/assets/js/progress.mjs";
import { mount as mountSearch } from "../../site/assets/js/search.mjs";
import { mount as mountSwitcher } from "../../site/assets/js/world-switcher.mjs";
import { libraryPageHtml, loadPage, stubLibraryFetch, useFixedNow } from "./helpers.mjs";

const story = (world, series, n, o = {}) => ({
  slug: `${world}/${(series ?? "solo").toLowerCase().replace(/\W+/g, "-")}-${n}`,
  title: `${series ?? "Solo"} tale ${n}`,
  world, series, seriesOrder: series ? n : null, durationSec: n % 2 ? 600 : 1800, tags: [],
  url: `/Stories/${world}/${n}/`, icon: "sun", publishDate: `2026-09-${String(n).padStart(2, "0")}`, ...o,
});
const many = (world, series, count, o = {}) => Array.from({ length: count }, (_, i) => story(world, series, i + 1, o));

function makeLibrary() {
  return {
    stories: [
      ...many("alpha", "Long Saga", 25),
      ...many("alpha", "Short Run", 4, { publishDate: "2026-10-20" }),
      story("alpha", null, 1), story("alpha", null, 2),
      ...many("beta", "Only Series", 14),
    ],
    worlds: [
      { name: "alpha", title: "Alpha", tagline: "a", accent: "sage", icon: "sun", hasLore: true },
      { name: "beta", title: "Beta", tagline: "b", accent: "sky", icon: "shell", hasLore: false },
    ],
    lore: [
      { world: "alpha", slug: "n", title: "N", tradition: "Norse", summary: "", stories: ["alpha/long-saga-3"], url: "/Stories/lore/alpha/n/" },
      { world: "alpha", slug: "g", title: "G", tradition: "Greek", summary: "", stories: ["alpha/long-saga-5", "alpha/short-run-1"], url: "/Stories/lore/alpha/g/" },
    ],
  };
}

let lib;
let unmounts = [];

function page() {
  loadPage(libraryPageHtml);
  const list = document.querySelector("#stories");
  for (const s of lib.stories) {
    const li = document.createElement("li");
    li.dataset.role = "story-row";
    li.dataset.slug = s.slug;
    li.textContent = s.title;
    list.append(li);
  }
}
const mountOn = (mod, selector) => {
  const un = mod.mount(document.querySelector(selector));
  unmounts.push(un);
  return un;
};
async function open({ search = true, switcher = false } = {}) {
  if (switcher) mountOn({ mount: mountSwitcher }, '[data-mount="world-switcher"]');
  if (search) mountOn({ mount: mountSearch }, '[data-mount="search"]');
  mountOn({ mount: mountFilters }, '[data-mount="filters"]');
  await vi.waitFor(() => expect(document.querySelector('[data-role="results-status"]').textContent).not.toBe(""));
}
const type = (value) => {
  const input = document.querySelector('[data-mount="search"]');
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const groups = () => [...document.querySelectorAll('[data-role="series-group"]')].filter((g) => !g.closest("[hidden]"));
const toggleOf = (g) => g.querySelector('[data-role="group-toggle"]');
const isShown = (el) => !el.closest("[hidden]");
const shownRows = () => [...document.querySelectorAll('[data-role="story-row"]')].filter(isShown);
const chip = (key) => document.querySelector(`[data-filter="${key}"]`);
const status = () => document.querySelector('[data-role="results-status"]').textContent;
const groupNamed = (name) => groups().find((g) => g.querySelector("h2").textContent.includes(name));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetLibrary();
  useFixedNow();
  lib = makeLibrary();
  stubLibraryFetch(lib);
  page();
});
afterEach(() => {
  for (const un of unmounts) un();
  unmounts = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("grouped view", () => {
  it("shows one collapsed card per series (and one for single stories), no story rows", async () => {
    await open();
    const names = groups().map((g) => g.querySelector("h2").textContent);
    expect(names).toHaveLength(4);
    expect(names.join("|")).toMatch(/Long Saga/);
    expect(names.join("|")).toMatch(/Single stories/i);
    for (const g of groups()) expect(toggleOf(g).getAttribute("aria-expanded")).toBe("false");
    expect(shownRows()).toHaveLength(0);
  });

  it("builds the card as heading > button with aria-controls pointing at its body", async () => {
    await open();
    const g = groupNamed("Long Saga");
    expect(g.querySelector("h2 > button")).toBe(toggleOf(g));
    const body = document.getElementById(toggleOf(g).getAttribute("aria-controls"));
    expect(body).not.toBeNull();
    expect(g.contains(body)).toBe(true);
    expect(body.hidden).toBe(true);
  });

  it("shows the count, the heard summary and a next-up link on the card", async () => {
    markCompleted("alpha/long-saga-1");
    markCompleted("alpha/long-saga-2");
    write("alpha/long-saga-3", { audioTime: 120 });
    await open();
    const g = groupNamed("Long Saga");
    expect(g.querySelector('[data-role="group-summary"]').textContent).toBe("25 stories · 2 heard");
    const next = g.querySelector('[data-role="group-next"]');
    expect(next.textContent).toBe("Continue: Long Saga tale 3");
    expect(next.getAttribute("href")).toBe("/Stories/alpha/3/");
  });

  it("shows no hint for an unheard series, and 'all heard' for a finished one", async () => {
    for (const s of lib.stories.filter((x) => x.series === "Short Run")) markCompleted(s.slug);
    await open();
    expect(groupNamed("Long Saga").querySelector('[data-role="group-next"]')).toBeNull();
    expect(groupNamed("Short Run").querySelector('[data-role="group-next"]')).toBeNull();
    expect(groupNamed("Short Run").querySelector('[data-role="group-summary"]').textContent).toBe("4 stories · all heard");
  });

  it("expands on click, showing ten rows in story order and a 'Show 10 more' button", async () => {
    await open();
    const g = groupNamed("Long Saga");
    toggleOf(g).click();
    expect(toggleOf(g).getAttribute("aria-expanded")).toBe("true");
    const rows = [...g.querySelectorAll('[data-role="story-row"]')].filter(isShown);
    expect(rows.map((r) => r.textContent)).toEqual(Array.from({ length: 10 }, (_, i) => `Long Saga tale ${i + 1}`));
    expect(g.querySelector('[data-role="show-more"]').textContent).toMatch(/Show 10 more/);
    toggleOf(g).click();
    expect(toggleOf(g).getAttribute("aria-expanded")).toBe("false");
    expect(shownRows()).toHaveLength(0);
  });

  it("reveals the rest a page at a time and hides the button when done", async () => {
    await open();
    const g = groupNamed("Long Saga");
    toggleOf(g).click();
    const more = () => g.querySelector('[data-role="show-more"]');
    more().click();
    expect(shownRows()).toHaveLength(20);
    expect(more().textContent).toMatch(/Show 5 more/);
    more().click();
    expect(shownRows()).toHaveLength(25);
    expect(more() === null || more().closest("[hidden]") !== null).toBe(true);
  });

  it("keeps focus on the toggle after expanding, and on the list after 'Show more'", async () => {
    await open();
    const g = groupNamed("Long Saga");
    toggleOf(g).focus();
    toggleOf(g).click();
    expect(document.activeElement).toBe(toggleOf(g));
    g.querySelector('[data-role="show-more"]').click();
    expect(g.contains(document.activeElement)).toBe(true);
  });

  it("the Newest sort puts the newest story first inside a series", async () => {
    await open();
    const sort = (value) => document.querySelector(`[data-role="sort"] [data-sort="${value}"]`);
    expect(sort("order").getAttribute("aria-pressed")).toBe("true");
    sort("newest").click();
    expect(sort("newest").getAttribute("aria-pressed")).toBe("true");
    const g = groupNamed("Long Saga");
    toggleOf(g).click();
    const first = [...g.querySelectorAll('[data-role="story-row"]')].filter(isShown)[0];
    expect(first.textContent).toBe("Long Saga tale 25");
    expect(localStorage.getItem("stories-library-sort")).toBe("newest");
  });

  it("rows say how often a story was heard, and the Most heard sort lists them by that", async () => {
    for (const li of document.querySelectorAll('[data-role="story-row"]')) {
      const span = document.createElement("span");
      span.dataset.role = "plays";
      li.append(span);
    }
    const once = "alpha/long-saga-7";
    const thrice = "alpha/long-saga-9";
    markCompleted(once);
    for (let i = 0; i < 3; i++) { write(thrice, { audioTime: 40 }); markCompleted(thrice); }
    await open();
    const label = (slug) => document.querySelector(`[data-slug="${slug}"] [data-role="plays"]`).textContent;
    expect(label(once)).toBe(" · Heard once");
    expect(label(thrice)).toBe(" · Heard 3 times");
    expect(label("alpha/long-saga-1")).toBe("");

    const sort = document.querySelector('[data-role="sort"]');
    expect([...sort.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Story order", "Newest", "Most heard"]);
    sort.querySelector('[data-sort="plays"]').click();
    expect(document.querySelector('[data-role="active-chip"]').textContent).toContain("Most heard");
    const rows = shownRows().map((r) => r.dataset.slug);
    expect(rows.slice(0, 2)).toEqual([thrice, once]); // a flat list, most heard first
    expect(localStorage.getItem("stories-library-sort")).toBe("plays");
  });

  it("opens the only group when the scope has a single series", async () => {
    localStorage.setItem("stories-world", "beta");
    await open();
    expect(groups()).toHaveLength(1);
    expect(toggleOf(groups()[0]).getAttribute("aria-expanded")).toBe("true");
    expect(shownRows()).toHaveLength(10);
  });

  it("follows the world: only that world's series are shown", async () => {
    await open({ switcher: true });
    await vi.waitFor(() => expect(document.querySelector('button[data-world="beta"]')).not.toBeNull());
    document.querySelector('button[data-world="beta"]').click();
    expect(groups().map((g) => g.querySelector("h2").textContent).join("|")).toMatch(/Only Series/);
    expect(groups()).toHaveLength(1);
    document.querySelector('button[data-world="alpha"]').click();
    expect(groups()).toHaveLength(3);
  });

  it("counts the stories in scope in the live status, and keeps the count in step with the world", async () => {
    await open({ switcher: true });
    expect(status()).toBe("45 stories");
    localStorage.setItem("stories-world", "beta");
    document.dispatchEvent(new CustomEvent("stories:world", { detail: { world: "beta" } }));
    expect(status()).toBe("14 stories");
  });

  it("renders series names as text, never as markup", async () => {
    lib.stories.push(story("alpha", '<img src=x onerror="window.pwned=1">', 1));
    resetLibrary();
    stubLibraryFetch(lib);
    page();
    await open();
    expect(document.querySelector('[data-role="library-view"] img')).toBeNull();
    expect(document.querySelector('[data-role="library-view"]').textContent).toContain('<img src=x onerror="window.pwned=1">');
  });

  it("pages the cards themselves when there are very many series", async () => {
    lib = makeLibrary();
    for (let i = 0; i < 30; i++) lib.stories.push(...many("alpha", `Extra ${i}`, 2));
    resetLibrary();
    stubLibraryFetch(lib);
    page();
    await open();
    expect(groups().length).toBeLessThanOrEqual(12);
    const more = document.querySelector('[data-role="show-more-groups"]');
    expect(more.textContent).toMatch(/more series/i);
    more.click();
    expect(groups().length).toBeGreaterThan(12);
  });
});

describe("search and filters switch to a flat list", () => {
  it("typing shows matching rows in a flat list with a count, clearing returns to groups", async () => {
    await open();
    type("short run");
    expect(groups()).toHaveLength(0);
    expect(shownRows().map((r) => r.textContent)).toEqual(Array.from({ length: 4 }, (_, i) => `Short Run tale ${i + 1}`));
    expect(status()).toBe("4 of 45 stories");
    type("");
    expect(shownRows()).toHaveLength(0);
    expect(groups()).toHaveLength(4);
    expect(status()).toBe("45 stories");
  });

  it("pages flat results too", async () => {
    await open();
    type("tale");
    expect(shownRows().length).toBe(20);
    const more = document.querySelector('[data-role="flat-more"]');
    expect(more.textContent).toMatch(/Show 20 more/);
    more.click();
    expect(shownRows().length).toBe(40);
  });

  it("says so when nothing matches", async () => {
    await open();
    type("zzzz");
    expect(document.querySelector('[data-role="no-results"]').hidden).toBe(false);
    expect(status()).toBe("0 of 45 stories");
  });

  it("the In progress chip lists started stories in a flat list", async () => {
    write("alpha/long-saga-7", { audioTime: 50 });
    await open();
    chip("in-progress").click();
    expect(chip("in-progress").getAttribute("aria-pressed")).toBe("true");
    expect(shownRows().map((r) => r.dataset.slug)).toEqual(["alpha/long-saga-7"]);
    chip("in-progress").click();
    expect(groups()).toHaveLength(4);
  });

  it("Not played hides started and finished stories", async () => {
    markCompleted("alpha/short-run-1");
    write("alpha/short-run-2", { audioTime: 5 });
    await open();
    type("short run");
    chip("not-played").click();
    expect(shownRows().map((r) => r.dataset.slug)).toEqual(["alpha/short-run-3", "alpha/short-run-4"]);
  });

  it("a Tradition group lists the world's traditions and filters by one", async () => {
    await open();
    const section = document.querySelector('[data-role="collection-section"]');
    expect(section.hidden).toBe(true); // only inside one world
    localStorage.setItem("stories-world", "alpha");
    document.dispatchEvent(new CustomEvent("stories:world", { detail: { world: "alpha" } }));
    const box = document.querySelector('[data-role="collection"]');
    expect(section.hidden).toBe(false);
    expect([...box.querySelectorAll("button")].map((b) => b.dataset.collection)).toEqual(["", "Greek", "Norse"]);
    box.querySelector('[data-collection="Greek"]').click();
    expect(shownRows().map((r) => r.dataset.slug)).toEqual(["alpha/short-run-1", "alpha/long-saga-5"]);
    expect(status()).toBe("2 of 31 stories");
    expect(document.querySelector('[data-role="active-chip"]').textContent).toContain("Greek");
    box.querySelector('[data-collection=""]').click();
    expect(groups().length).toBeGreaterThan(0);
  });

  it("hides the Tradition group when the world has no lore", async () => {
    localStorage.setItem("stories-world", "beta");
    await open();
    expect(document.querySelector('[data-role="collection-section"]').hidden).toBe(true);
  });

  it("the Filters button counts what is on, active chips remove one filter, and the sheet opens and closes", async () => {
    await open();
    const button = document.querySelector('[data-role="filters-open"]');
    const badge = document.querySelector('[data-role="filter-count"]');
    const sheet = document.querySelector('[data-role="filters-sheet"]');
    expect(badge.hidden).toBe(true);
    expect(sheet.hidden).toBe(true);
    button.click();
    expect(sheet.hidden).toBe(false);
    chip("not-played").click();
    chip("audio").click();
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe("2");
    expect(button.getAttribute("aria-label")).toBe("Filters, 2 choices on");
    expect([...document.querySelectorAll('[data-role="active-chip"]')].map((c) => c.getAttribute("aria-label"))).toEqual(["Remove Not played", "Remove Has audio"]);
    expect(sheet.querySelector('[data-role="sheet-done"]').textContent).toMatch(/^Show \d+ stor(y|ies)$/);
    document.querySelector('[data-role="active-chip"]').click(); // remove Not played
    expect(chip("not-played").getAttribute("aria-pressed")).toBe("false");
    expect(badge.textContent).toBe("1");
    sheet.querySelector('[data-role="sheet-clear"]').click();
    expect(badge.hidden).toBe(true);
    expect(chip("audio").getAttribute("aria-pressed")).toBe("false");
    sheet.querySelector('[data-role="sheet-done"]').click();
    expect(sheet.hidden).toBe(true);
  });

  it("the world switch does not turn on flat mode by itself", async () => {
    await open();
    document.dispatchEvent(new CustomEvent("stories:world", { detail: { world: "alpha" } }));
    expect(groups().length).toBeGreaterThan(0);
  });

  it("never shows hundreds of rows at once", async () => {
    lib = makeLibrary();
    for (let i = 0; i < 12; i++) lib.stories.push(...many("alpha", `Bulk ${i}`, 25));
    resetLibrary();
    stubLibraryFetch(lib);
    page();
    await open();
    type("tale");
    expect(shownRows().length).toBeLessThanOrEqual(20);
    type("");
    for (const g of groups()) toggleOf(g).click();
    expect(shownRows().length).toBeLessThanOrEqual(12 * 10);
  });
});

describe("remembering the view", () => {
  async function reopen(options) {
    for (const un of unmounts.splice(0)) un();
    document.body.replaceChildren();
    resetLibrary();
    stubLibraryFetch(lib);
    page();
    await open(options);
  }

  it("restores open groups and revealed pages when coming back", async () => {
    await open();
    const g = groupNamed("Long Saga");
    toggleOf(g).click();
    g.querySelector('[data-role="show-more"]').click();
    await reopen();
    expect(toggleOf(groupNamed("Long Saga")).getAttribute("aria-expanded")).toBe("true");
    expect(shownRows()).toHaveLength(20);
    expect(toggleOf(groupNamed("Short Run")).getAttribute("aria-expanded")).toBe("false");
  });

  it("restores a typed search and a pressed chip", async () => {
    await open();
    type("short");
    chip("audio").click();
    await reopen();
    expect(document.querySelector('[data-mount="search"]').value).toBe("short");
    expect(chip("audio").getAttribute("aria-pressed")).toBe("true");
    expect(groups()).toHaveLength(0);
    expect(shownRows().map((r) => r.dataset.slug)).toEqual(["alpha/short-run-1", "alpha/short-run-2", "alpha/short-run-3", "alpha/short-run-4"]);
  });

  it("a world with one series shows no card header: the stories sit straight on the page", async () => {
    localStorage.setItem("stories-world", "beta");
    await open();
    expect(document.querySelector('[data-role="groups"]').dataset.solo).toBe("true");
    expect(groups()[0].querySelector(".series-head").hidden).toBe(true);
    expect(shownRows()).toHaveLength(10);
    await reopen();
    expect(groups()[0].querySelector(".series-head").hidden).toBe(true);
  });

  it("with several series the cards keep their headers", async () => {
    await open();
    expect(document.querySelector('[data-role="groups"]').dataset.solo).toBe("false");
    expect(groups()[0].querySelector(".series-head").hidden).toBe(false);
  });

  it("starts fresh when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await open();
    toggleOf(groupNamed("Long Saga")).click();
    expect(shownRows()).toHaveLength(10);
  });
});

describe("unmount", () => {
  it("removes its UI and puts the rows back in the original list, all visible", async () => {
    await open();
    toggleOf(groupNamed("Long Saga")).click();
    for (const un of unmounts.splice(0)) un();
    expect(document.querySelector('[data-role="library-view"]')).toBeNull();
    const rows = [...document.querySelectorAll("#stories > li")];
    expect(rows).toHaveLength(lib.stories.length);
    expect(rows.every((r) => !r.hidden)).toBe(true);
    expect(document.querySelector('[data-mount="filters"]').children).toHaveLength(0);
    expect(document.querySelector('[data-role="sort-slot"]').children).toHaveLength(0);
  });

  it("a second mount on fresh markup works", async () => {
    await open();
    for (const un of unmounts.splice(0)) un();
    document.body.replaceChildren();
    resetLibrary();
    stubLibraryFetch(lib);
    page();
    await open();
    expect(groups()).toHaveLength(4);
  });
});

describe("offline: Saved chip, badge and dimming", () => {
  const SAVED = "alpha/long-saga-3";
  let savedSet;
  let listeners;
  const setOnline = (value) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
  const rowOf = (slug) => document.querySelector(`[data-role="story-row"][data-slug="${slug}"]`);

  function fakeOffline({ supported = true } = {}) {
    savedSet = new Set([SAVED]);
    listeners = new Set();
    const store = { savedSlugs: () => new Set(savedSet), subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
    vi.spyOn(offline, "offlineSupported").mockReturnValue(supported);
    vi.spyOn(offline, "getStore").mockReturnValue(store);
  }
  afterEach(() => setOnline(true));

  it("has a Saved chip in the sheet that shows only saved stories, and marks the row", async () => {
    fakeOffline();
    await open();
    expect(chip("saved").getAttribute("aria-pressed")).toBe("false");
    chip("saved").click();
    expect(chip("saved").getAttribute("aria-pressed")).toBe("true");
    expect(shownRows().map((r) => r.dataset.slug)).toEqual([SAVED]);
    expect(rowOf(SAVED).dataset.offline).toBe("saved");
    expect(document.querySelectorAll('[data-role="active-chip"]')[0].textContent).toContain("Saved");
  });

  it("composes with the world filter", async () => {
    fakeOffline();
    savedSet.add("beta/only-series-2");
    await open({ switcher: true });
    chip("saved").click();
    expect(shownRows()).toHaveLength(2);
    document.dispatchEvent(new CustomEvent("stories:world", { detail: { world: "beta" } }));
    expect(shownRows().map((r) => r.dataset.slug)).toEqual(["beta/only-series-2"]);
  });

  it("is absent when offline saving is not supported, and rows carry no data-offline", async () => {
    fakeOffline({ supported: false });
    await open();
    expect(chip("saved")).toBeNull();
    expect(rowOf(SAVED).dataset.offline).toBeUndefined();
  });

  it("updates live on stories:offline", async () => {
    fakeOffline();
    await open();
    chip("saved").click();
    savedSet.add("alpha/long-saga-4");
    document.dispatchEvent(new CustomEvent("stories:offline", { detail: { slug: "alpha/long-saga-4" } }));
    expect(shownRows().map((r) => r.dataset.slug).sort()).toEqual([SAVED, "alpha/long-saga-4"]);
    expect(rowOf("alpha/long-saga-4").dataset.offline).toBe("saved");
    savedSet.clear();
    document.dispatchEvent(new CustomEvent("stories:offline", { detail: { slug: null } }));
    expect(rowOf(SAVED).dataset.offline).toBeUndefined();
  });

  it("marks unsaved rows unavailable while offline and tells the tapper instead of navigating", async () => {
    fakeOffline();
    setOnline(false);
    await open();
    expect(rowOf(SAVED).dataset.offline).toBe("saved");
    const other = rowOf("alpha/long-saga-1");
    expect(other.dataset.offline).toBe("unavailable");
    const link = document.createElement("a");
    link.href = "/Stories/alpha/1/";
    link.textContent = "go";
    other.append(link);
    window.dispatchEvent(new Event("offline"));
    expect(link.getAttribute("aria-description")).toBe("Not saved on this tablet");
    // The live region exists (empty, not hidden) before the tap, so a screen reader announces the text when it is filled in.
    const notice = document.querySelector('[data-role="offline-notice"]');
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe("");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.textContent).toBe("Not saved on this tablet");
    expect(notice.hidden).toBe(false);
    // a saved row is left alone
    const savedLink = document.createElement("a");
    savedLink.href = "/Stories/alpha/3/";
    rowOf(SAVED).append(savedLink);
    const ok = new MouseEvent("click", { bubbles: true, cancelable: true });
    savedLink.dispatchEvent(ok);
    expect(ok.defaultPrevented).toBe(false);
  });

  it("goes back to normal when the network returns", async () => {
    fakeOffline();
    setOnline(false);
    await open();
    setOnline(true);
    window.dispatchEvent(new Event("online"));
    expect(rowOf("alpha/long-saga-1").dataset.offline).toBeUndefined();
    expect(rowOf(SAVED).dataset.offline).toBe("saved");
  });

  it("explains an empty Saved view with a link to the Offline page", async () => {
    fakeOffline();
    savedSet.clear();
    await open();
    chip("saved").click();
    const empty = document.querySelector('[data-role="saved-empty"]');
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe("Nothing saved yet. Open Offline to save stories.");
    expect(empty.querySelector("a").getAttribute("href")).toBe("/Stories/offline/");
    expect(document.querySelector('[data-role="no-results"]').hidden).toBe(true);
  });
});
