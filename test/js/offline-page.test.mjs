// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { mount } from "../../site/assets/js/offline-page.mjs";
import * as offline from "../../site/assets/js/offline.mjs";
import { library, stubLibraryFetch, tick } from "./helpers.mjs";

// Fixture library: test-world has two stories with audio (first 9.6 MB, second estimated 16 MB), other-world has none.
const lib = structuredClone(library);
lib.stories[0].audioUrl = "https://audio.example/a.mp3";
lib.stories[0].audioBytes = 9_600_000;
lib.stories[1].audioUrl = "https://audio.example/b.mp3";
lib.stories[1].durationSec = 1000;
const [A, B] = lib.stories;

function fakeStore({ saved = [], job = null } = {}) {
  const listeners = new Set();
  const store = {
    ids: new Set(saved),
    job,
    status: (story) => (store.ids.has(story.slug) ? "saved" : "none"),
    saved: () => ({ count: store.ids.size, bytes: store.ids.size * 9_600_000 }),
    storageInfo: vi.fn(async () => ({ quota: 2e9, usage: 5e8 })),
    startJob: vi.fn(async () => {}),
    removeMany: vi.fn(async () => {}),
    cancel: vi.fn(),
    reconcile: vi.fn(async () => {}),
    getJob: () => store.job,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    emit: () => listeners.forEach((fn) => fn()),
    listenerCount: () => listeners.size,
  };
  return store;
}

const unmounts = [];
async function render(store, { online = true } = {}) {
  vi.spyOn(offline, "getStore").mockReturnValue(store);
  vi.spyOn(offline, "offlineSupported").mockReturnValue(true);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  document.documentElement.dataset.base = "/Stories";
  document.body.innerHTML = '<div data-mount="offline-page"></div>';
  stubLibraryFetch(lib);
  resetLibrary();
  const el = document.querySelector("[data-mount]");
  const unmount = mount(el);
  unmounts.push(unmount);
  await tick(); await tick(); await tick();
  return { el, unmount };
}
const text = (el, role) => el.querySelector(`[data-role="${role}"]`)?.textContent;
const click = (el, role) => el.querySelector(`[data-role="${role}"]`).click();

