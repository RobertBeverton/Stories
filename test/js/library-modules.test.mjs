// @vitest-environment jsdom
// search, filters, world-switcher on the library-page fixture plus story rows.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount as mountFilters } from "../../site/assets/js/filters.mjs";
import { loadLibrary, resetLibrary } from "../../site/assets/js/library.mjs";
import { markCompleted, write } from "../../site/assets/js/progress.mjs";
import { mount as mountSearch } from "../../site/assets/js/search.mjs";
import { mount as mountSwitcher } from "../../site/assets/js/world-switcher.mjs";
import { getWorld, knownWorld } from "../../site/assets/js/world-state.mjs";
import { library, libraryPageHtml, loadPage, stubLibraryFetch, useFixedNow } from "./helpers.mjs";

const SLUGS = library.stories.map((s) => s.slug);
const FIRST = SLUGS[0];
const SECOND = SLUGS[1];
const LONE = SLUGS[2];
let unmounts = [];

function page() {
  loadPage(libraryPageHtml);
  const list = document.querySelector("#stories");
  for (const story of library.stories) {
    const li = document.createElement("li");
    li.dataset.role = "story-row";
    li.dataset.slug = story.slug;
    li.textContent = story.title; // text only, as a template would render it
    list.append(li);
  }
}
const mountOn = (mod, selector) => {
  const un = mod.mount(document.querySelector(selector));
  unmounts.push(un);
  return un;
};
const visible = () => [...document.querySelectorAll('[data-role="story-row"]')].filter((r) => !r.hidden).map((r) => r.dataset.slug);
const row = (slug) => document.querySelector(`[data-role="story-row"][data-slug="${slug}"]`);
const type = (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const chip = (key) => document.querySelector(`[data-filter="${key}"]`);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetLibrary();
  useFixedNow();
  stubLibraryFetch();
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

describe("search", () => {
  it("hides rows that do not match the typed words (title, series, tags)", async () => {
    const input = document.querySelector('[data-mount="search"]');
    mountOn({ mount: mountSearch }, '[data-mount="search"]');
    await loadLibrary(); // the module attached its handler to this same promise first
    type(input, "lone");
    expect(visible()).toEqual([LONE]);
    type(input, "test series");
    expect(visible()).toEqual([FIRST, SECOND]);
    type(input, "PLACEHOLDER");
    expect(visible()).toEqual([FIRST, LONE]);
    type(input, "");
    expect(visible()).toEqual(SLUGS);
  });

  it("finds a title that contains markup characters, by its text", async () => {
    const input = document.querySelector('[data-mount="search"]');
    mountOn({ mount: mountSearch }, '[data-mount="search"]');
    await loadLibrary(); // the module attached its handler to this same promise first
    type(input, "<second> & quoted");
    expect(visible()).toEqual([SECOND]);
  });

  it("announces no results politely and clears the message again", async () => {
    const input = document.querySelector('[data-mount="search"]');
    mountOn({ mount: mountSearch }, '[data-mount="search"]');
    await loadLibrary(); // the module attached its handler to this same promise first
    type(input, "zzzz");
    const note = document.querySelector('[data-role="no-results"]');
    expect(note.getAttribute("role")).toBe("status");
    expect(note.hidden).toBe(false);
    expect(note.textContent).toMatch(/no stories match/i);
    type(input, "lone");
    expect(note.hidden).toBe(true);
    expect(note.textContent).toBe("");
  });

  it("works when mounted on a container that holds the input", async () => {
    const wrap = document.createElement("div");
    wrap.id = "wrap";
    const input = document.createElement("input");
    wrap.append(input);
    document.body.append(wrap);
    mountOn({ mount: mountSearch }, "#wrap");
    await loadLibrary(); // the module attached its handler to this same promise first
    type(input, "lone");
    expect(visible()).toEqual([LONE]);
  });

  it("restores every row on unmount", async () => {
    const input = document.querySelector('[data-mount="search"]');
    const un = mountOn({ mount: mountSearch }, '[data-mount="search"]');
    await loadLibrary(); // the module attached its handler to this same promise first
    type(input, "lone");
    un();
    expect(visible()).toEqual(SLUGS);
    type(input, "first");
    expect(visible()).toEqual(SLUGS); // listener gone
  });
});

describe("filters", () => {
  async function mounted() {
    mountOn({ mount: mountFilters }, '[data-mount="filters"]');
    await vi.waitFor(() => expect(document.querySelector('[data-role="results-status"]').textContent).not.toBe(""));
  }
  const press = (key) => chip(key).click();

  it("builds its own controls with accessible pressed state", async () => {
    await mounted();
    expect(document.querySelector('[role="group"]').getAttribute("aria-label")).toBe("Filter stories");
    for (const key of ["audio", "in-progress", "not-played"]) {
      expect(chip(key).getAttribute("aria-pressed")).toBe("false");
      expect(chip(key).tagName).toBe("BUTTON");
    }
  });

  it("has audio hides stories with no audio duration and clears off again", async () => {
    await mounted();
    press("audio");
    expect(chip("audio").getAttribute("aria-pressed")).toBe("true");
    expect(visible()).not.toContain(LONE);
    press("audio");
    expect(visible()).toEqual(SLUGS);
  });

  it("filters in progress and not played (OR within the status group)", async () => {
    write(FIRST, { audioTime: 300 });
    markCompleted(LONE);
    await mounted();
    press("in-progress");
    expect(visible()).toEqual([FIRST]);
    press("in-progress");
    press("not-played");
    expect(visible()).toEqual([SECOND]);
    press("in-progress");
    expect(visible()).toEqual([FIRST, SECOND]);
  });

  it("marks rows with progress state and the New marker, and follows progress changes", async () => {
    await mounted();
    expect(row(SECOND).dataset.new).toBe("true");
    expect(row(FIRST).dataset.new).toBeUndefined();
    expect(row(FIRST).dataset.state).toBe("new");
    write(FIRST, { audioTime: 30 });
    expect(row(FIRST).dataset.state).toBe("in-progress");
    write(SECOND, { audioTime: 30 });
    expect(row(SECOND).dataset.new).toBeUndefined();
    markCompleted(SECOND);
    expect(row(SECOND).dataset.state).toBe("finished");
  });

  it("filters by world from stories:world", async () => {
    await mounted();
    document.dispatchEvent(new CustomEvent("stories:world", { detail: { world: "other-world" } }));
    expect(document.querySelector('[data-role="results-status"]').textContent).toBe("1 story");
    document.dispatchEvent(new CustomEvent("stories:world", { detail: { world: "" } }));
    expect(document.querySelector('[data-role="results-status"]').textContent).toBe("3 stories");
  });

  it("reads the remembered world on mount", async () => {
    localStorage.setItem("stories-world", "other-world");
    await mounted();
    expect(visible()).toEqual([LONE]);
  });

  it("composes with search: neither undoes the other", async () => {
    mountOn({ mount: mountSearch }, '[data-mount="search"]');
    await mounted();
    press("audio");
    type(document.querySelector('[data-mount="search"]'), "test");
    expect(visible()).toEqual([FIRST, SECOND]);
    type(document.querySelector('[data-mount="search"]'), "");
    expect(visible()).toEqual([FIRST, SECOND]); // the chip still holds
    press("audio");
    expect(visible()).toEqual(SLUGS);
  });

  it("shows the empty message when filters hide everything", async () => {
    await mounted();
    press("in-progress");
    expect(visible()).toEqual([]);
    expect(document.querySelector('[data-role="no-results"]').hidden).toBe(false);
  });

  it("ignores rows for stories missing from the library", async () => {
    const stray = document.createElement("li");
    stray.dataset.role = "story-row";
    stray.dataset.slug = "gone/story";
    document.querySelector("#stories").append(stray);
    await mounted();
    press("in-progress");
    expect(stray.hidden).toBe(false);
  });

  it("unmounts cleanly, showing every row again", async () => {
    await mounted();
    press("in-progress");
    unmounts.pop()();
    expect(visible()).toEqual(SLUGS);
    expect(document.querySelector('[data-mount="filters"]').children).toHaveLength(0);
  });
});

describe("world-switcher", () => {
  async function mounted() {
    mountOn({ mount: mountSwitcher }, '[data-mount="world-switcher"]');
    await vi.waitFor(() => expect(document.querySelectorAll("button[data-world]").length).toBe(3));
  }
  const button = (world) => document.querySelector(`button[data-world="${world}"]`);

  it("builds All plus a button per world from library.json", async () => {
    await mounted();
    expect([...document.querySelectorAll("button[data-world]")].map((b) => b.textContent)).toEqual(["All", "Test World", "Other World"]);
    expect(button("test-world").dataset.accent).toBe("sage");
    expect(button("").getAttribute("aria-pressed")).toBe("true");
  });

  it("remembers the choice per device and emits stories:world", async () => {
    await mounted();
    const seen = [];
    document.addEventListener("stories:world", (e) => seen.push(e.detail.world));
    button("other-world").click();
    expect(seen).toEqual(["other-world"]);
    expect(getWorld()).toBe("other-world");
    expect(localStorage.getItem("stories-world")).toBe("other-world");
    expect(button("other-world").getAttribute("aria-pressed")).toBe("true");
    expect(button("").getAttribute("aria-pressed")).toBe("false");
    button("").click();
    expect(getWorld()).toBe("");
    expect(localStorage.getItem("stories-world")).toBeNull();
  });

  it("restores the remembered world on mount and ignores a stale one", async () => {
    localStorage.setItem("stories-world", "test-world");
    await mounted();
    expect(button("test-world").getAttribute("aria-pressed")).toBe("true");
    unmounts.pop()();
    localStorage.setItem("stories-world", "deleted-world");
    await mounted();
    expect(button("").getAttribute("aria-pressed")).toBe("true");
  });

  it("drives filters on the same page", async () => {
    mountOn({ mount: mountFilters }, '[data-mount="filters"]');
    await mounted();
    button("other-world").click();
    expect(visible()).toEqual([LONE]);
    button("test-world").click();
    expect(visible()).toEqual([FIRST, SECOND]);
  });

  it("follows a stories:world event from elsewhere", async () => {
    await mounted();
    document.dispatchEvent(new CustomEvent("stories:world", { detail: { world: "test-world" } }));
    expect(button("test-world").getAttribute("aria-pressed")).toBe("true");
  });

  it("still announces when storage is unavailable", async () => {
    await mounted();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const seen = [];
    document.addEventListener("stories:world", (e) => seen.push(e.detail.world));
    button("test-world").click();
    expect(seen).toEqual(["test-world"]);
  });
});

describe("library.json request", () => {
  it("carries the page's build id so page and index come from the same build", async () => {
    document.head.insertAdjacentHTML("beforeend", '<meta name="build-id" content="12345">');
    const fetchMock = stubLibraryFetch();
    expect(await loadLibrary()).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/Stories/library.json?v=12345");
    document.head.querySelector('meta[name="build-id"]').remove();
  });

  it("asks for the bare URL when the page has no build id", async () => {
    const fetchMock = stubLibraryFetch();
    await loadLibrary();
    expect(fetchMock).toHaveBeenCalledWith("/Stories/library.json");
  });
});

describe("a remembered world that no longer exists", () => {
  it("is cleared and treated as All by filters", async () => {
    localStorage.setItem("stories-world", "deleted-world");
    mountOn({ mount: mountFilters }, '[data-mount="filters"]');
    await vi.waitFor(() => expect(document.querySelector('[data-role="results-status"]').textContent).not.toBe(""));
    expect(visible()).toEqual(SLUGS);
    expect(localStorage.getItem("stories-world")).toBeNull();
  });

  it("is cleared by world-switcher, which then shows All pressed", async () => {
    localStorage.setItem("stories-world", "deleted-world");
    mountOn({ mount: mountSwitcher }, '[data-mount="world-switcher"]');
    await vi.waitFor(() => expect(document.querySelectorAll("button[data-world]").length).toBe(3));
    expect(document.querySelector('button[data-world=""]').getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("stories-world")).toBeNull();
  });

  it("leaves a different value alone when it is not the stored one", () => {
    localStorage.setItem("stories-world", "test-world");
    expect(knownWorld("deleted-world", library.worlds)).toBe("");
    expect(localStorage.getItem("stories-world")).toBe("test-world");
    expect(knownWorld("test-world", library.worlds)).toBe("test-world");
    expect(knownWorld("", library.worlds)).toBe("");
  });
});
