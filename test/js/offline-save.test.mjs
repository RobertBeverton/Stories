// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { mount } from "../../site/assets/js/offline-save.mjs";
import * as offline from "../../site/assets/js/offline.mjs";
import { library, stubLibraryFetch, tick } from "./helpers.mjs";

const STORY = { ...library.stories[0], audioUrl: "https://audio.example/first.mp3", audioBytes: 4 };
const lib = { ...library, stories: [STORY, ...library.stories.slice(1)] };

function fakeStore(overrides = {}) {
  const listeners = new Set();
  return {
    status: vi.fn(() => "none"),
    getJob: vi.fn(() => null),
    startJob: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    cancel: vi.fn(),
    storageInfo: vi.fn(async () => ({ quota: 1e9, usage: 0 })),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    emit: () => listeners.forEach((fn) => fn()),
    ...overrides,
  };
}

async function mountWith(store, data = lib) {
  vi.spyOn(offline, "getStore").mockReturnValue(store);
  vi.spyOn(offline, "offlineSupported").mockReturnValue(true);
  document.documentElement.dataset.base = "/Stories";
  document.body.innerHTML = `<div data-mount="offline-save" data-slug="${STORY.slug}"></div>`;
  const el = document.querySelector("[data-mount]");
  stubLibraryFetch(data);
  resetLibrary();
  const unmount = mount(el);
  await tick();
  await tick();
  return { el, unmount };
}

const button = (el) => el.querySelector("button");
const note = (el) => el.querySelector('[data-role="note"]');
const failedJob = (reason) => ({
  state: "error", slugs: [STORY.slug], failed: [STORY.slug], failedReasons: reason ? { [STORY.slug]: reason } : {}, current: null,
});

afterEach(() => vi.restoreAllMocks());

describe("offline-save", () => {
  it("offers to save, with the size", async () => {
    const { el } = await mountWith(fakeStore());
    expect(button(el).textContent).toBe("Save for offline · 4 B");
  });

  it("marks an estimated size with ~", async () => {
    const noBytes = { ...lib, stories: [{ ...STORY, audioBytes: undefined, durationSec: 600 }] };
    const { el } = await mountWith(fakeStore(), noBytes);
    expect(button(el).textContent).toBe("Save for offline · ~9.6 MB");
  });

  it("starts a save when pressed and there is room", async () => {
    const store = fakeStore();
    const { el } = await mountWith(store);
    button(el).click();
    await tick();
    expect(store.startJob).toHaveBeenCalledWith([expect.objectContaining({ slug: STORY.slug })]);
  });

  it("says why when there is no room, and saves nothing", async () => {
    const store = fakeStore({ storageInfo: vi.fn(async () => ({ quota: 5, usage: 4 })) });
    const { el } = await mountWith(store);
    button(el).click();
    await tick();
    expect(store.startJob).not.toHaveBeenCalled();
    expect(note(el).textContent).toBe("Needs 4 B, 1 B free");
  });

  it("shows progress while this story is being saved, and a press cancels", async () => {
    const store = fakeStore({
      getJob: vi.fn(() => ({ state: "running", slugs: [STORY.slug], current: STORY.slug, currentBytes: 1, bytesTotal: 4, bytesDone: 0 })),
    });
    const { el } = await mountWith(store);
    expect(button(el).textContent).toBe("Saving 25% · tap to cancel");
    button(el).click();
    expect(store.cancel).toHaveBeenCalled();
  });

  it("says waiting for a queued story", async () => {
    const store = fakeStore({
      getJob: vi.fn(() => ({ state: "running", slugs: ["other", STORY.slug], current: "other", currentBytes: 0, bytesTotal: 8, bytesDone: 0 })),
    });
    const { el } = await mountWith(store);
    expect(button(el).textContent).toBe("Waiting to save");
  });

  it("is a pressed toggle once saved, and a press removes it", async () => {
    const store = fakeStore({ status: vi.fn(() => "saved") });
    const { el } = await mountWith(store);
    expect(button(el).textContent).toBe("Saved for offline");
    expect(button(el).getAttribute("aria-pressed")).toBe("true");
    button(el).click();
    expect(store.remove).toHaveBeenCalledWith(STORY.slug);
  });

  it("offers an update when stale", async () => {
    const { el } = await mountWith(fakeStore({ status: vi.fn(() => "stale") }));
    expect(button(el).textContent).toBe("Update available · 4 B");
  });

  it("says so when the last attempt failed, and offers a retry", async () => {
    const store = fakeStore({ getJob: vi.fn(() => failedJob()) });
    const { el } = await mountWith(store);
    expect(note(el).textContent).toBe("Could not save. Try again.");
    expect(button(el).textContent).toBe("Retry · 4 B");
    button(el).click();
    await tick();
    expect(store.startJob).toHaveBeenCalled();
  });

  it.each([
    ["no space", "Not enough space"],
    ["incomplete", "Download interrupted"],
    ["network", "Download interrupted"],
    ["size mismatch", "File changed, try again later"],
    ["wrong type", "File changed, try again later"],
    ["not ok", "File not available, try again later"],
  ])("explains a %s failure in plain words", async (reason, words) => {
    const { el } = await mountWith(fakeStore({ getJob: vi.fn(() => failedJob(reason)) }));
    expect(note(el).textContent).toBe(`Could not save: ${words}.`);
  });

  it("falls back to a general message for an unknown reason", async () => {
    const { el } = await mountWith(fakeStore({ getJob: vi.fn(() => failedJob("something odd")) }));
    expect(note(el).textContent).toBe("Could not save. Try again.");
  });

  it("does not report a failure once the story is saved", async () => {
    const { el } = await mountWith(fakeStore({ status: vi.fn(() => "saved"), getJob: vi.fn(() => failedJob("network")) }));
    expect(note(el).textContent).toBe("");
  });

  it("announces changes politely and uses a real button", async () => {
    const { el } = await mountWith(fakeStore());
    expect(button(el).tagName).toBe("BUTTON");
    expect(button(el).type).toBe("button");
    expect(note(el).getAttribute("role")).toBe("status");
    expect(note(el).getAttribute("aria-live")).toBe("polite");
  });

  it("ignores a second press while the space check is pending", async () => {
    const store = fakeStore();
    const { el } = await mountWith(store);
    button(el).click();
    button(el).click();
    await tick();
    expect(store.startJob).toHaveBeenCalledTimes(1);
  });

  it("follows the store", async () => {
    const store = fakeStore();
    const { el } = await mountWith(store);
    store.status.mockReturnValue("saved");
    store.emit();
    expect(button(el).textContent).toBe("Saved for offline");
  });

  it("hides itself where offline is not supported", () => {
    vi.spyOn(offline, "offlineSupported").mockReturnValue(false);
    document.body.innerHTML = `<div data-mount="offline-save" data-slug="${STORY.slug}"></div>`;
    const el = document.querySelector("[data-mount]");
    expect(() => mount(el)).not.toThrow();
    expect(el.hidden).toBe(true);
    expect(el.querySelector("button")).toBeNull();
  });

  it("hides itself for a story with no audio", async () => {
    const noAudio = { ...lib, stories: [{ ...STORY, audioUrl: undefined }] };
    const { el } = await mountWith(fakeStore(), noAudio);
    expect(el.hidden).toBe(true);
  });

  it("stops listening when unmounted", async () => {
    const store = fakeStore();
    const { el, unmount } = await mountWith(store);
    unmount();
    store.status.mockReturnValue("saved");
    store.emit();
    expect(button(el)?.textContent ?? "").not.toBe("Saved for offline");
  });
});
