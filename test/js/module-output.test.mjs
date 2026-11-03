// @vitest-environment jsdom
// What the modules emit for CSS (classes, covers, tiles), the world accent,
// text-size persistence and the icon-only play button. Hooks (data-role) are
// covered by the other module tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PALETTE, paletteByName } from "../../site/assets/js/accent-colors.mjs";
import { mount as mountContinue } from "../../site/assets/js/continue.mjs";
import { mount as mountFilters } from "../../site/assets/js/filters.mjs";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { nav } from "../../site/assets/js/nav.mjs";
import { mount as mountPlayButton } from "../../site/assets/js/play-button.mjs";
import { mount as mountPlayedLately } from "../../site/assets/js/played-lately.mjs";
import { mount as mountTextSize } from "../../site/assets/js/text-size.mjs";
import { startWorldAccent } from "../../site/assets/js/world-accent.mjs";
import { setWorld } from "../../site/assets/js/world-state.mjs";
import { mount as mountSwitcher } from "../../site/assets/js/world-switcher.mjs";
import { library, libraryPageHtml, loadPage, progressV2, seed, stubLibraryFetch, useFixedNow } from "./helpers.mjs";

let unmounts = [];
const mount = (fn, selector) => {
  const un = fn(document.querySelector(selector));
  unmounts.push(un);
  return un;
};

