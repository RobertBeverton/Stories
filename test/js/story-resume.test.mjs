// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { mount } from "../../site/assets/js/story-resume.mjs";
import { markCompleted, read, write } from "../../site/assets/js/progress.mjs";
import {
  fakeAudio, loadPage, NOW, progressV1, seed, storyPageHtml, stubLibraryFetch, useFixedNow,
} from "./helpers.mjs";

const SLUG = "test-world/first-tale";
let audio;
let ctl;
let unmount;

function mountPage({ duration = 600 } = {}) {
  loadPage(storyPageHtml);
  audio = document.querySelector("audio#player");
  ctl = fakeAudio(audio, { duration });
  unmount = mount(document.querySelector('[data-mount="story-resume"]'));
}

beforeEach(() => {
  localStorage.clear();
  resetLibrary();
  useFixedNow();
  stubLibraryFetch();
  window.history.replaceState(null, "", "/");
  window.scrollTo = vi.fn();
});
afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const area = () => document.querySelector('[data-role="resume"]');
const click = (role) => document.querySelector(`[data-role="${role}"]`).click();

describe("story-resume: resume banner", () => {
  it("offers Resume and Start over when there is saved progress", () => {
    write(SLUG, { audioTime: 120, scrollY: 800 });
    mountPage();
    expect(area().hidden).toBe(false);
    expect(area().getAttribute("role")).toBe("status");
    expect(document.querySelector('[data-role="resume-button"]')).not.toBeNull();
  });

  it("Resume seeks the audio and scrolls, then hides the banner", () => {
    write(SLUG, { audioTime: 120, scrollY: 800 });
    mountPage();
    click("resume-button");
    expect(audio.currentTime).toBe(120);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "smooth" });
    expect(area().hidden).toBe(true);
  });

  it("Start over zeroes position but keeps completedAt", () => {
    write(SLUG, { audioTime: 120, scrollY: 800, completedAt: 5 });
    mountPage();
    click("restart-button");
    expect(audio.currentTime).toBe(0);
    expect(read(SLUG)).toMatchObject({ audioTime: 0, scrollY: 0, completedAt: 5 });
  });

  it("reads a v1 record for the banner", () => {
    seed(progressV1);
    mountPage();
    expect(area().hidden).toBe(false);
    click("resume-button");
    expect(audio.currentTime).toBe(120.5);
  });

  it("stays hidden for a new story, a finished one, or trivial progress", () => {
    mountPage();
    expect(area().hidden).toBe(true);
    unmount();
    markCompleted(SLUG);
    mountPage();
    expect(area().hidden).toBe(true);
    unmount();
    write(SLUG, { audioTime: 3 });
    mountPage();
    expect(area().hidden).toBe(true);
  });

  it("uses a template-provided [data-role=resume] container", () => {
    write(SLUG, { audioTime: 120 });
    loadPage(storyPageHtml);
    const article = document.querySelector('[data-mount="story-resume"]');
    const own = document.createElement("div");
    own.dataset.role = "resume";
    article.append(own);
    audio = document.querySelector("audio#player");
    ctl = fakeAudio(audio);
    unmount = mount(article);
    expect(article.querySelectorAll('[data-role="resume"]')).toHaveLength(1);
    expect(own.hidden).toBe(false);
    expect(own.querySelector("button")).not.toBeNull();
  });
});

describe("story-resume: autoplay", () => {
  it("plays from the saved position and skips the banner when ?autoplay=1", () => {
    write(SLUG, { audioTime: 120 });
    window.history.replaceState(null, "", "/?autoplay=1");
    mountPage();
    expect(audio.currentTime).toBe(120);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(area().hidden).toBe(true);
    expect(window.location.search).toBe(""); // param removed so a reload does not replay
  });

  it("starts a finished story from the beginning", () => {
    markCompleted(SLUG);
    window.history.replaceState(null, "", "/?autoplay=1");
    mountPage();
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalled();
  });

  it("keeps other query params", () => {
    window.history.replaceState(null, "", "/?autoplay=1&x=2#top");
    mountPage();
    expect(window.location.search).toBe("?x=2");
    expect(window.location.hash).toBe("#top");
  });

  it("shows a tap-to-play message when the browser blocks play()", async () => {
    window.history.replaceState(null, "", "/?autoplay=1");
    loadPage(storyPageHtml);
    audio = document.querySelector("audio#player");
    ctl = fakeAudio(audio);
    audio.play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    unmount = mount(document.querySelector('[data-mount="story-resume"]'));
    await vi.waitFor(() => expect(document.querySelector('[data-role="autoplay-fallback"]')).not.toBeNull());
    expect(area().hidden).toBe(false);
  });
});

