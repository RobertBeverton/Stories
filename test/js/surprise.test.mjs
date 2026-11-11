// @vitest-environment jsdom
// The Surprise me sheet, the shared sheet helper, and the Home world picker's
// "All N worlds" behaviour, on small hand-made libraries.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { nav } from "../../site/assets/js/nav.mjs";
import { markCompleted, write } from "../../site/assets/js/progress.mjs";
import { mount as mountSurprise } from "../../site/assets/js/surprise.mjs";
import { mount as mountWorlds } from "../../site/assets/js/world-switcher.mjs";
import { stubLibraryFetch, useFixedNow } from "./helpers.mjs";

const story = (slug, world, extra = {}) => ({
  slug, title: `Story ${slug}`, world, series: "A Series", seriesOrder: null, durationSec: 1200, tags: [],
  url: `/Stories/stories/${slug}/`, icon: "sun", publishDate: "2026-10-01", ...extra,
});
const world = (name, title) => ({ name, title, tagline: "", accent: "sage", icon: "sun", hasLore: false });

function lib(worldCount) {
  const worlds = Array.from({ length: worldCount }, (_, i) => world(`w${i + 1}`, `World ${i + 1}`));
  const stories = worlds.flatMap((w) => ["a", "b", "c"].map((id) => story(`${w.name}/${id}`, w.name)));
  return { stories, worlds, lore: [] };
}

