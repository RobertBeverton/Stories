// @vitest-environment jsdom
// Integration: the REAL templates (rendered with nunjucks, see
// test/templates/render-pages.mjs) mounted by the REAL main.js in jsdom, with
// test/fixtures/library.json served through a stubbed fetch. This is where the
// seams between the templates (WP-B) and the modules (WP-A) are proven to meet.
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { nav } from "../../site/assets/js/nav.mjs";
import { library, loadPage, progressV2, seed, stubLibraryFetch, useFixedNow } from "../js/helpers.mjs";
import { renderHome, renderLibrary, renderOffline, renderStory, root, templateStory } from "../templates/render-pages.mjs";

const stories = library.stories.map((s) => templateStory(s));
const [FIRST, SECOND, LONE] = library.stories.map((s) => s.slug);
const HOSTILE_TITLE = library.stories[1].title; // contains < > & and quotes

const contractHooks = (() => {
  const md = fs.readFileSync(path.join(root, "docs", "contracts.md"), "utf8");
  const line = md.match(/Names:\s*([^.]+)\./s)?.[1];
  return [...line.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
})();
// Hooks named in the contract whose module is not built yet (none now). Anything else unresolved is a bug.
const PENDING_WAVE_2 = [];

const pages = {
  home: () => renderHome(stories),
  library: () => renderLibrary(stories),
  offline: () => renderOffline(stories),
  story: () => renderStory(stories[0], { parts: library.stories[0].parts }, stories),
};

let main;
let warn;
let error;

async function open(name, { progress, world } = {}) {
  if (progress) seed(progress);
  if (world) localStorage.setItem("stories-world", world);
  loadPage(pages[name]());
  await main.mountAll();
}
const rowsVisible = () => [...document.querySelectorAll('[data-role="story-row"]')].filter((r) => !r.hidden).map((r) => r.dataset.slug);
const type = (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  resetLibrary();
  useFixedNow();
  stubLibraryFetch();
  document.documentElement.removeAttribute("style");
  document.documentElement.dataset.base = "/Stories"; // main.js starts the world accent at import
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  main = await import("../../site/assets/js/main.js");
});
afterEach(() => {
  main.unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("hook resolution", () => {
  it("every contract hook has a module except the ones listed as pending wave 2", () => {
    const missing = contractHooks.filter((name) => !fs.existsSync(path.join(root, "site", "assets", "js", `${name}.mjs`)));
    expect(missing.sort()).toEqual(PENDING_WAVE_2);
  });

  it("main.js knows every contract hook", () => {
    expect([...main.NAMES].sort()).toEqual(contractHooks.filter((h) => !PENDING_WAVE_2.includes(h)).sort());
  });

  it.each(Object.keys(pages))("mounts every hook on the %s page; only pending wave 2 hooks warn", async (name) => {
    await open(name);
    await vi.waitFor(() => expect(document.querySelectorAll("[data-mount]").length).toBeGreaterThan(0));
    const warned = warn.mock.calls.map((c) => String(c[0]));
    const unexpected = warned.filter((w) => !PENDING_WAVE_2.some((hook) => w === `mount ${hook} failed`));
    expect(unexpected).toEqual([]);
    expect(error).not.toHaveBeenCalled();
    // Each warning is for a hook that is actually on the page.
    const onPage = new Set([...document.querySelectorAll("[data-mount]")].map((el) => el.dataset.mount));
    for (const w of warned) expect(onPage.has(w.replace(/^mount (\S+) failed$/, "$1"))).toBe(true);
  });
});

describe("library page", () => {
  it("search finds the rows and hides the rest, then restores them", async () => {
    await open("library");
    const input = document.querySelector('[data-mount="search"]');
    await vi.waitFor(() => expect(document.querySelectorAll('[data-role="story-row"]')).toHaveLength(3));
    type(input, "lone");
    await vi.waitFor(() => expect(rowsVisible()).toEqual([LONE]));
    expect(document.querySelector('[data-role="results-status"]').textContent).toBe("1 of 3 stories");
    type(input, "");
    expect(rowsVisible()).toEqual([FIRST, SECOND, LONE].sort((a, b) => stories.findIndex((s) => s.slug === a) - stories.findIndex((s) => s.slug === b)));
    expect(document.querySelector('[data-role="results-status"]').textContent).toBe("3 stories");
  });

  it("shows the template's own empty message when nothing matches", async () => {
    await open("library");
    await vi.waitFor(() => expect(document.querySelector("[data-filter]")).not.toBeNull());
    type(document.querySelector('[data-mount="search"]'), "zzzz");
    const note = document.querySelector("#no-results");
    expect(note.hidden).toBe(false);
    expect(document.querySelectorAll('[data-role="no-results"]')).toHaveLength(1);
    type(document.querySelector('[data-mount="search"]'), "");
    expect(note.hidden).toBe(true);
  });

  it("filter buttons toggle and narrow the rows by progress", async () => {
    await open("library", { progress: progressV2 });
    await vi.waitFor(() => expect(document.querySelector('[data-filter="in-progress"]')).not.toBeNull());
    const chip = document.querySelector('[data-filter="in-progress"]');
    chip.click();
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(rowsVisible()).toEqual([FIRST]);
    chip.click();
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(rowsVisible()).toHaveLength(3);
  });

  it("marks row state and the New badge hook on the template rows", async () => {
    await open("library", { progress: progressV2 });
    await vi.waitFor(() => expect(document.querySelector('[data-role="story-row"][data-state]')).not.toBeNull());
    const row = (slug) => document.querySelector(`[data-role="story-row"][data-slug="${slug}"]`);
    expect(row(FIRST).dataset.state).toBe("in-progress");
    expect(row(SECOND).dataset.state).toBe("finished");
    expect(row(LONE).dataset.state).toBe("new");
    expect(row(SECOND).dataset.new).toBeUndefined();
  });

  it("the world filter narrows rows through stories:world", async () => {
    await open("library");
    await vi.waitFor(() => expect(document.querySelector('[data-mount="world-switcher"] button[data-world="other-world"]')).not.toBeNull());
    document.querySelector('[data-mount="world-switcher"] button[data-world="other-world"]').click();
    expect(rowsVisible()).toEqual([LONE]);
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#97c2d8");
  });

  it("row play buttons keep their icon through progress label updates", async () => {
    await open("library", { progress: progressV2 });
    const button = document.querySelector(`[data-mount="play-button"][data-slug="${FIRST}"]`);
    await vi.waitFor(() => expect(button.dataset.state).toBe("in-progress"));
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe(`Resume ${library.stories[0].title}`);
  });

  it("a row play button plays in the persistent player (no navigation) and the dock shows it", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    await open("library", { progress: progressV2 });
    const button = document.querySelector(`[data-mount="play-button"][data-slug="${FIRST}"]`);
    await vi.waitFor(() => expect(button.dataset.state).toBe("in-progress"));
    await vi.waitFor(() => expect(document.querySelector('[data-role="mini-toggle"]')).not.toBeNull());
    button.click();
    const audio = document.querySelector('audio[data-role="shell-audio"]');
    expect(audio.dataset.slug).toBe(FIRST);
    expect(audio.src).toBe(library.stories[0].audioUrl); // the fixture story now carries an audioUrl, which wins over the sibling mp3
    expect(play).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.querySelector('[data-dock-slot="mini"]').hidden).toBe(false));
    expect(document.querySelector('[data-role="mini-title"]').textContent).toBe(library.stories[0].title);
  });
});

