// @vitest-environment jsdom
// continue, played-lately, play-button on the library-page fixture.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount as mountContinue } from "../../site/assets/js/continue.mjs";
import { mount as mountPlayButton } from "../../site/assets/js/play-button.mjs";
import { mount as mountPlayedLately } from "../../site/assets/js/played-lately.mjs";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { nav } from "../../site/assets/js/nav.mjs";
import { markCompleted, write } from "../../site/assets/js/progress.mjs";
import {
  libraryPageHtml, loadPage, progressV1, progressV2, seed, stubLibraryFetch, storyPageHtml, useFixedNow,
} from "./helpers.mjs";

const HOSTILE_LIB = () => ({
  stories: [{
    slug: "w/evil", title: "<img src=x onerror=alert(1)>", world: "w", series: null, seriesOrder: null,
    durationSec: 60, tags: [], url: "javascript:alert(1)", icon: "sun", publishDate: "2026-11-01",
  }],
  worlds: [{ name: "w", title: "W", tagline: "", accent: "sage", icon: "sun", hasLore: false }],
  lore: [],
});

beforeEach(() => {
  localStorage.clear();
  resetLibrary();
  useFixedNow();
  loadPage(libraryPageHtml);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("continue", () => {
  it("shows the most recent unfinished story from library.json, with progress", async () => {
    stubLibraryFetch();
    seed(progressV2);
    const el = document.querySelector('[data-mount="continue"]');
    mountContinue(el);
    await vi.waitFor(() => expect(el.querySelector("a")).not.toBeNull());
    const card = el.querySelector("a");
    expect(card.dataset.state).toBe("resume");
    expect(card.getAttribute("href")).toBe("/Stories/stories/the-test-series/first-tale/?autoplay=1");
    expect(card.querySelector('[data-role="title"]').textContent).toBe("The First Tale of Testing");
    expect(card.querySelector("progress").value).toBe(50);
    expect(card.dataset.accent).toBe("sage");
    expect(card.dataset.icon).toBe("sun");
    expect(el.hidden).toBe(false);
  });

  it("with no history shows the newest story", async () => {
    stubLibraryFetch();
    const el = document.querySelector('[data-mount="continue"]');
    mountContinue(el);
    await vi.waitFor(() => expect(el.querySelector("a")).not.toBeNull());
    expect(el.querySelector("a").dataset.state).toBe("start");
    expect(el.querySelector('[data-role="title"]').textContent).toBe('The <Second> & "Quoted" Tale');
    expect(el.querySelector("progress")).toBeNull();
  });

  it("reads v1 history but takes title and URL from the library, not storage", async () => {
    stubLibraryFetch();
    seed(progressV1);
    const el = document.querySelector('[data-mount="continue"]');
    mountContinue(el);
    await vi.waitFor(() => expect(el.querySelector("a")).not.toBeNull());
    // second-tale (v1, audioTime 5, hostile stored title/url) is the most recent.
    const card = el.querySelector("a");
    expect(card.dataset.slug).toBe("test-world/second-tale");
    expect(card.getAttribute("href")).toBe("/Stories/stories/the-test-series/second-tale/?autoplay=1");
    expect(card.textContent).not.toContain("onerror");
    expect(el.querySelector("img")).toBeNull();
  });

  it("offers Play again when every story is finished", async () => {
    stubLibraryFetch();
    for (const s of ["test-world/first-tale", "test-world/second-tale", "other-world/lone-tale"]) markCompleted(s);
    const el = document.querySelector('[data-mount="continue"]');
    mountContinue(el);
    await vi.waitFor(() => expect(el.querySelector("a")).not.toBeNull());
    expect(el.querySelector("a").dataset.state).toBe("again");
    expect(el.querySelector('[data-role="action"]').textContent).toBe("Play again");
  });

  it("updates on stories:progress and does not re-render when nothing changed", async () => {
    stubLibraryFetch();
    const el = document.querySelector('[data-mount="continue"]');
    mountContinue(el);
    await vi.waitFor(() => expect(el.querySelector("a")).not.toBeNull());
    const before = el.querySelector("a");
    document.dispatchEvent(new CustomEvent("stories:progress", { detail: { slug: "x" } }));
    expect(el.querySelector("a")).toBe(before);
    write("other-world/lone-tale", { audioTime: 40 });
    expect(el.querySelector("a")).not.toBe(before);
    expect(el.querySelector("a").dataset.slug).toBe("other-world/lone-tale");
  });

  it("never injects markup or unsafe links from library data", async () => {
    stubLibraryFetch(HOSTILE_LIB());
    const el = document.querySelector('[data-mount="continue"]');
    mountContinue(el);
    await vi.waitFor(() => expect(el.querySelector("a")).not.toBeNull());
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector('[data-role="title"]').textContent).toBe("<img src=x onerror=alert(1)>");
    expect(el.querySelector("a").getAttribute("href")).toMatch(/^#/);
  });

  it("hides itself when library.json cannot be loaded, and unmounts cleanly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = document.querySelector('[data-mount="continue"]');
    const unmount = mountContinue(el);
    await vi.waitFor(() => expect(el.hidden).toBe(true));
    unmount();
    expect(el.children).toHaveLength(0);
  });
});

describe("played-lately", () => {
  it("lists the three most recent stories, finished or not, newest first", async () => {
    stubLibraryFetch();
    seed(progressV2); // first-tale in progress (older), second-tale finished (newer)
    write("other-world/lone-tale", { audioTime: 30 });
    const el = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(el);
    await vi.waitFor(() => expect(el.querySelectorAll("li")).toHaveLength(3));
    const items = [...el.querySelectorAll("a")];
    expect(items.map((a) => a.dataset.slug)).toEqual([
      "other-world/lone-tale", "test-world/second-tale", "test-world/first-tale",
    ]);
    expect(items.map((a) => a.dataset.state)).toEqual(["in-progress", "finished", "in-progress"]);
    expect(items[1].querySelector('[data-role="state"]').textContent).toBe("Finished");
    expect(items[2].getAttribute("href")).toBe("/Stories/stories/the-test-series/first-tale/");
  });

  it("keeps a finished story visible, unlike Continue", async () => {
    stubLibraryFetch();
    markCompleted("test-world/first-tale");
    const lately = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(lately);
    await vi.waitFor(() => expect(lately.querySelectorAll("li")).toHaveLength(1));
    expect(lately.querySelector("a").dataset.state).toBe("finished");
  });

  it("is hidden with no history", async () => {
    stubLibraryFetch();
    const el = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(el);
    await vi.waitFor(() => expect(el.hidden).toBe(true));
    expect(el.children).toHaveLength(0);
  });

  it("uses library titles and safe links, not stored ones", async () => {
    stubLibraryFetch();
    seed(progressV1);
    const el = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(el);
    await vi.waitFor(() => expect(el.querySelectorAll("li")).toHaveLength(2));
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).not.toContain("onerror=alert(1)>");
    for (const a of el.querySelectorAll("a")) expect(a.getAttribute("href")).toMatch(/^\/Stories\/stories\//);
  });

  it("refreshes when progress changes", async () => {
    stubLibraryFetch();
    const el = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(el);
    await vi.waitFor(() => expect(el.hidden).toBe(true));
    write("test-world/first-tale", { audioTime: 30 });
    expect(el.hidden).toBe(false);
    expect(el.querySelectorAll("li")).toHaveLength(1);
  });
});

describe("play-button", () => {
  function button() {
    loadPage(storyPageHtml);
    return document.querySelector('[data-mount="play-button"]');
  }

  it("fires a cancelable stories:play and stays put when handled", async () => {
    stubLibraryFetch();
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    const el = button();
    mountPlayButton(el);
    const seen = [];
    const handler = (e) => { seen.push(e.detail.slug); e.preventDefault(); };
    document.addEventListener("stories:play", handler);
    el.click();
    document.removeEventListener("stories:play", handler);
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual(["test-world/first-tale"]);
    expect(go).not.toHaveBeenCalled();
  });

  it("navigates to the story with ?autoplay=1 when nobody handles it", async () => {
    stubLibraryFetch();
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    const el = button();
    mountPlayButton(el);
    el.click();
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith("/Stories/stories/the-test-series/first-tale/?autoplay=1"));
  });

  it("does not navigate for a slug missing from the library", async () => {
    stubLibraryFetch();
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    const el = button();
    el.dataset.slug = "nope/none";
    mountPlayButton(el);
    el.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(go).not.toHaveBeenCalled();
  });

  it("labels Resume while in progress and Play again when finished", async () => {
    stubLibraryFetch();
    const el = button();
    mountPlayButton(el);
    expect(el.textContent).toBe("Play");
    write("test-world/first-tale", { audioTime: 120 });
    expect(el.textContent).toBe("Resume");
    expect(el.dataset.state).toBe("in-progress");
    markCompleted("test-world/first-tale");
    expect(el.textContent).toBe("Play again");
    write("test-world/first-tale", { audioTime: 4 }); // replay under 10s
    expect(el.textContent).toBe("Play again");
    write("test-world/first-tale", { audioTime: 15 });
    expect(el.textContent).toBe("Resume");
  });

  it("restores the original label on unmount and ignores clicks afterwards", async () => {
    stubLibraryFetch();
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    const el = button();
    const unmount = mountPlayButton(el);
    write("test-world/first-tale", { audioTime: 120 });
    unmount();
    expect(el.textContent).toBe("Play");
    el.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(go).not.toHaveBeenCalled();
  });

  it("does nothing without a data-slug", () => {
    const el = document.createElement("button");
    el.textContent = "Play";
    expect(() => mountPlayButton(el)()).not.toThrow();
  });
});
