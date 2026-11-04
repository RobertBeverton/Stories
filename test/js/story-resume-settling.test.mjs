// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { read, write } from "../../site/assets/js/progress.mjs";
import { mount } from "../../site/assets/js/story-resume.mjs";
import { fakeAudio, loadPage, storyPageHtml, stubLibraryFetch, useFixedNow } from "./helpers.mjs";

const SLUG = "test-world/first-tale";
let unmount;
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("story-resume while the player swaps the source", () => {
  it("does not overwrite the saved position with the 0:00 a fresh source reports", () => {
    write(SLUG, { audioTime: 300, scrollY: 0 });
    loadPage(storyPageHtml);
    const audio = document.querySelector("audio#player");
    fakeAudio(audio, { duration: 600 });
    audio.dataset.slug = "test-world/second-tale"; // another story is playing when this page opens
    unmount = mount(document.querySelector('[data-mount="story-resume"]'));

    audio.dataset.slug = SLUG; // the player loads this story: slug set, source swapping
    audio.dataset.settling = "1";
    audio.currentTime = 0;
    audio.dispatchEvent(new Event("timeupdate"));
    audio.dispatchEvent(new Event("pause"));
    expect(read(SLUG).audioTime).toBe(300);

    delete audio.dataset.settling; // loadedmetadata: settled
    audio.currentTime = 40;
    audio.dispatchEvent(new Event("pause"));
    expect(read(SLUG).audioTime).toBe(40);
  });
});