describe("home page", () => {
  it("renders Continue and Played lately from fixture progress, replacing the static fallback", async () => {
    await open("home", { progress: progressV2 });
    await vi.waitFor(() => expect(document.querySelector('[data-mount="continue"] [data-state="resume"]')).not.toBeNull());
    const card = document.querySelector('[data-mount="continue"] a.card-continue');
    expect(card.dataset.slug).toBe(FIRST);
    expect(card.getAttribute("href")).toBe(`${library.stories[0].url}?autoplay=1`);
    expect(card.querySelector("progress").value).toBe(50);
    expect(document.querySelectorAll('[data-mount="continue"] a')).toHaveLength(1);

    // Pick a story: the Continue story is left out, so the played one (SECOND), then the
    // newest story with no history fills the row, then the Surprise me tile.
    await vi.waitFor(() => expect(document.querySelectorAll("a.lately-item")).toHaveLength(2));
    const slugs = [...document.querySelectorAll("a.lately-item")].map((a) => a.dataset.slug);
    expect(slugs).toEqual([SECOND, LONE]);
    expect(document.querySelector('[data-role="surprise-tile"]')).not.toBeNull();
    expect(document.querySelector('[data-mount="played-lately"]').hidden).toBe(false);
  });

  it("with no history: Continue starts the newest story and Pick a story offers the next two plus Surprise me", async () => {
    await open("home");
    await vi.waitFor(() => expect(document.querySelector('[data-mount="continue"] [data-state="start"]')).not.toBeNull());
    expect(document.querySelector('[data-mount="continue"] a').dataset.slug).toBe(SECOND);
    await vi.waitFor(() => expect(document.querySelectorAll("a.lately-item")).toHaveLength(2));
    expect([...document.querySelectorAll("a.lately-item")].map((a) => a.dataset.slug)).toEqual([FIRST, LONE]);
    expect(document.querySelector('[data-role="surprise-tile"]')).not.toBeNull();
  });

  it("the Surprise me tile opens a sheet with a pick, and Another one offers a different story", async () => {
    await open("home");
    await vi.waitFor(() => expect(document.querySelector('[data-role="surprise-tile"]')).not.toBeNull());
    document.querySelector('[data-role="surprise-tile"]').click();
    const sheet = document.querySelector('[data-role="surprise-sheet"]');
    expect(sheet.hidden).toBe(false);
    const first = sheet.querySelector(".surprise-title").textContent;
    expect(first).toBeTruthy();
    sheet.querySelector('[data-role="surprise-again"]').click();
    expect(sheet.querySelector(".surprise-title").textContent).not.toBe(first);
  });

  it("the world picker draws a tile per world (three or fewer), and a pick sets the accent and goes to the Library", async () => {
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    await open("home");
    await vi.waitFor(() => expect(document.querySelectorAll(".world-tile")).toHaveLength(library.worlds.length));
    document.querySelector('.world-tile[data-world="test-world"]').click();
    expect(localStorage.getItem("stories-world")).toBe("test-world");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#a5c695");
    expect(go).toHaveBeenCalledWith("/Stories/library/");
  });
});