beforeEach(() => {
  localStorage.clear();
  resetLibrary();
  useFixedNow();
  stubLibraryFetch();
  loadPage(libraryPageHtml);
  document.documentElement.removeAttribute("style");
});
afterEach(() => {
  for (const un of unmounts) un();
  unmounts = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("classes the CSS styles", () => {
  it("Continue card uses card-continue with a cover, label, title and button classes", async () => {
    seed(progressV2);
    mount(mountContinue, '[data-mount="continue"]');
    const card = await vi.waitFor(() => {
      const a = document.querySelector('[data-mount="continue"] a');
      expect(a).not.toBeNull();
      return a;
    });
    expect(card.classList.contains("card-continue")).toBe(true);
    expect(card.querySelector(".cover svg path.icon-main").getAttribute("d")).toMatch(/^M/);
    expect(card.querySelector(".cover").getAttribute("style")).toContain("--series:");
    expect(card.querySelector(".card-continue-label").textContent).toBeTruthy();
    expect(card.querySelector(".card-continue-title").textContent).toBeTruthy();
    expect(card.querySelector(".btn.btn-primary.btn-lg").textContent).toBeTruthy();
  });

  it("Played lately renders ul.lately > li > a.lately-item with a cover and title", async () => {
    seed(progressV2);
    mount(mountPlayedLately, '[data-mount="played-lately"]');
    await vi.waitFor(() => expect(document.querySelector(".lately-item")).not.toBeNull());
    const item = document.querySelector("ul.lately > li > a.lately-item");
    expect(item.querySelector(".cover svg")).not.toBeNull();
    expect(item.querySelector(".lately-title").textContent).toBeTruthy();
    expect(item.querySelector(".lately-state").textContent).toMatch(/Finished|In progress/);
  });

  it("filters draw .btn chips and a styled series select", async () => {
    mount(mountFilters, '[data-mount="filters"]');
    await vi.waitFor(() => expect(document.querySelector("[data-filter]")).not.toBeNull());
    for (const button of document.querySelectorAll("[data-filter]")) expect(button.classList.contains("btn")).toBe(true);
    expect(document.querySelector("select").classList.contains("filter-select")).toBe(true);
  });
});

describe("world-switcher variants", () => {
  it("draws .btn chips by default", async () => {
    mount(mountSwitcher, '[data-mount="world-switcher"]');
    await vi.waitFor(() => expect(document.querySelector("button[data-world]")).not.toBeNull());
    const buttons = [...document.querySelectorAll("button[data-world]")];
    expect(buttons).toHaveLength(library.worlds.length + 1);
    expect(buttons.every((b) => b.classList.contains("btn"))).toBe(true);
  });

  it("picker draws tiles with the PALETTE colours and goes on to the Library after a choice", async () => {
    const el = document.querySelector('[data-mount="world-switcher"]');
    el.dataset.variant = "picker";
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    mount(mountSwitcher, '[data-mount="world-switcher"]');
    await vi.waitFor(() => expect(el.querySelector(".world-tile")).not.toBeNull());
    expect(el.querySelector(".world-tiles")).not.toBeNull();
    const tile = el.querySelector('.world-tile[data-world="test-world"]');
    const sage = paletteByName("sage");
    expect(tile.getAttribute("style")).toContain(`--tile: ${sage.background}`);
    expect(tile.getAttribute("style")).toContain(`--tile-ink: ${sage.text}`);
    expect(tile.querySelector("svg path.icon-main")).not.toBeNull();
    tile.click();
    expect(go).toHaveBeenCalledWith("/Stories/library/");
  });

  it("filter variant stays on the page", async () => {
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    mount(mountSwitcher, '[data-mount="world-switcher"]');
    await vi.waitFor(() => expect(document.querySelector("button[data-world]")).not.toBeNull());
    document.querySelector('button[data-world="test-world"]').click();
    expect(go).not.toHaveBeenCalled();
  });
});

describe("world accent", () => {
  const style = () => document.documentElement.style;

  it("sets --accent and --accent-ink from the world's palette entry and clears them for All", async () => {
    unmounts.push(startWorldAccent());
    setWorld("test-world");
    await vi.waitFor(() => expect(style().getPropertyValue("--accent")).toBe(paletteByName("sage").background));
    expect(style().getPropertyValue("--accent-ink")).toBe(paletteByName("sage").text);
    setWorld("other-world");
    expect(style().getPropertyValue("--accent")).toBe(paletteByName("sky").background);
    setWorld("");
    expect(style().getPropertyValue("--accent")).toBe("");
  });

  it("applies the remembered world on load", async () => {
    localStorage.setItem("stories-world", "other-world");
    unmounts.push(startWorldAccent());
    await vi.waitFor(() => expect(style().getPropertyValue("--accent")).toBe(paletteByName("sky").background));
  });

  it("ignores and clears a remembered world that no longer exists", async () => {
    localStorage.setItem("stories-world", "deleted-world");
    unmounts.push(startWorldAccent());
    await vi.waitFor(() => expect(localStorage.getItem("stories-world")).toBeNull());
    expect(style().getPropertyValue("--accent")).toBe("");
  });

  it("uses only palette names for the fixture worlds", () => {
    for (const world of library.worlds) expect(PALETTE.map((p) => p.name)).toContain(world.accent);
  });
});

describe("text-size", () => {
  const fieldset = () => {
    document.body.innerHTML = `<fieldset data-mount="text-size">
      <input type="radio" name="ts" id="ts-sm" value="sm"><input type="radio" name="ts" id="ts-md" value="md" checked>
      <input type="radio" name="ts" id="ts-lg" value="lg"></fieldset>`;
    return document.querySelector("fieldset");
  };

  it("remembers the choice and restores it on the next page", () => {
    const first = fieldset();
    const un = mountTextSize(first);
    const lg = first.querySelector("#ts-lg");
    lg.checked = true;
    lg.dispatchEvent(new Event("change", { bubbles: true }));
    expect(localStorage.getItem("stories-text-size")).toBe("lg");
    un();
    const second = fieldset();
    unmounts.push(mountTextSize(second));
    expect(second.querySelector("#ts-lg").checked).toBe(true);
    expect(second.querySelector("#ts-md").checked).toBe(false);
  });

  it("ignores a junk stored value and survives unavailable storage", () => {
    localStorage.setItem("stories-text-size", "huge");
    const el = fieldset();
    unmounts.push(mountTextSize(el));
    expect(el.querySelector("#ts-md").checked).toBe(true);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    el.querySelector("#ts-sm").dispatchEvent(new Event("change", { bubbles: true }));
  });
});

describe("play-button on an icon-only row button", () => {
  const rowButton = () => {
    document.body.innerHTML = `<button type="button" data-mount="play-button" data-slug="test-world/first-tale"
      aria-label="Play The First Tale of Testing"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>`;
    return document.querySelector("button");
  };

  it("keeps its icon and swaps the aria-label verb by progress", async () => {
    seed(progressV2);
    const el = rowButton();
    unmounts.push(mountPlayButton(el));
    await vi.waitFor(() => expect(el.dataset.state).toBeTruthy());
    expect(el.querySelector("svg path")).not.toBeNull();
    const verb = { new: "Play", "in-progress": "Resume", finished: "Play again" }[el.dataset.state];
    expect(el.getAttribute("aria-label")).toBe(`${verb} The First Tale of Testing`);
  });

  it("restores the original label on unmount", () => {
    const el = rowButton();
    const un = mountPlayButton(el);
    un();
    expect(el.getAttribute("aria-label")).toBe("Play The First Tale of Testing");
    expect(el.querySelector("svg")).not.toBeNull();
  });
});
