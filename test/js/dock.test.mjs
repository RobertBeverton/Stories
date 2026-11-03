// @vitest-environment jsdom
// The dock (mini player, player sheet), the persistent player and Media Session,
// with a controllable stand-in on the real <audio> element.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTime, mount, spokenTime } from "../../site/assets/js/dock.mjs";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { neighbours, playableUrl } from "../../site/assets/js/player.mjs";
import { read } from "../../site/assets/js/progress.mjs";
import { startRouter } from "../../site/assets/js/router.mjs";
import * as storyResume from "../../site/assets/js/story-resume.mjs";
import { fakeAudio, library, progressV2, seed, stubLibraryFetch, tick, useFixedNow } from "./helpers.mjs";

const [A, B, C] = library.stories.map((s) => s.slug); // A and B share a series; C stands alone
const urlOf = (slug) => `https://audio.example/${slug}.mp3`;
const storyOf = (slug) => library.stories.find((s) => s.slug === slug);

function playButton(slug) {
  return `<button type="button" data-mount="play-button" data-slug="${slug}" data-audio-url="${urlOf(slug)}">Play</button>`;
}
function dockHtml() {
  return `<div class="dock" data-mount="dock"><div class="dock-mini" data-dock-slot="mini"></div>
    <nav aria-label="Main"><a href="/Stories/">Home</a><a href="/Stories/library/">Library</a></nav></div>`;
}
/** A page body: a library-like view with rows for A and B (and optionally a story article). */
function pageHtml({ article = null, rows = [A, B], bound = null } = {}) {
  const audioAttrs = bound ? ` data-slug="${bound}" src="${urlOf(bound)}"` : "";
  return `<main id="view"><h1>Page</h1>${article ? `<article data-mount="story-resume" data-slug="${article}" data-audio-url="${urlOf(article)}"><h1>Story</h1></article>` : ""}
    ${rows.map(playButton).join("")}<a id="x" href="/Stories/library/">x</a></main>
    <audio id="player" data-role="shell-audio"${audioAttrs}></audio>${dockHtml()}`;
}

let audio;
let fake;
let unmount;
let session;
let handlers;
let metadataWrites;

async function setup(options = {}) {
  document.body.innerHTML = pageHtml(options);
  audio = document.querySelector("audio");
  fake = fakeAudio(audio, { duration: 600 });
  unmount = mount(document.querySelector('[data-mount="dock"]'));
  await tick(); // library.json resolves
  await tick();
}
const dock = () => document.querySelector('[data-mount="dock"]');
const q = (role) => document.querySelector(`[data-role="${role}"]`);
const mini = () => document.querySelector('[data-dock-slot="mini"]');
/** Finishes loading a new source (the shell ignores events until then). */
const loaded = () => audio.dispatchEvent(new Event("loadedmetadata"));
// What the play-button module does on a click (it is not mounted in these tests).
const dispatchPlay = (slug) => {
  const event = new CustomEvent("stories:play", { detail: { slug }, cancelable: true });
  document.dispatchEvent(event);
  return event;
};
const clickPlay = dispatchPlay;

beforeEach(async () => {
  localStorage.clear();
  resetLibrary();
  useFixedNow();
  stubLibraryFetch();
  document.documentElement.dataset.base = "/Stories";
  metadataWrites = [];
  handlers = {};
  session = {
    set metadata(value) { metadataWrites.push(value); },
    get metadata() { return metadataWrites.at(-1) ?? null; },
    setActionHandler: vi.fn((name, fn) => { handlers[name] = fn; }),
    setPositionState: vi.fn(),
  };
  Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true });
  vi.stubGlobal("MediaMetadata", class { constructor(init) { Object.assign(this, init); } });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  unmount?.();
  unmount = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  delete navigator.mediaSession;
});