beforeEach(() => {
  localStorage.clear();
  resetLibrary();
  useFixedNow();
  document.documentElement.dataset.base = "/Stories";
  document.body.innerHTML = '<main id="view"><div class="world-picker" data-mount="world-switcher" data-variant="picker"></div></main><div class="dock"></div>';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("surprise sheet", () => {
  async function open(data = lib(3)) {
    stubLibraryFetch(data);
    const unmount = mountSurprise(document.createElement("div"));
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    document.dispatchEvent(new CustomEvent("stories:surprise"));
    return { unmount, sheet: document.querySelector('[data-role="surprise-sheet"]') };
  }
  const title = (sheet) => sheet.querySelector(".surprise-title").textContent;
  const chip = (sheet, name) => sheet.querySelector(`.sheet-chips [data-world="${name}"]`);

  it("opens with a pick, the world chips and Play and Another one; the page behind goes inert", async () => {
    const { sheet } = await open();
    expect(sheet.hidden).toBe(false);
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById("view").hasAttribute("inert")).toBe(true);
    expect([...sheet.querySelectorAll(".sheet-chips button")].map((b) => b.textContent)).toEqual(["All worlds", "World 1", "World 2", "World 3"]);
    expect(sheet.querySelector(".surprise-status").textContent).toBe("Not heard yet");
    expect(sheet.querySelector('[data-role="surprise-play"]')).not.toBeNull();
  });

  it("Close shuts it, un-inerts the page and gives focus back", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { sheet } = await open();
    sheet.querySelector('[data-role="sheet-close"]').click();
    expect(sheet.hidden).toBe(true);
    expect(document.getElementById("view").hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("Escape closes it", async () => {
    const { sheet } = await open();
    sheet.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(sheet.hidden).toBe(true);
  });

  it("choosing a world keeps the pick inside it, and the choice is remembered", async () => {
    const { sheet } = await open();
    chip(sheet, "w2").click();
    expect(chip(sheet, "w2").getAttribute("aria-pressed")).toBe("true");
    expect(title(sheet)).toMatch(/^Story w2\//);
    expect(localStorage.getItem("stories-surprise-world")).toBe("w2");
    for (let i = 0; i < 5; i++) {
      sheet.querySelector('[data-role="surprise-again"]').click();
      expect(title(sheet)).toMatch(/^Story w2\//);
    }
    sheet.querySelector('[data-role="sheet-close"]').click();
    document.dispatchEvent(new CustomEvent("stories:surprise"));
    expect(chip(sheet, "w2").getAttribute("aria-pressed")).toBe("true"); // reopens on the last world
  });

  it("Another one does not repeat until the world has run out", async () => {
    const { sheet } = await open();
    chip(sheet, "w1").click();
    const seen = new Set([title(sheet)]);
    sheet.querySelector('[data-role="surprise-again"]').click();
    seen.add(title(sheet));
    sheet.querySelector('[data-role="surprise-again"]').click();
    seen.add(title(sheet));
    expect(seen.size).toBe(3);
  });

  it("offers stories never heard before ones already finished", async () => {
    markCompleted("w1/a");
    markCompleted("w1/b");
    const { sheet } = await open();
    chip(sheet, "w1").click();
    expect(title(sheet)).toBe("Story w1/c");
  });

  it("says how often a heard story has been heard", async () => {
    for (const s of ["w1/a", "w1/b", "w1/c"]) { markCompleted(s); write(s, { audioTime: 40 }); markCompleted(s); }
    const { sheet } = await open();
    chip(sheet, "w1").click();
    expect(sheet.querySelector(".surprise-status").textContent).toBe("Heard 2 times");
  });

  it("Play closes the sheet and asks the player; if nobody takes it, it opens the story with autoplay", async () => {
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    const { sheet } = await open();
    chip(sheet, "w3").click();
    const slug = `w3/${title(sheet).slice("Story w3/".length)}`;
    const seen = [];
    const taker = (e) => { seen.push(e.detail.slug); e.preventDefault(); };
    document.addEventListener("stories:play", taker);
    sheet.querySelector('[data-role="surprise-play"]').click();
    document.removeEventListener("stories:play", taker);
    expect(seen).toEqual([slug]);
    expect(sheet.hidden).toBe(true);
    expect(go).not.toHaveBeenCalled();

    document.dispatchEvent(new CustomEvent("stories:surprise"));
    sheet.querySelector('[data-role="surprise-play"]').click();
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith(expect.stringMatching(/^\/Stories\/stories\/w\d\/[abc]\/\?autoplay=1$/)));
  });

  it("orders the world chips by what was played last, All worlds first", async () => {
    write("w3/a", { audioTime: 60 });
    const { sheet } = await open();
    expect([...sheet.querySelectorAll(".sheet-chips button")].map((b) => b.dataset.world)).toEqual(["", "w3", "w1", "w2"]);
  });

  it("a remembered world that no longer exists falls back to All worlds", async () => {
    localStorage.setItem("stories-surprise-world", "gone");
    const { sheet } = await open();
    expect(chip(sheet, "").getAttribute("aria-pressed")).toBe("true");
  });

  it("removes its sheet from the page when unmounted", async () => {
    const { unmount } = await open();
    unmount();
    expect(document.querySelector('[data-role="surprise-sheet"]')).toBeNull();
    expect(document.getElementById("view").hasAttribute("inert")).toBe(false);
  });
});

describe("Home world picker", () => {
  async function drawn(count) {
    stubLibraryFetch(lib(count));
    const el = document.querySelector('[data-mount="world-switcher"]');
    mountWorlds(el);
    await vi.waitFor(() => expect(el.querySelector('[role="group"]')).not.toBeNull());
    return el;
  }

  it("shows every world as a tile when there are three or fewer, with no All worlds tile", async () => {
    const el = await drawn(3);
    expect([...el.querySelectorAll(".world-tile")].map((t) => t.dataset.world)).toEqual(["w1", "w2", "w3"]);
    expect(el.querySelector('[data-role="all-worlds"]')).toBeNull();
  });

  it("with four or more shows two worlds and an All N worlds tile that opens a sheet of every world", async () => {
    const el = await drawn(6);
    expect([...el.querySelectorAll(".world-tile[data-world]")].map((t) => t.dataset.world)).toEqual(["w1", "w2"]);
    const more = el.querySelector('[data-role="all-worlds"]');
    expect(more.textContent).toContain("All 6 worlds");
    more.click();
    const sheet = document.querySelector('[data-role="worlds-sheet"]');
    expect(sheet.hidden).toBe(false);
    const names = [...sheet.querySelectorAll(".world-tile")].map((t) => t.dataset.world);
    expect(names).toEqual(["", "w1", "w2", "w3", "w4", "w5", "w6"]);
  });

  it("picking a world in the sheet remembers it, closes the sheet and opens the Library", async () => {
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    const el = await drawn(5);
    el.querySelector('[data-role="all-worlds"]').click();
    const sheet = document.querySelector('[data-role="worlds-sheet"]');
    sheet.querySelector('.world-tile[data-world="w4"]').click();
    expect(localStorage.getItem("stories-world")).toBe("w4");
    expect(sheet.hidden).toBe(true);
    expect(go).toHaveBeenCalledWith("/Stories/library/");
  });

  it("puts the most recently played world first", async () => {
    write("w2/a", { audioTime: 90 });
    const el = await drawn(3);
    expect([...el.querySelectorAll(".world-tile")].map((t) => t.dataset.world)).toEqual(["w2", "w1", "w3"]);
  });

  it("the Library chips keep a fixed order whatever was played", async () => {
    write("w3/a", { audioTime: 90 });
    stubLibraryFetch(lib(3));
    const el = document.createElement("div");
    el.dataset.variant = "filter";
    document.body.append(el);
    mountWorlds(el);
    await vi.waitFor(() => expect(el.querySelector('[role="group"]')).not.toBeNull());
    expect([...el.querySelectorAll("button")].map((b) => b.dataset.world)).toEqual(["", "w1", "w2", "w3"]);
  });
});