afterEach(() => {
  while (unmounts.length) unmounts.pop()?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("offline page", () => {
  it("shows what is saved and how much room is left", async () => {
    const { el } = await render(fakeStore({ saved: [A.slug, B.slug] }));
    expect(text(el, "meter-text")).toBe("Saved on this tablet 19 MB · 1.5 GB free");
    const bar = el.querySelector('[data-role="meter-bar"]');
    expect(bar.tagName).toBe("PROGRESS");
    expect(bar.getAttribute("aria-label")).toBeTruthy();
  });

  it("has an Everything row with the total still to save", async () => {
    const { el } = await render(fakeStore());
    expect(text(el, "all-detail")).toContain("2 stories");
    expect(text(el, "all-save")).toContain("Save all");
  });

  it("lists only worlds that have stories with audio, with counts", async () => {
    const { el } = await render(fakeStore());
    const worlds = el.querySelectorAll('[data-role="world"]');
    expect(worlds).toHaveLength(1);
    expect(worlds[0].dataset.world).toBe("test-world");
    expect(text(worlds[0], "world-detail")).toContain("0 of 2 saved");
    expect(worlds[0].querySelector("svg")).not.toBeNull(); // the world's icon
  });

  it("Save all asks the store to save every unsaved story, after a space check", async () => {
    const store = fakeStore({ saved: [A.slug] });
    const { el } = await render(store);
    click(el, "all-save");
    await tick(); await tick();
    expect(store.storageInfo).toHaveBeenCalled();
    expect(store.startJob).toHaveBeenCalledTimes(1);
    expect(store.startJob.mock.calls[0][0].map((s) => s.slug)).toEqual([B.slug]);
  });

  it("Save all is refused with the reason when it will not fit", async () => {
    const store = fakeStore();
    store.storageInfo.mockResolvedValue({ quota: 1e7, usage: 0 });
    const { el } = await render(store);
    click(el, "all-save");
    await tick(); await tick();
    expect(store.startJob).not.toHaveBeenCalled();
    expect(text(el, "notice")).toBe("Needs 26 MB, 10 MB free");
  });

  it("a world expands to a checklist, and ticking stories shows the selection bar", async () => {
    const { el } = await render(fakeStore());
    expect(el.querySelector('[data-role="selection"]').hidden).toBe(true);
    click(el, "world-toggle");
    expect(el.querySelector('[data-role="world-toggle"]').getAttribute("aria-expanded")).toBe("true");
    const rows = el.querySelectorAll('[data-role="story"]');
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain('The <Second> & "Quoted" Tale'); // as text, not markup
    expect(rows[1].querySelector("b, i, script")).toBeNull();
    rows[0].querySelector('[data-role="story-pick"]').click();
    const bar = el.querySelector('[data-role="selection"]');
    expect(bar.hidden).toBe(false);
    expect(text(el, "selection-save")).toBe("Save 1 story · 9.6 MB");
  });

  it("the selection bar saves just the ticked stories", async () => {
    const store = fakeStore();
    const { el } = await render(store);
    click(el, "world-toggle");
    el.querySelectorAll('[data-role="story-pick"]')[1].click();
    click(el, "selection-save");
    await tick(); await tick();
    expect(store.startJob.mock.calls[0][0].map((s) => s.slug)).toEqual([B.slug]);
  });

  it("a saved story shows Remove instead of a checkbox", async () => {
    const store = fakeStore({ saved: [A.slug] });
    const { el } = await render(store);
    click(el, "world-toggle");
    const [first, second] = el.querySelectorAll('[data-role="story"]');
    expect(first.querySelector('[data-role="story-pick"]')).toBeNull();
    expect(text(first, "story-state")).toBe("Saved");
    first.querySelector('[data-role="story-remove"]').click();
    expect(store.removeMany).toHaveBeenCalledWith([A.slug]);
    expect(second.querySelector('[data-role="story-remove"]')).toBeNull();
  });

  it("Remove all needs a second tap, and says what it will do", async () => {
    const store = fakeStore({ saved: [A.slug, B.slug] });
    const { el } = await render(store);
    click(el, "all-remove");
    expect(text(el, "all-remove")).toBe("Remove all? Tap again");
    expect(text(el, "notice")).toContain("again");
    expect(store.removeMany).not.toHaveBeenCalled();
    click(el, "all-remove");
    expect(store.removeMany).toHaveBeenCalledWith([A.slug, B.slug]);
  });

  it("a world Remove also needs a second tap", async () => {
    const store = fakeStore({ saved: [A.slug] });
    const { el } = await render(store);
    click(el, "world-remove");
    expect(store.removeMany).not.toHaveBeenCalled();
    click(el, "world-remove");
    expect(store.removeMany).toHaveBeenCalledWith([A.slug]);
  });

  it("shows job progress with Cancel while saving", async () => {
    const store = fakeStore({
      job: { state: "running", total: 2, done: 1, current: A.slug, slugs: [A.slug, B.slug], failed: [], bytesTotal: 2.56e7, bytesDone: 9.6e6, currentBytes: 4.8e6 },
    });
    const { el } = await render(store);
    expect(el.querySelector('[data-role="job"]').hidden).toBe(false);
    expect(text(el, "job-text")).toBe("Saving 2 of 2 · 56%");
    expect(el.querySelectorAll('[data-role="job-bar"]')).toHaveLength(1);
    click(el, "job-cancel");
    expect(store.cancel).toHaveBeenCalled();
  });

  it("offers Retry after a failure, with the reasons in plain words", async () => {
    const store = fakeStore({
      job: { state: "error", total: 2, done: 1, slugs: [A.slug, B.slug], failed: [B.slug], failedReasons: { [B.slug]: "no space" }, bytesTotal: 1, bytesDone: 0, currentBytes: 0 },
    });
    const { el } = await render(store);
    expect(text(el, "job-text")).toBe("1 could not be saved");
    expect(el.querySelector('[data-role="job"]').textContent).toContain("Not enough space");
    click(el, "job-retry");
    await tick(); await tick();
    expect(store.startJob.mock.calls[0][0].map((s) => s.slug)).toEqual([B.slug]);
  });

  it("disables saving and says so while offline", async () => {
    const { el } = await render(fakeStore({ saved: [A.slug] }), { online: false });
    expect(el.querySelector('[data-role="all-save"]').disabled).toBe(true);
    expect(el.querySelector('[data-role="world-save"]').disabled).toBe(true);
    expect(text(el, "notice")).toBe("You are offline. Saved stories still play.");
  });

  it("says so plainly when offline with nothing saved", async () => {
    const { el } = await render(fakeStore(), { online: false });
    expect(el.textContent).toContain("nothing is saved on this tablet yet");
  });

  it("rebuilds the lists only when something changes, not on every progress tick", async () => {
    const store = fakeStore();
    const { el } = await render(store);
    const toggle = el.querySelector('[data-role="world-toggle"]');
    toggle.focus();
    store.job = { state: "running", total: 1, done: 0, slugs: [A.slug], failed: [], bytesTotal: 100, bytesDone: 0, currentBytes: 10 };
    store.emit();
    const before = el.querySelector('[data-role="world-toggle"]');
    store.job = { ...store.job, currentBytes: 60 };
    store.emit();
    await tick();
    expect(el.querySelector('[data-role="world-toggle"]')).toBe(before);
    expect(document.contains(before)).toBe(true);
  });

  it("keeps focus on the world toggle when it expands", async () => {
    const { el } = await render(fakeStore());
    el.querySelector('[data-role="world-toggle"]').focus();
    click(el, "world-toggle");
    expect(document.activeElement?.dataset.role).toBe("world-toggle");
  });

  it("reconciles with the library when it loads", async () => {
    const store = fakeStore();
    await render(store);
    expect(store.reconcile).toHaveBeenCalledTimes(1);
    expect(store.reconcile.mock.calls[0][0].map((s) => s.slug)).toEqual([A.slug, B.slug]);
  });

  it("stops listening when unmounted", async () => {
    const store = fakeStore();
    const { unmount } = await render(store);
    expect(store.listenerCount()).toBe(1);
    unmount();
    expect(store.listenerCount()).toBe(0);
  });

  it("shows a quiet message and does not throw where offline saving is unsupported", async () => {
    vi.spyOn(offline, "offlineSupported").mockReturnValue(false);
    document.body.innerHTML = '<div data-mount="offline-page"></div>';
    const el = document.querySelector("[data-mount]");
    expect(() => mount(el)).not.toThrow();
    expect(el.textContent).toContain("cannot save stories for offline");
  });
});