describe("helpers", () => {
  it("formats and speaks times", async () => {
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(formatTime(NaN)).toBe("0:00");
    expect(spokenTime(125)).toBe("2 minutes 5 seconds");
    expect(spokenTime(3601)).toBe("1 hour 1 second");
    expect(spokenTime(0)).toBe("0 seconds");
  });
  it("accepts only https or same-origin audio URLs", async () => {
    expect(playableUrl("https://audio.example/a.mp3")).toBe("https://audio.example/a.mp3");
    expect(playableUrl("/Stories/a.mp3")).toBe(`${location.origin}/Stories/a.mp3`);
    expect(playableUrl("javascript:alert(1)")).toBeNull();
    expect(playableUrl("http://evil.example/a.mp3")).toBeNull();
    expect(playableUrl("data:audio/mp3;base64,AAAA")).toBeNull();
  });
  it("finds series neighbours by order", async () => {
    const lib = { stories: library.stories, bySlug: new Map(library.stories.map((s) => [s.slug, s])) };
    expect(neighbours(lib, A)).toEqual({ prev: null, next: B });
    expect(neighbours(lib, B)).toEqual({ prev: A, next: null });
    expect(neighbours(lib, C)).toEqual({ prev: null, next: null });
    expect(neighbours(lib, "nope")).toEqual({ prev: null, next: null });
  });
});

