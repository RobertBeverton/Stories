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
  fakeAudio, libraryPageHtml, loadPage, progressV1, progressV2, seed, stubLibraryFetch, storyPageHtml, useFixedNow,
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
  it("lists the two most recent stories after the Continue story, finished or not, then Surprise me", async () => {
    stubLibraryFetch();
    seed(progressV2); // first-tale in progress (older), second-tale finished (newer)
    write("other-world/lone-tale", { audioTime: 30 }); // newest touch: this is the Continue story
    const el = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(el);
    await vi.waitFor(() => expect(el.querySelectorAll("li")).toHaveLength(3));
    const items = [...el.querySelectorAll("a")];
    expect(items.map((a) => a.dataset.slug)).toEqual(["test-world/second-tale", "test-world/first-tale"]);
    expect(items.map((a) => a.dataset.state)).toEqual(["finished", "in-progress"]);
    expect(items[0].querySelector('[data-role="state"]').textContent).toBe("Finished");
    expect(items[1].getAttribute("href")).toBe("/Stories/stories/the-test-series/first-tale/");
    expect(el.querySelector('button[data-role="surprise-tile"]')).not.toBeNull();
  });

  it("shows how many times a story has been heard", async () => {
    stubLibraryFetch();
    markCompleted("test-world/first-tale");
    write("test-world/first-tale", { audioTime: 30 });
    markCompleted("test-world/first-tale");
    const el = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(el);
    await vi.waitFor(() => expect(el.querySelector('a[data-slug="test-world/first-tale"]')).not.toBeNull());
    expect(el.querySelector('a[data-slug="test-world/first-tale"] [data-role="state"]').textContent).toBe("Heard 2 times");
  });

  it("the Surprise me tile asks the sheet to open", async () => {
    stubLibraryFetch();
    const el = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(el);
    await vi.waitFor(() => expect(el.querySelector('[data-role="surprise-tile"]')).not.toBeNull());
    const seen = vi.fn();
    document.addEventListener("stories:surprise", seen);
    el.querySelector('[data-role="surprise-tile"]').click();
    document.removeEventListener("stories:surprise", seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("keeps a finished story visible, unlike Continue", async () => {
    stubLibraryFetch();
    markCompleted("test-world/first-tale");
    const lately = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(lately);
    await vi.waitFor(() => expect(lately.querySelectorAll("li")).toHaveLength(3));
    const link = lately.querySelector('a[data-slug="test-world/first-tale"]');
    expect(link.dataset.state).toBe("finished");
  });

  it("with no history it offers the newest stories, not played yet, and Surprise me", async () => {
    stubLibraryFetch();
    const el = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(el);
    await vi.waitFor(() => expect(el.querySelectorAll("li")).toHaveLength(3));
    expect(el.hidden).toBe(false);
    const items = [...el.querySelectorAll("a")];
    expect(items.map((a) => a.dataset.state)).toEqual(["new", "new"]);
    expect(items.map((a) => a.dataset.slug)).not.toContain("test-world/second-tale"); // the Continue story
    expect(items[0].querySelector('[data-role="state"]').textContent).toBe("Not played yet");
  });

  it("uses library titles and safe links, not stored ones", async () => {
    stubLibraryFetch();
    seed(progressV1);
    const el = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(el);
    await vi.waitFor(() => expect(el.querySelectorAll("li")).toHaveLength(3));
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).not.toContain("onerror=alert(1)>");
    for (const a of el.querySelectorAll("a")) expect(a.getAttribute("href")).toMatch(/^\/Stories\/stories\//);
  });

  it("refreshes when progress changes", async () => {
    stubLibraryFetch();
    const el = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(el);
    await vi.waitFor(() => expect(el.querySelectorAll("a")).toHaveLength(2));
    expect([...el.querySelectorAll("a")].map((a) => a.dataset.slug)).toContain("test-world/first-tale");
    write("test-world/first-tale", { audioTime: 30 }); // now the Continue story, so the row leaves it out
    expect([...el.querySelectorAll("a")].map((a) => a.dataset.slug)).not.toContain("test-world/first-tale");
    expect(el.querySelectorAll("a")).toHaveLength(2);
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

describe("play-button: Pause while its story plays (data-pause-when-playing)", () => {
  const SLUG = "test-world/first-tale";
  let audio;
  let ctl;

  function pausable() {
    loadPage(storyPageHtml);
    audio = document.querySelector("audio");
    ctl = fakeAudio(audio, { duration: 600 });
    const el = document.querySelector('[data-mount="play-button"]');
    el.setAttribute("data-pause-when-playing", "");
    return el;
  }

  it("reads Pause while the audio plays this story, and Play or Resume again after a pause", async () => {
    stubLibraryFetch();
    const el = pausable();
    mountPlayButton(el);
    expect(el.textContent).toBe("Play");
    audio.play();
    expect(el.textContent).toBe("Pause");
    expect(el.dataset.playing).toBe("true");
    ctl.pauseAt(120);
    write(SLUG, { audioTime: 120 });
    expect(el.textContent).toBe("Resume");
    expect(el.dataset.playing).toBeUndefined();
  });

  it("pauses the audio instead of asking to play, and does not navigate", async () => {
    stubLibraryFetch();
    const go = vi.spyOn(nav, "go").mockImplementation(() => {});
    const el = pausable();
    mountPlayButton(el);
    audio.play();
    const asked = vi.fn();
    document.addEventListener("stories:play", asked);
    el.click();
    document.removeEventListener("stories:play", asked);
    await new Promise((r) => setTimeout(r, 10));
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(asked).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });

  it("is not Pause while the audio plays a different story", async () => {
    stubLibraryFetch();
    const el = pausable();
    mountPlayButton(el);
    audio.dataset.slug = "test-world/second-tale";
    audio.play();
    expect(el.textContent).toBe("Play");
  });

  it("swaps the glyph and puts the original label, glyph and state back on unmount", async () => {
    stubLibraryFetch();
    loadPage(storyPageHtml);
    audio = document.querySelector("audio");
    ctl = fakeAudio(audio);
    const el = document.querySelector('[data-mount="play-button"]');
    el.setAttribute("data-pause-when-playing", "");
    el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><span data-role="label">Play</span>';
    const unmount = mountPlayButton(el);
    audio.play();
    expect(el.querySelector("path").getAttribute("d")).not.toBe("M8 5v14l11-7z");
    expect(el.querySelector("[data-role=label]").textContent).toBe("Pause");
    unmount();
    expect(el.querySelector("path").getAttribute("d")).toBe("M8 5v14l11-7z");
    expect(el.querySelector("[data-role=label]").textContent).toBe("Play");
    expect(el.dataset.playing).toBeUndefined();
    audio.pause();
  });

  it("an ordinary Play button ignores the audio", async () => {
    stubLibraryFetch();
    loadPage(storyPageHtml);
    audio = document.querySelector("audio");
    ctl = fakeAudio(audio);
    const el = document.querySelector('[data-mount="play-button"]');
    mountPlayButton(el);
    audio.play();
    expect(el.textContent).toBe("Play");
  });
});

describe("Home follows the audio clock of the story that is playing", () => {
  const SLUG = "test-world/first-tale"; // 600 s in the fixture library
  let audio;
  let ctl;

  function playingShell() {
    audio = document.createElement("audio");
    audio.dataset.role = "shell-audio";
    audio.dataset.slug = SLUG;
    document.body.append(audio);
    ctl = fakeAudio(audio, { duration: 600 });
  }

  it("Continue shows a story started seconds ago, and its bar moves between saves", async () => {
    stubLibraryFetch();
    playingShell();
    const el = document.querySelector('[data-mount="continue"]');
    mountContinue(el);
    await vi.waitFor(() => expect(el.querySelector("a")).not.toBeNull());
    expect(el.querySelector("a").dataset.state).toBe("start"); // nothing playing yet
    audio.play();
    ctl.tick(1.5); // under the 5 s save interval: nothing saved yet
    const card = el.querySelector("a");
    expect(card.dataset.state).toBe("resume");
    expect(card.dataset.slug).toBe(SLUG);
    expect(card.querySelector("progress").value).toBe(0);
    vi.setSystemTime(Date.now() + 2000);
    ctl.tick(150);
    expect(el.querySelector("a")).toBe(card); // updated in place, not rebuilt
    expect(card.querySelector("progress").value).toBe(25);
    expect(card.querySelector("progress").getAttribute("aria-label")).toBe("25% listened");
  });

  it("Continue stops following once the audio is paused (the saved record takes over)", async () => {
    stubLibraryFetch();
    playingShell();
    const el = document.querySelector('[data-mount="continue"]');
    mountContinue(el);
    await vi.waitFor(() => expect(el.querySelector("a")).not.toBeNull());
    audio.play();
    ctl.tick(60);
    expect(el.querySelector("progress").value).toBe(10);
    write(SLUG, { audioTime: 60, playing: false }); // what the pause handlers save
    ctl.pauseAt(60);
    expect(el.querySelector("progress").value).toBe(10);
  });

  it("Pick a story leaves out the story that is playing, because Continue shows it", async () => {
    stubLibraryFetch();
    playingShell();
    const el = document.querySelector('[data-mount="played-lately"]');
    mountPlayedLately(el);
    await vi.waitFor(() => expect(el.querySelectorAll("a")).toHaveLength(2));
    audio.play();
    ctl.tick(3);
    expect(el.querySelector(`a[data-slug="${SLUG}"]`)).toBeNull();
    expect(el.querySelectorAll("a")).toHaveLength(2);
  });

  it("does not let a loaded but paused story overwrite what was saved", async () => {
    stubLibraryFetch();
    playingShell();
    write(SLUG, { audioTime: 300 });
    ctl.tick(0); // loaded at 0 for a resume, paused
    const el = document.querySelector('[data-mount="continue"]');
    mountContinue(el);
    await vi.waitFor(() => expect(el.querySelector("progress")).not.toBeNull());
    expect(el.querySelector("progress").value).toBe(50);
  });

  it("stops listening to the audio on unmount", async () => {
    stubLibraryFetch();
    playingShell();
    const el = document.querySelector('[data-mount="continue"]');
    const unmount = mountContinue(el);
    await vi.waitFor(() => expect(el.querySelector("a")).not.toBeNull());
    unmount();
    audio.play();
    ctl.tick(100);
    expect(el.querySelector("a")).toBeNull();
  });
});
