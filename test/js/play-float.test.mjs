// @vitest-environment jsdom
// The floating Play pill on the story page: it shows only while the page's own
// Play button is out of sight and the story is not playing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { mount as mountPlayButton } from "../../site/assets/js/play-button.mjs";
import { mount as mountFloat } from "../../site/assets/js/play-float.mjs";
import { fakeAudio, loadPage, stubLibraryFetch, tick } from "./helpers.mjs";

const SLUG = "test-world/first-tale";
let audio;
let observe; // calls the IntersectionObserver callback: observe(true) means the page's button is in view
let unmounts;

class FakeObserver {
  constructor(callback) {
    observe = (isIntersecting) => callback([{ isIntersecting }]);
  }
  observe() {}
  disconnect() {}
}

async function open({ slug = SLUG, withButton = true } = {}) {
  loadPage(`<html data-base="/Stories"><body>
    <main id="view"><article>
      ${withButton ? `<button type="button" data-mount="play-button" data-pause-when-playing data-slug="${slug}"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><span data-role="label">Play</span></button>` : ""}
      <div data-mount="play-float" data-slug="${slug}" data-title="The First Tale"></div>
    </article></main>
    <audio data-role="shell-audio"></audio></body></html>`);
  audio = document.querySelector("audio");
  fakeAudio(audio, { duration: 600 });
  const button = document.querySelector('[data-mount="play-button"]');
  const host = document.querySelector('[data-mount="play-float"]');
  unmounts = [button && mountPlayButton(button), mountFloat(host)].filter(Boolean);
  await tick();
  return { button, host, pill: () => host.querySelector('[data-role="play-float"]') };
}

beforeEach(() => {
  localStorage.clear();
  resetLibrary();
  stubLibraryFetch();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => {
  for (const un of unmounts ?? []) un();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("play-float", () => {
  it("is hidden while the page's Play button is in reach, and shows once it scrolls away", async () => {
    const { pill } = await open();
    expect(pill().hidden).toBe(true);
    observe(false);
    expect(pill().hidden).toBe(false);
    expect(pill().getAttribute("aria-label")).toBe("Play The First Tale");
    observe(true);
    expect(pill().hidden).toBe(true);
  });

  it("a press clicks the page's own Play button, which asks the player to play this story", async () => {
    const { pill } = await open();
    observe(false);
    const asked = [];
    document.addEventListener("stories:play", (e) => { asked.push(e.detail.slug); e.preventDefault(); });
    pill().click();
    expect(asked).toEqual([SLUG]);
  });

  it("goes away while this story plays, and comes back on a pause as Resume", async () => {
    const { pill } = await open();
    observe(false);
    audio.dataset.slug = SLUG;
    audio.play();
    expect(pill().hidden).toBe(true);
    audio.pause();
    expect(pill().hidden).toBe(false);
  });

  it("stays shown while a different story plays", async () => {
    const { pill } = await open();
    observe(false);
    audio.dataset.slug = "other-world/lone-tale";
    audio.play();
    expect(pill().hidden).toBe(false);
  });

  it("its label follows the page's button (Resume once started)", async () => {
    localStorage.setItem(`story-progress:${SLUG}`, JSON.stringify({ v: 2, audioTime: 120, scrollY: 0, playing: false, savedAt: Date.now() }));
    const { pill } = await open();
    observe(false);
    await vi.waitFor(() => expect(pill().querySelector('[data-role="label"]').textContent).toBe("Resume"));
    expect(pill().getAttribute("aria-label")).toBe("Resume The First Tale");
  });

  it("does nothing on a page with no Play button, and cleans up when unmounted", async () => {
    const empty = await open({ withButton: false });
    expect(empty.pill()).toBeNull();
    for (const un of unmounts) un();
    unmounts = [];
    const { host } = await open();
    expect(host.children).toHaveLength(1);
    for (const un of unmounts) un();
    unmounts = [];
    expect(host.children).toHaveLength(0);
  });
});