describe("mini player", () => {
  it("stays hidden until something is started, even when the page's audio is already bound", async () => {
    await setup({ article: A, bound: A });
    expect(mini().hidden).toBe(true);
    expect(document.body.classList.contains("has-mini-player")).toBe(false);
  });

  it("a Play button claims stories:play, loads that story in place, plays it and shows the row", async () => {
    await setup();
    const event = dispatchPlay(B);
    expect(event.defaultPrevented).toBe(true);
    expect(audio.dataset.slug).toBe(B);
    expect(audio.src).toBe(urlOf(B));
    expect(audio.play).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(mini().hidden).toBe(false));
    expect(q("mini-title").textContent).toBe(storyOf(B).title);
    expect(document.body.classList.contains("has-mini-player")).toBe(true);
    expect(q("mini-toggle").getAttribute("aria-label")).toBe(`Pause ${storyOf(B).title}`);
  });

  it("leaves stories:play alone when it cannot find the audio (the button then navigates)", async () => {
    await setup({ rows: [A] });
    expect(dispatchPlay(B).defaultPrevented).toBe(false);
    expect(audio.dataset.slug).toBeUndefined();
  });

  it("on a story's own page it defers to story-resume, which holds the same element", async () => {
    await setup({ article: A, bound: A });
    audio.id = "player";
    expect(dispatchPlay(A).defaultPrevented).toBe(false);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("the toggle pauses and resumes, and the label follows", async () => {
    await setup();
    clickPlay(B);
    await vi.waitFor(() => expect(mini().hidden).toBe(false));
    q("mini-toggle").click();
    expect(audio.pause).toHaveBeenCalled();
    expect(q("mini-toggle").getAttribute("aria-label")).toBe(`Play ${storyOf(B).title}`);
    q("mini-toggle").click();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(q("mini-toggle").getAttribute("aria-label")).toBe(`Pause ${storyOf(B).title}`);
  });

  it("pressing a Play button for the story already playing does not restart it", async () => {
    await setup();
    clickPlay(B);
    loaded();
    fake.tick(42);
    clickPlay(B);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBe(42);
  });

  it("resumes an in-progress story where it left off, once the new source has loaded", async () => {
    seed(progressV2);
    await setup();
    clickPlay(A);
    expect(audio.currentTime).toBe(0);
    loaded();
    expect(audio.currentTime).toBe(300);
  });

  it("plays a finished story again from the start", async () => {
    seed(progressV2);
    await setup();
    clickPlay(B);
    loaded();
    expect(audio.currentTime).toBe(0);
  });

  it("shows 'Play again' at the end", async () => {
    await setup();
    clickPlay(B);
    loaded();
    fake.end();
    expect(q("mini-toggle").getAttribute("aria-label")).toBe(`Play again ${storyOf(B).title}`);
  });
});

describe("progress", () => {
  it("saves a v2 record on pause, and does not clobber a saved position while a new source loads", async () => {
    seed(progressV2);
    const events = [];
    document.addEventListener("stories:progress", (e) => events.push(e.detail.slug));
    await setup();
    clickPlay(A);
    // Before metadata: a stray pause (the old source being torn down) must not write 0 over 300.
    fake.pauseAt(0);
    expect(read(A).audioTime).toBe(300);
    loaded();
    fake.pauseAt(310);
    expect(read(A)).toMatchObject({ v: 2, audioTime: 310, playing: false });
    expect(events).toContain(A);
  });

  it("saves every five seconds of playing", async () => {
    await setup();
    clickPlay(B);
    loaded();
    fake.tick(2);
    expect(read(B)?.audioTime ?? 0).toBe(0);
    fake.tick(6);
    expect(read(B).audioTime).toBe(6);
    expect(read(B).playing).toBe(true);
  });

  it("marks the story finished on ended", async () => {
    await setup();
    clickPlay(B);
    loaded();
    fake.end();
    expect(read(B).completedAt).toBeGreaterThan(0);
    expect(read(B).audioTime).toBe(0);
  });

  it("saves the position of the old story when another one is loaded", async () => {
    await setup();
    clickPlay(A);
    loaded();
    fake.tick(77);
    clickPlay(B);
    expect(read(A).audioTime).toBe(77);
    expect(read(A).playing).toBe(false);
  });

  it("saves the position when the page is hidden while playing", async () => {
    await setup();
    clickPlay(B);
    loaded();
    audio.currentTime = 123;
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(read(B).audioTime).toBe(123);
  });

  it("finishes a story whose ended event was never seen, on return to the foreground", async () => {
    await setup();
    clickPlay(B);
    loaded();
    fake.pauseAt(595); // within 10 s of the real 600 s duration
    expect(read(B).completedAt).toBeUndefined();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(read(B).completedAt).toBeGreaterThan(0);
  });
});

describe("player sheet", () => {
  async function openSheet() {
    await setup();
    clickPlay(B);
    loaded();
    await vi.waitFor(() => expect(mini().hidden).toBe(false));
    q("open-player").focus();
    q("open-player").click();
  }

  it("opens as a labelled modal dialog with focus on Close, and the page behind it inert", async () => {
    await openSheet();
    const sheet = q("player-sheet");
    expect(sheet.hidden).toBe(false);
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(sheet.getAttribute("aria-labelledby")).textContent).toBe(storyOf(B).title);
    expect(document.activeElement).toBe(q("close"));
    expect(q("open-player").getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("view").hasAttribute("inert")).toBe(true);
    expect(mini().hasAttribute("inert")).toBe(true);
    expect(sheet.hasAttribute("inert")).toBe(false);
    expect(q("world").textContent).toBe("Test World");
    expect(q("story-link").getAttribute("href")).toBe(storyOf(B).url);
  });

  it("Escape closes it, returns focus to the opener and removes inert", async () => {
    await openSheet();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(q("player-sheet").hidden).toBe(true);
    expect(document.activeElement).toBe(q("open-player"));
    expect(q("open-player").getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("view").hasAttribute("inert")).toBe(false);
  });

  it("the Close button closes it too", async () => {
    await openSheet();
    q("close").click();
    expect(q("player-sheet").hidden).toBe(true);
    expect(document.activeElement).toBe(q("open-player"));
  });

  it("traps Tab: from the last control it wraps to the first, and Shift+Tab goes the other way", async () => {
    await openSheet();
    const items = [...q("player-sheet").querySelectorAll('button:not([disabled]), a[href], input:not([disabled])')]
      .filter((node) => !node.hidden && !node.closest("[hidden]"));
    const first = items[0];
    const last = items.at(-1);
    expect(first).toBe(q("close"));
    last.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    // In the middle Tab is left to the browser.
    items[2].focus();
    const middle = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false);
  });

  it("seek: a native range input with a spoken value that drives the audio", async () => {
    await openSheet();
    const seek = q("seek");
    expect(seek.type).toBe("range");
    expect(seek.max).toBe("600");
    seek.value = "125";
    seek.dispatchEvent(new Event("input", { bubbles: true }));
    expect(audio.currentTime).toBe(125);
    seek.dispatchEvent(new Event("change", { bubbles: true }));
    fake.tick(130);
    expect(seek.value).toBe("130");
    expect(seek.getAttribute("aria-valuetext")).toBe("2 minutes 10 seconds of 10 minutes");
    expect(q("elapsed").textContent).toBe("2:10");
    expect(q("remaining").textContent).toBe("-7:50");
  });

  it("does not fight the slider while it is being dragged", async () => {
    await openSheet();
    const seek = q("seek");
    seek.value = "50";
    seek.dispatchEvent(new Event("input", { bubbles: true }));
    fake.tick(200);
    expect(seek.value).toBe("50");
  });

  it("skips 15 seconds back and forward and clamps at both ends", async () => {
    await openSheet();
    fake.tick(10);
    q("back").click();
    expect(audio.currentTime).toBe(0);
    q("forward").click();
    expect(audio.currentTime).toBe(15);
    fake.tick(595);
    q("forward").click();
    expect(audio.currentTime).toBe(600);
    expect(q("back").getAttribute("aria-label")).toBe("Back 15 seconds");
    expect(q("forward").getAttribute("aria-label")).toBe("Forward 15 seconds");
  });

  it("play/pause in the sheet is labelled with the story", async () => {
    await openSheet();
    expect(q("play").getAttribute("aria-label")).toBe(`Pause ${storyOf(B).title}`);
    q("play").click();
    expect(audio.pause).toHaveBeenCalled();
    expect(q("play").getAttribute("aria-label")).toBe(`Play ${storyOf(B).title}`);
  });

  it("speed cycles through the choices, is announced, remembered and applied to the next source", async () => {
    await openSheet();
    expect(q("speed").textContent).toBe("1×");
    q("speed").click();
    expect(audio.playbackRate).toBe(1.25);
    expect(audio.defaultPlaybackRate).toBe(1.25);
    expect(q("speed").textContent).toBe("1.25×");
    expect(localStorage.getItem("stories-speed")).toBe("1.25");
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    q("speed").click();
    vi.advanceTimersByTime(100);
    expect(q("dock-announcer").textContent).toBe("Speed 1.5×");
    for (let i = 0; i < 2; i++) q("speed").click(); // 0.75, then 1
    expect(audio.playbackRate).toBe(1);
  });

  it("restores a remembered speed on mount", async () => {
    localStorage.setItem("stories-speed", "1.5");
    await setup();
    expect(audio.playbackRate).toBe(1.5);
    expect(audio.defaultPlaybackRate).toBe(1.5);
  });

  it("sleep timer: choosing a time starts it, shows it pressed with the time left, and Off stops it", async () => {
    await openSheet();
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearInterval", "clearTimeout", "Date"] });
    q("close").click(); // reopen so the countdown ticker runs on the fake timers
    q("open-player").click();
    const fifteen = document.querySelector('[data-role="sleep"][data-minutes="15"]');
    fifteen.click();
    expect(fifteen.getAttribute("aria-pressed")).toBe("true");
    expect(q("sleep-off").getAttribute("aria-pressed")).toBe("false");
    expect(q("sleep-status").textContent).toBe("Sleep timer: about 15 minutes left");
    vi.advanceTimersByTime(100);
    expect(q("dock-announcer").textContent).toBe("Sleep timer set for 15 minutes");
    vi.advanceTimersByTime(5 * 60_000);
    expect(q("sleep-status").textContent).toBe("Sleep timer: about 10 minutes left");
    q("sleep-off").click();
    expect(q("sleep-off").getAttribute("aria-pressed")).toBe("true");
    expect(fifteen.getAttribute("aria-pressed")).toBe("false");
    expect(q("sleep-status").textContent).toBe("");
    vi.advanceTimersByTime(100);
    expect(q("dock-announcer").textContent).toBe("Sleep timer off");
  });

  it("sleep timer: it pauses the audio when the time is up", async () => {
    await openSheet();
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearInterval", "clearTimeout", "Date"] });
    q("close").click(); // reopen so the countdown ticker runs on the fake timers
    q("open-player").click();
    document.querySelector('[data-role="sleep"][data-minutes="10"]').click();
    vi.advanceTimersByTime(10 * 60_000 + 1000);
    expect(audio.pause).toHaveBeenCalled();
    expect(q("sleep-off").getAttribute("aria-pressed")).toBe("true");
  });

  it("shows an error with a retry when the audio fails", async () => {
    await openSheet();
    expect(q("error").hidden).toBe(true);
    audio.dispatchEvent(new Event("error"));
    expect(q("error").hidden).toBe(false);
    q("retry").click();
    expect(audio.load).toHaveBeenCalled();
    expect(q("error").hidden).toBe(true);
  });

  it("following the story link closes the sheet without stealing focus back", async () => {
    await openSheet();
    q("story-link").addEventListener("click", (e) => e.preventDefault());
    q("story-link").click();
    expect(q("player-sheet").hidden).toBe(true);
    expect(document.activeElement).not.toBe(q("open-player"));
  });

  it("hides Next when there is no next story", async () => {
    await openSheet(); // B is last in its series
    expect(q("next").hidden).toBe(true);
  });
});