describe("story page", () => {
  it("play-button fires stories:play and story-resume claims it and starts the page audio", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    await open("story");
    const button = document.querySelector('[data-mount="play-button"]');
    await vi.waitFor(() => expect(button.dataset.state).toBe("new"));
    const seen = [];
    document.addEventListener("stories:play", (e) => seen.push(e.detail.slug), { once: true });
    button.click();
    expect(seen).toEqual([FIRST]);
    expect(play).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    expect(document.querySelector("audio#player")).not.toBeNull();
  });

  it("claims stories:play by cancelling it (defaultPrevented)", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    await open("story");
    const event = new CustomEvent("stories:play", { detail: { slug: FIRST }, cancelable: true });
    expect(document.dispatchEvent(event)).toBe(false);
    const other = new CustomEvent("stories:play", { detail: { slug: SECOND }, cancelable: true });
    expect(document.dispatchEvent(other)).toBe(true);
  });

  it("shows the resume prompt in the template's own message area, styled as a prompt", async () => {
    await open("story", { progress: progressV2 });
    const area = document.querySelector('[data-role="resume"]');
    await vi.waitFor(() => expect(area.hidden).toBe(false));
    expect(area.classList.contains("resume-prompt")).toBe(true);
    expect(document.querySelectorAll('[data-role="resume"]')).toHaveLength(1);
    expect(area.querySelector('button[data-role="resume-button"].btn')).not.toBeNull();
    expect(area.querySelector('button[data-role="restart-button"].btn')).not.toBeNull();
  });

  it("restores the remembered text size", async () => {
    localStorage.setItem("stories-text-size", "lg");
    await open("story");
    expect(document.querySelector("#ts-lg").checked).toBe(true);
    document.querySelector("#ts-sm").checked = true;
    document.querySelector("#ts-sm").dispatchEvent(new Event("change", { bubbles: true }));
    expect(localStorage.getItem("stories-text-size")).toBe("sm");
  });

  it("fills the parts root from library.json (one button per part)", async () => {
    await open("story");
    const root = document.querySelector('[data-mount="parts"]');
    await vi.waitFor(() => expect(root.querySelectorAll("button")).toHaveLength(library.stories[0].parts.length));
  });
});

describe("escaping", () => {
  it("renders the hostile fixture title as text in every module and template", async () => {
    expect(HOSTILE_TITLE).toMatch(/[<>&"]/);
    await open("library", { progress: { [SECOND]: progressV2[SECOND] } });
    await vi.waitFor(() => expect(document.querySelector('[data-role="story-row"][data-state]')).not.toBeNull());
    const row = document.querySelector(`[data-role="story-row"][data-slug="${SECOND}"]`);
    expect(row.querySelector(".row-title").textContent).toBe(HOSTILE_TITLE);
    expect(row.dataset.title).toBe(HOSTILE_TITLE);
    expect(document.querySelector("second")).toBeNull();

    main.unmountAll();
    await open("home", { progress: { [SECOND]: progressV2[SECOND] } });
    await vi.waitFor(() => expect(document.querySelector(".lately-item")).not.toBeNull());
    expect(document.querySelector(".lately-title").textContent).toBe(HOSTILE_TITLE);
    expect(document.querySelector("second")).toBeNull();
    expect(document.querySelector("main").innerHTML).toContain("&lt;Second&gt;");
  });
});