describe("story-resume: stories:play", () => {
  function press(slug = SLUG) {
    const ev = new CustomEvent("stories:play", { detail: { slug }, cancelable: true });
    return { handled: !document.dispatchEvent(ev) };
  }

  it("claims the event for its own slug and plays from the saved position", () => {
    write(SLUG, { audioTime: 200 });
    mountPage();
    expect(press().handled).toBe(true);
    expect(audio.currentTime).toBe(200);
    expect(audio.play).toHaveBeenCalled();
  });

  it("ignores other slugs so another handler or navigation takes over", () => {
    mountPage();
    expect(press("other-world/lone-tale").handled).toBe(false);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("replays a finished story from 0 (completedAt kept)", () => {
    markCompleted(SLUG);
    mountPage();
    ctl.tick(0);
    press();
    expect(audio.currentTime).toBe(0);
    expect(read(SLUG).completedAt).toBe(NOW);
  });

  it("does not jump back when the listener has already moved the position", () => {
    write(SLUG, { audioTime: 200 });
    mountPage();
    audio.currentTime = 50;
    press();
    expect(audio.currentTime).toBe(50);
  });
});

describe("story-resume: saving progress", () => {
  it("saves every 5 seconds of playback, not on every timeupdate", () => {
    mountPage();
    audio.play();
    expect(read(SLUG)).toMatchObject({ audioTime: 0, playing: true });
    localStorage.clear();
    ctl.tick(2);
    expect(read(SLUG)).toBeNull();
    ctl.tick(6);
    expect(read(SLUG)).toMatchObject({ audioTime: 6, playing: true });
    ctl.tick(8);
    expect(read(SLUG).audioTime).toBe(6);
    ctl.tick(11.5);
    expect(read(SLUG).audioTime).toBe(11.5);
  });

  it("records pause with the position, and play", () => {
    mountPage();
    audio.play();
    expect(read(SLUG).playing).toBe(true);
    ctl.pauseAt(42);
    expect(read(SLUG)).toMatchObject({ audioTime: 42, playing: false });
  });

  it("never stores url, title or artwork", () => {
    mountPage();
    ctl.tick(30);
    expect(Object.keys(JSON.parse(localStorage.getItem(`story-progress:${SLUG}`))).sort())
      .toEqual(["audioTime", "playing", "savedAt", "scrollY", "v"]);
  });

  it("saves scroll position when the page is hidden, but does not create a record for an untouched page", () => {
    mountPage();
    window.dispatchEvent(new Event("pagehide"));
    expect(read(SLUG)).toBeNull();
    Object.defineProperty(window, "scrollY", { value: 640, configurable: true });
    window.dispatchEvent(new Event("pagehide"));
    expect(read(SLUG).scrollY).toBe(640);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("saves the playing position when backgrounded", () => {
    mountPage();
    audio.play();
    audio.currentTime = 77;
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(read(SLUG)).toMatchObject({ audioTime: 77, playing: true });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
});

describe("story-resume: finished rules", () => {
  it("sets completedAt and resets audioTime on ended", () => {
    mountPage();
    ctl.tick(300);
    ctl.end();
    expect(read(SLUG)).toEqual({
      v: 2, audioTime: 0, scrollY: 0, playing: false, savedAt: NOW, completedAt: NOW,
    });
  });

  it("a replay keeps completedAt and is in progress again only after 10s", () => {
    markCompleted(SLUG);
    mountPage();
    press();
    ctl.tick(6);
    expect(read(SLUG).completedAt).toBe(NOW);
    ctl.tick(12);
    expect(read(SLUG)).toMatchObject({ audioTime: 12, completedAt: NOW });
  });

  function press() {
    document.dispatchEvent(new CustomEvent("stories:play", { detail: { slug: SLUG }, cancelable: true }));
  }

  function foreground() {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("on foreground, finishes a story that reached within 10s of the real duration", () => {
    write(SLUG, { audioTime: 595, playing: true });
    mountPage({ duration: 600 }); // real duration 600 (library says 600 too)
    foreground();
    expect(read(SLUG)).toMatchObject({ audioTime: 0, completedAt: NOW, playing: false });
  });

  it("uses audio.duration, not the library value, for the 10s window", () => {
    // library says 600s but the real file is 700s: 595 is not near the end.
    write(SLUG, { audioTime: 595 });
    mountPage({ duration: 700 });
    foreground();
    expect(read(SLUG).completedAt).toBeUndefined();
    // and the other way: real file is 590s, so 585 counts.
    unmount();
    localStorage.clear();
    write(SLUG, { audioTime: 585 });
    mountPage({ duration: 590 });
    foreground();
    expect(read(SLUG).completedAt).toBe(NOW);
  });

  it("does not finish a story that is still playing on foreground", () => {
    mountPage();
    audio.play();
    ctl.tick(598); // saved at 598 while playing
    expect(read(SLUG).audioTime).toBe(598);
    foreground();
    expect(read(SLUG).completedAt).toBeUndefined();
  });

  it("does not finish when the real duration is not known yet, and does once metadata loads", () => {
    write(SLUG, { audioTime: 595 });
    mountPage({ duration: NaN });
    foreground();
    expect(read(SLUG).completedAt).toBeUndefined();
    ctl.setDuration(600);
    audio.dispatchEvent(new Event("loadedmetadata"));
    expect(read(SLUG).completedAt).toBe(NOW);
  });

  it("does not keep re-stamping completedAt on repeated foregrounds", () => {
    write(SLUG, { audioTime: 595 });
    mountPage();
    foreground();
    vi.setSystemTime(NOW + 60_000);
    foreground();
    window.dispatchEvent(new Event("pageshow"));
    expect(read(SLUG).completedAt).toBe(NOW);
  });

  it("does not finish a story that was only started", () => {
    write(SLUG, { audioTime: 120 });
    mountPage();
    foreground();
    expect(read(SLUG).completedAt).toBeUndefined();
  });

  it("Play after a paused near-the-end finish starts again from 0", () => {
    write(SLUG, { audioTime: 598 });
    mountPage();
    audio.currentTime = 598;
    foreground();
    press();
    expect(audio.currentTime).toBe(0);
  });
});

describe("story-resume: errors, Media Session, unmount", () => {
  it("shows a message and a working Try again when the audio fails", () => {
    mountPage();
    audio.dispatchEvent(new Event("error"));
    expect(document.querySelector('[data-role="audio-error"]')).not.toBeNull();
    click("retry-button");
    expect(audio.load).toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalled();
    expect(area().hidden).toBe(true);
  });

  it("sets Media Session metadata from library.json and clears it on unmount", async () => {
    const handlers = {};
    const session = { metadata: null, setActionHandler: vi.fn((name, fn) => { handlers[name] = fn; }) };
    vi.stubGlobal("MediaMetadata", class { constructor(init) { Object.assign(this, init); } });
    Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true });
    mountPage();
    await vi.waitFor(() => expect(session.metadata).not.toBeNull());
    expect(session.metadata.title).toBe("The First Tale of Testing");
    expect(session.metadata.artwork[0].src).toBe("/Stories/assets/app-icon-512.png");
    handlers.play();
    expect(audio.play).toHaveBeenCalled();
    audio.currentTime = 100;
    handlers.seekforward({ seekOffset: 30 });
    expect(audio.currentTime).toBe(130);
    handlers.seekbackward({});
    expect(audio.currentTime).toBe(120);
    unmount();
    expect(handlers.play).toBeNull();
    delete navigator.mediaSession;
  });

  it("removes its listeners and banner on unmount", () => {
    write(SLUG, { audioTime: 120 });
    mountPage();
    unmount();
    expect(document.querySelector('[data-role="resume"]')).toBeNull();
    ctl.tick(60);
    audio.dispatchEvent(new Event("ended"));
    expect(read(SLUG).completedAt).toBeUndefined();
    const ev = new CustomEvent("stories:play", { detail: { slug: SLUG }, cancelable: true });
    expect(document.dispatchEvent(ev)).toBe(true); // nobody claims it any more
  });

  it("works on a page with no audio element (reading only)", () => {
    loadPage(storyPageHtml);
    document.querySelector("audio#player").remove();
    write(SLUG, { scrollY: 900 });
    unmount = mount(document.querySelector('[data-mount="story-resume"]'));
    click("resume-button");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 900, behavior: "smooth" });
  });

  it("does nothing without a data-slug", () => {
    expect(() => mount(document.createElement("article"))()).not.toThrow();
  });
});

// The persistent audio can hold ANOTHER story than the page (dock next/previous,
// or the page was opened while a different story plays). The page must not drive
// or save that audio. Ownership follows audio.dataset.slug, checked on every event.
describe("story-resume: the audio holds a different story", () => {
  const OTHER = "test-world/second-tale";

  function holdOther() {
    audio.dataset.slug = OTHER;
  }

  it("does not save the other story's time, play or pause into this record", () => {
    mountPage();
    holdOther();
    audio.play();
    ctl.tick(30);
    ctl.pauseAt(31);
    expect(read(SLUG)).toBeNull();
  });

  it("does not mark this story finished when the other one ends or reconciles", () => {
    mountPage({ duration: 100 });
    holdOther();
    ctl.end();
    audio.dispatchEvent(new Event("loadedmetadata"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
    expect(read(SLUG)?.completedAt).toBeUndefined();
  });

  it("stops saving when the dock switches to another story after mount", () => {
    mountPage();
    audio.play();
    ctl.tick(6);
    expect(read(SLUG).audioTime).toBe(6);
    holdOther(); // dock Next
    ctl.tick(60);
    ctl.end();
    expect(read(SLUG).audioTime).toBe(6);
    expect(read(SLUG).completedAt).toBeUndefined();
  });

  it("does not write the other story's position on pagehide", () => {
    mountPage();
    holdOther();
    audio.play();
    ctl.tick(42);
    window.dispatchEvent(new Event("pagehide"));
    expect(read(SLUG)?.audioTime ?? 0).toBe(0);
  });

  it("shows no audio error for the other story's failure", () => {
    mountPage();
    holdOther();
    audio.dispatchEvent(new Event("error"));
    expect(document.querySelector('[data-role="audio-error"]')).toBeNull();
  });

  it("does not claim stories:play for its own slug (the player loads it instead)", () => {
    mountPage();
    holdOther();
    const ev = new CustomEvent("stories:play", { detail: { slug: SLUG }, cancelable: true });
    expect(document.dispatchEvent(ev)).toBe(true);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("does not autoplay the other story", () => {
    window.history.replaceState(null, "", "/?autoplay=1");
    loadPage(storyPageHtml);
    audio = document.querySelector("audio#player");
    audio.dataset.slug = OTHER;
    write(SLUG, { audioTime: 120 });
    ctl = fakeAudio(audio);
    unmount = mount(document.querySelector('[data-mount="story-resume"]'));
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.currentTime).toBe(0);
  });

  it("Resume and Start over work once the page's story has been loaded into the audio", () => {
    write(SLUG, { audioTime: 120, scrollY: 800 });
    loadPage(storyPageHtml);
    audio = document.querySelector("audio#player");
    audio.dataset.slug = OTHER; // mounted while another story plays
    ctl = fakeAudio(audio);
    unmount = mount(document.querySelector('[data-mount="story-resume"]'));
    audio.dataset.slug = SLUG; // the Play button then loaded this page's story
    click("resume-button");
    expect(audio.currentTime).toBe(120);
    unmount();
    audio.dataset.slug = OTHER;
    unmount = mount(document.querySelector('[data-mount="story-resume"]'));
    audio.dataset.slug = SLUG;
    click("restart-button");
    expect(audio.currentTime).toBe(0);
  });

  it("Resume does not seek the other story's audio", () => {
    write(SLUG, { audioTime: 120, scrollY: 800 });
    loadPage(storyPageHtml);
    audio = document.querySelector("audio#player");
    audio.dataset.slug = OTHER;
    ctl = fakeAudio(audio);
    audio.currentTime = 33;
    unmount = mount(document.querySelector('[data-mount="story-resume"]'));
    click("resume-button");
    expect(audio.currentTime).toBe(33);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "smooth" });
  });

  it("finds the shell audio by data-role even without id=player", () => {
    loadPage(storyPageHtml);
    audio = document.querySelector("audio");
    audio.removeAttribute("id");
    ctl = fakeAudio(audio);
    unmount = mount(document.querySelector('[data-mount="story-resume"]'));
    audio.play();
    expect(read(SLUG)).toMatchObject({ playing: true });
  });
});

describe("story-resume: Media Session", () => {
  it("does not set Media Session for a page whose story is not the one loaded", async () => {
    const setActionHandler = vi.fn();
    vi.stubGlobal("MediaMetadata", class { constructor(init) { Object.assign(this, init); } });
    Object.defineProperty(navigator, "mediaSession", { value: { setActionHandler, metadata: null }, configurable: true });
    mountPage();
    audio.dataset.slug = "test-world/second-tale";
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 5));
    expect(setActionHandler).not.toHaveBeenCalled();
    delete navigator.mediaSession;
  });
});

// The page's Resume / Start over / Play on a story that is already loaded: each must act.
describe("story-resume: Play on audio that is already loaded", () => {
  const stories = () => document.querySelector('[data-mount="story-resume"]');
  const press = () => document.dispatchEvent(new CustomEvent("stories:play", { detail: { slug: SLUG }, cancelable: true }));

  it("Resume where you left off seeks to the saved place and plays", () => {
    write(SLUG, { audioTime: 120, scrollY: 800 });
    mountPage();
    click("resume-button");
    expect(audio.currentTime).toBe(120);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("Start over goes to 0 and plays, also while the story is already playing", () => {
    write(SLUG, { audioTime: 120, scrollY: 800 });
    mountPage();
    audio.play();
    ctl.tick(200);
    audio.play.mockClear();
    click("restart-button");
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("Resume while the story plays elsewhere in the clip jumps to the saved place and keeps playing", () => {
    write(SLUG, { audioTime: 120, scrollY: 800 });
    mountPage();
    audio.play();
    ctl.tick(300);
    click("resume-button");
    expect(audio.currentTime).toBe(120);
    expect(audio.paused).toBe(false);
  });

  it("Resume and Start over ask the player for this story while another one holds the audio", () => {
    write(SLUG, { audioTime: 120, scrollY: 800 });
    loadPage(storyPageHtml);
    audio = document.querySelector("audio#player");
    audio.dataset.slug = "test-world/second-tale";
    ctl = fakeAudio(audio);
    unmount = mount(stories());
    const asked = [];
    const listener = (event) => asked.push(event.detail.slug);
    document.addEventListener("stories:play", listener);
    click("resume-button");
    expect(asked).toEqual([SLUG]);
    expect(audio.play).not.toHaveBeenCalled(); // the player loads it, not this page
    document.removeEventListener("stories:play", listener);
  });

  it("Play on a paused finished story starts again from 0, even part-way in", () => {
    markCompleted(SLUG);
    mountPage();
    audio.currentTime = 200;
    press();
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("Play on a story that has ended starts it again", () => {
    mountPage({ duration: 100 });
    audio.play();
    ctl.end();
    audio.play.mockClear();
    press();
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("Play on a paused story carries on from where it is", () => {
    mountPage();
    audio.play();
    ctl.pauseAt(90);
    audio.play.mockClear();
    press();
    expect(audio.currentTime).toBe(90);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("a Play request for the story that is already playing changes nothing", () => {
    mountPage();
    audio.play();
    ctl.tick(90);
    audio.play.mockClear();
    press();
    expect(audio.currentTime).toBe(90);
    expect(audio.play).not.toHaveBeenCalled();
  });
});