describe("Media Session", () => {
  it("sets metadata with the world as artist and real-URL artwork, and every handler", async () => {
    await setup();
    clickPlay(A);
    loaded();
    await vi.waitFor(() => expect(session.metadata?.title).toBe(storyOf(A).title));
    expect(session.metadata.artist).toBe("Test World");
    expect(session.metadata.album).toBe("The Test Series");
    expect(session.metadata.artwork.length).toBeGreaterThan(0);
    for (const art of session.metadata.artwork) {
      expect(art.src).toMatch(/^http:\/\/localhost:3000\/Stories\/assets\/app-icon-\d+\.png$/);
    }
    for (const name of ["play", "pause", "seekto", "seekbackward", "seekforward", "previoustrack", "nexttrack"]) {
      expect(typeof handlers[name]).toBe("function");
    }
  });

  it("assigns a FRESH MediaMetadata again when playing starts (Firefox Android lock-screen title)", async () => {
    await setup();
    clickPlay(A);
    loaded();
    await vi.waitFor(() => expect(session.metadata).not.toBeNull());
    const before = session.metadata;
    const writes = metadataWrites.length;
    audio.dispatchEvent(new Event("playing"));
    expect(metadataWrites.length).toBeGreaterThan(writes);
    expect(session.metadata).not.toBe(before);
    expect(session.metadata.title).toBe(before.title);
  });

  it("play, pause, seekto and the skip handlers drive the audio", async () => {
    await setup();
    clickPlay(A);
    loaded();
    await vi.waitFor(() => expect(handlers.seekto).toBeDefined());
    handlers.seekto({ seekTime: 200 });
    expect(audio.currentTime).toBe(200);
    handlers.seekbackward({});
    expect(audio.currentTime).toBe(185);
    handlers.seekforward({ seekOffset: 30 });
    expect(audio.currentTime).toBe(215);
    handlers.pause();
    expect(audio.pause).toHaveBeenCalled();
    audio.play.mockClear();
    handlers.play();
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("reports position state for the lock-screen scrubber", async () => {
    await setup();
    clickPlay(A);
    loaded();
    audio.dispatchEvent(new Event("playing"));
    await vi.waitFor(() => expect(session.setPositionState).toHaveBeenCalled());
    expect(session.setPositionState).toHaveBeenLastCalledWith({ duration: 600, playbackRate: 1, position: 0 });
  });

  it("nexttrack loads the next story in the series and plays it; there is none after the last", async () => {
    await setup();
    clickPlay(A);
    loaded();
    await vi.waitFor(() => expect(typeof handlers.nexttrack).toBe("function"));
    handlers.nexttrack();
    await vi.waitFor(() => expect(audio.dataset.slug).toBe(B));
    expect(audio.src).toBe(urlOf(B));
    expect(audio.play).toHaveBeenCalledTimes(2);
    loaded();
    audio.dispatchEvent(new Event("playing"));
    await vi.waitFor(() => expect(handlers.nexttrack).toBeNull());
    expect(session.metadata.title).toBe(storyOf(B).title);
  });

  it("nexttrack finds the audio URL by fetching the next story's page when it is not on screen", async () => {
    await setup({ rows: [A] });
    const nextPage = `<html><body><main id="view"><article data-slug="${B}" data-audio-url="${urlOf(B)}"></article></main></body></html>`;
    const base = stubLibraryFetch();
    const impl = base.getMockImplementation();
    base.mockImplementation(async (url, ...rest) => (String(url).endsWith(`${storyOf(B).url}`)
      ? { ok: true, status: 200, text: async () => nextPage }
      : impl(url, ...rest)));
    resetLibrary();
    clickPlay(A);
    loaded();
    await vi.waitFor(() => expect(typeof handlers.nexttrack).toBe("function"));
    // Starting playback prefetched the neighbour's URL, so Next can swap at once, even while hidden.
    audio.dispatchEvent(new Event("playing"));
    await vi.waitFor(() => expect(base.mock.calls.some(([u]) => String(u).endsWith(storyOf(B).url))).toBe(true));
    await tick();
    handlers.nexttrack();
    await vi.waitFor(() => expect(audio.dataset.slug).toBe(B));
  });

  it("previoustrack restarts a story that is well under way, and otherwise goes to the previous story", async () => {
    await setup();
    clickPlay(B);
    loaded();
    await vi.waitFor(() => expect(typeof handlers.previoustrack).toBe("function"));
    fake.tick(100);
    handlers.previoustrack();
    expect(audio.currentTime).toBe(0);
    expect(audio.dataset.slug).toBe(B);
    handlers.previoustrack();
    await vi.waitFor(() => expect(audio.dataset.slug).toBe(A));
  });

  it("clears the handlers when the dock unmounts", async () => {
    await setup();
    clickPlay(A);
    loaded();
    await vi.waitFor(() => expect(handlers.play).toBeDefined());
    unmount();
    unmount = null;
    expect(handlers.play).toBeNull();
    expect(handlers.nexttrack).toBeNull();
  });

  it("does nothing, and does not throw, in a browser without Media Session", async () => {
    delete navigator.mediaSession;
    await setup();
    expect(() => {
      clickPlay(B);
      loaded();
    }).not.toThrow();
  });
});

describe("with the router", () => {
  const BUILD = "7";
  let router;
  const storyPage = (slug) => `<!doctype html><html><head><title>${slug}</title><meta name="build-id" content="${BUILD}"></head><body>
    <main id="view"><article data-mount="story-resume" data-slug="${slug}" data-audio-url="${urlOf(slug)}"><h1>${slug}</h1></article></main></body></html>`;

  beforeEach(() => {
    const meta = document.createElement("meta");
    meta.name = "build-id";
    meta.content = BUILD;
    document.head.append(meta);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    window.history.replaceState(null, "", "/Stories/library/");
  });
  afterEach(() => {
    router?.stop();
    router = null;
    document.head.replaceChildren();
    window.history.replaceState(null, "", "/");
  });

  async function visit(slug, query = "") {
    const page = storyPage(slug);
    const original = fetch;
    vi.stubGlobal("fetch", vi.fn(async (href) => (String(href).includes("/stories/")
      ? { ok: true, status: 200, url: String(href), headers: { get: () => "text/html" }, text: async () => page }
      : original(href))));
    await router.navigate(`/Stories/stories/${slug}/${query}`);
  }

  it("keeps the same <audio> element and its playback across a swap; the page's modules follow the slug, not an id", async () => {
    await setup();
    router = startRouter({ mountAll: async () => {}, unmountAll() {} });
    const element = audio;
    clickPlay(A);
    loaded();
    fake.tick(30);
    await visit(B);
    expect(document.querySelector("audio")).toBe(element);
    expect(audio.dataset.slug).toBe(A); // still playing A
    expect(audio.id).toBe("player"); // the id is permanent; story-resume on B's page checks the slug instead
    expect(audio.pause).not.toHaveBeenCalled();
    await visit(A);
    expect(audio.id).toBe("player");
  });

  /** The router with the real story-resume module mounted on each swapped story page. */
  const resumeMounts = [];
  function startRouterWithResume() {
    router = startRouter({
      mountAll: async (root) => {
        for (const el of root.querySelectorAll('[data-mount="story-resume"]')) resumeMounts.push(storyResume.mount(el));
      },
      unmountAll() {
        while (resumeMounts.length) resumeMounts.pop()();
      },
    });
  }
  afterEach(() => {
    while (resumeMounts.length) resumeMounts.pop()();
  });

  it("Play on another story's page while A plays: the page's story-resume follows B once it is loaded, and A's record is never touched", async () => {
    await setup();
    startRouterWithResume();
    clickPlay(A);
    loaded();
    fake.tick(30);
    await visit(B); // story-resume mounts while A holds the audio
    fake.tick(90); // A keeps playing (the player saves A); B's page must not save anything
    expect(read(B)).toBeNull();
    expect(read(A).audioTime).toBe(90);
    expect(dispatchPlay(B).defaultPrevented).toBe(true); // the player claims it, loading B
    expect(audio.dataset.slug).toBe(B);
    loaded();
    fake.tick(6);
    expect(read(B)).toMatchObject({ audioTime: 6, playing: true }); // story-resume (and the player) now save B
    expect(read(A).audioTime).toBe(90);
    document.dispatchEvent(new Event("visibilitychange"));
    fake.end();
    expect(read(B).completedAt).toBeDefined();
    expect(read(A).completedAt).toBeUndefined();
  });

  it("dock Next from A's page: A's record keeps its place and is not finished when B ends", async () => {
    await setup();
    startRouterWithResume();
    clickPlay(A); // from the rows on screen: caches both URLs
    loaded();
    audio.dispatchEvent(new Event("playing")); // prefetches B's URL
    await tick();
    await visit(A);
    fake.tick(12);
    await vi.waitFor(() => expect(typeof handlers.nexttrack).toBe("function"));
    handlers.nexttrack();
    await vi.waitFor(() => expect(audio.dataset.slug).toBe(B));
    loaded();
    fake.tick(100);
    fake.tick(200);
    expect(read(A).audioTime).toBe(12);
    expect(read(B).audioTime).toBe(200);
    fake.end();
    expect(read(B).completedAt).toBeDefined();
    expect(read(A).completedAt).toBeUndefined();
  });

  it("binds the audio to a story page when nothing has been started yet", async () => {
    await setup();
    router = startRouter({ mountAll: async () => {}, unmountAll() {} });
    await visit(B);
    expect(audio.dataset.slug).toBe(B);
    expect(audio.src).toBe(urlOf(B));
    expect(audio.id).toBe("player");
    expect(mini().hidden).toBe(true); // bound, but not started: no mini player yet
  });

  it("switches to the story when a link arrives with ?autoplay=1, even while another is playing", async () => {
    await setup();
    router = startRouter({ mountAll: async () => {}, unmountAll() {} });
    clickPlay(A);
    loaded();
    fake.tick(30);
    await visit(B, "?autoplay=1");
    expect(audio.dataset.slug).toBe(B);
    expect(audio.id).toBe("player");
    expect(read(A).audioTime).toBe(30); // the old story's place was saved
  });

  it("arriving with ?autoplay=1 at the story already playing saves the live position, so it does not jump back", async () => {
    await setup();
    router = startRouter({ mountAll: async () => {}, unmountAll() {} });
    clickPlay(A);
    loaded();
    fake.tick(3); // under the 5 s save interval: the stored position is stale
    expect(read(A)?.audioTime ?? 0).toBe(0);
    await visit(A, "?autoplay=1");
    expect(read(A).audioTime).toBe(3);
    expect(audio.id).toBe("player");
  });

  it("re-asserts the Media Session handlers after a swap (a page module may have cleared them)", async () => {
    await setup();
    router = startRouter({ mountAll: async () => {}, unmountAll() {} });
    clickPlay(A);
    loaded();
    await vi.waitFor(() => expect(handlers.pause).toBeDefined());
    handlers.pause = null; // what story-resume's unmount does
    handlers.seekforward = null;
    await visit(B);
    expect(typeof handlers.pause).toBe("function");
    expect(typeof handlers.seekforward).toBe("function");
  });

  it("closes an open sheet before the new page mounts", async () => {
    await setup();
    router = startRouter({ mountAll: async () => {}, unmountAll() {} });
    clickPlay(A);
    loaded();
    await vi.waitFor(() => expect(mini().hidden).toBe(false));
    q("open-player").click();
    await visit(B);
    expect(q("player-sheet").hidden).toBe(true);
    expect(document.getElementById("view").hasAttribute("inert")).toBe(false);
  });
});

describe("unmount", () => {
  it("removes everything it added and stops claiming stories:play", async () => {
    await setup();
    clickPlay(B);
    await vi.waitFor(() => expect(mini().hidden).toBe(false));
    unmount();
    unmount = null;
    expect(q("player-sheet")).toBeNull();
    expect(q("dock-announcer")).toBeNull();
    expect(mini().children).toHaveLength(0);
    expect(document.body.classList.contains("has-mini-player")).toBe(false);
    expect(dispatchPlay(A).defaultPrevented).toBe(false);
  });

  it("a page without the shell's audio element mounts to nothing", async () => {
    document.body.innerHTML = `<main id="view"></main>${dockHtml()}`;
    const off = mount(dock());
    expect(mini().children).toHaveLength(0);
    off();
  });

  it("is reachable: dock without a story keeps mini hidden and has an announcer for the live region only on demand", async () => {
    await setup();
    expect(q("dock-announcer").getAttribute("aria-live")).toBe("polite");
    expect(q("dock-announcer").textContent).toBe("");
  });
});
