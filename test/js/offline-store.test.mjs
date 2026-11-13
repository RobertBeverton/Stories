import { describe, expect, it, vi } from "vitest";
import { createStore } from "../../site/assets/js/offline.mjs";
import { fakeCaches } from "./fake-caches.mjs";

// Invented placeholder stories.
const story = (n, extra = {}) => ({
  slug: `w/tale-${n}`, title: `Tale ${n}`, world: "w", url: `/Stories/stories/tale-${n}/`,
  audioUrl: `https://audio.example/w/tale-${n}.mp3?v=1`, audioBytes: 4, durationSec: 60, ...extra,
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function audioFetch({ fail = new Set(), short = new Set() } = {}) {
  return vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith(".mp3") || u.includes(".mp3?")) {
      if (fail.has(u)) return new Response("no", { status: 500 });
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const body = short.has(u) ? bytes.slice(0, 2) : bytes;
      return new Response(body, { status: 200, headers: { "content-length": "4" } });
    }
    return new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
  });
}

function make(opts = {}) {
  const caches = fakeCaches();
  const events = [];
  const fetch = opts.fetch ?? audioFetch();
  const store = createStore({
    caches, fetch, storage: opts.storage ?? memoryStorage(), buildId: "b2",
    navigator: opts.navigator ?? { storage: { estimate: async () => ({ quota: 1e9, usage: 1e8 }), persist: vi.fn(async () => true) } },
    dispatch: (slug) => events.push(slug),
  });
  return { caches, events, fetch, store };
}

describe("save and remove", () => {
  it("caches the audio under its exact url, indexes it and caches the story page", async () => {
    const { store, caches, fetch } = make();
    await store.save(story(1));
    const audio = await caches.open("audio-v1");
    expect([...audio.entries.keys()]).toEqual(["https://audio.example/w/tale-1.mp3?v=1"]);
    expect(store.status(story(1))).toBe("saved");
    expect(store.index()["w/tale-1"]).toMatchObject({ url: story(1).audioUrl, bytes: 4 });
    expect(fetch).toHaveBeenCalledWith(story(1).audioUrl, expect.objectContaining({ mode: "cors" }));
    const shell = await caches.open("shell-b2");
    expect(await shell.match("/Stories/stories/tale-1/")).toBeDefined();
  });

  it("does not index a download that came up short", async () => {
    const s = story(1);
    const { store, caches } = make({ fetch: audioFetch({ short: new Set([s.audioUrl]) }) });
    await expect(store.save(s)).rejects.toThrow(/incomplete/);
    expect(store.status(s)).toBe("none");
    expect((await caches.open("audio-v1")).entries.size).toBe(0);
  });

  it("rejects on an http error", async () => {
    const s = story(1);
    const { store } = make({ fetch: audioFetch({ fail: new Set([s.audioUrl]) }) });
    await expect(store.save(s)).rejects.toThrow();
    expect(store.status(s)).toBe("none");
  });

  it("shows a story whose audioUrl changed as stale, and an update replaces the old file", async () => {
    const { store, caches } = make();
    await store.save(story(1));
    const newer = story(1, { audioUrl: "https://audio.example/w/tale-1.mp3?v=2" });
    expect(store.status(newer)).toBe("stale");
    await store.save(newer);
    const audio = await caches.open("audio-v1");
    expect([...audio.entries.keys()]).toEqual([newer.audioUrl]);
    expect(store.status(newer)).toBe("saved");
  });

  it("removes the audio and the index entry", async () => {
    const { store, caches } = make();
    await store.save(story(1));
    await store.remove("w/tale-1");
    expect(store.status(story(1))).toBe("none");
    expect((await caches.open("audio-v1")).entries.size).toBe(0);
  });

  it("announces each change", async () => {
    const { store, events } = make();
    await store.save(story(1));
    await store.remove("w/tale-1");
    expect(events).toEqual(["w/tale-1", "w/tale-1"]);
  });

  it("survives a broken index in storage", () => {
    const storage = memoryStorage();
    storage.setItem("stories-offline", "{not json");
    expect(make({ storage }).store.index()).toEqual({});
  });
});

describe("jobs", () => {
  it("saves each story that is not saved yet, in order, and reports progress", async () => {
    const { store } = make();
    await store.save(story(1));
    const seen = [];
    store.subscribe(() => seen.push(store.getJob()?.current ?? null));
    const job = await store.startJob([story(1), story(2), story(3)]);
    expect(job).toMatchObject({ state: "done", total: 2, done: 2, failed: [] });
    expect(store.status(story(2))).toBe("saved");
    expect(store.status(story(3))).toBe("saved");
    expect(seen).toContain("w/tale-2");
  });

  it("asks the browser to keep the storage, once", async () => {
    const navigator = { storage: { estimate: async () => ({ quota: 1e9, usage: 0 }), persist: vi.fn(async () => true) } };
    const { store } = make({ navigator });
    await store.startJob([story(1)]);
    await store.startJob([story(2)]);
    expect(navigator.storage.persist).toHaveBeenCalledTimes(1);
  });

  it("keeps going past a failure and lists it", async () => {
    const bad = story(2);
    const { store } = make({ fetch: audioFetch({ fail: new Set([bad.audioUrl]) }) });
    const job = await store.startJob([story(1), bad, story(3)]);
    expect(job).toMatchObject({ state: "error", done: 2, failed: ["w/tale-2"] });
    expect(store.status(story(3))).toBe("saved");
  });

  it("can be cancelled between stories", async () => {
    const { store } = make();
    const started = store.startJob([story(1), story(2), story(3)]);
    store.cancel();
    const job = await started;
    expect(job.state).toBe("cancelled");
    expect(store.status(story(3))).toBe("none");
  });

  it("ignores a second job while one runs", async () => {
    const { store } = make();
    const first = store.startJob([story(1), story(2)]);
    const second = await store.startJob([story(3)]);
    expect(second.slugs).toEqual(["w/tale-1", "w/tale-2"]);
    await first;
    expect(store.status(story(3))).toBe("none");
  });
});

describe("storageInfo and totals", () => {
  it("reads quota and usage", async () => {
    const { store } = make();
    expect(await store.storageInfo()).toEqual({ quota: 1e9, usage: 1e8 });
  });
  it("copes with a browser that cannot estimate", async () => {
    const { store } = make({ navigator: {} });
    expect(await store.storageInfo()).toEqual({ quota: undefined, usage: undefined });
  });
  it("adds up what is saved", async () => {
    const { store } = make();
    await store.save(story(1));
    await store.save(story(2));
    expect(store.saved()).toEqual({ count: 2, bytes: 8 });
  });
});

describe("reconcile", () => {
  it("drops an index entry whose audio vanished", async () => {
    const { store, caches } = make();
    await store.save(story(1));
    await (await caches.open("audio-v1")).delete(story(1).audioUrl);
    await store.reconcile([story(1)]);
    expect(store.status(story(1))).toBe("none");
  });

  it("re-adopts audio found in the cache when the index was lost, and deletes audio no story owns", async () => {
    const storage = memoryStorage();
    const { store, caches } = make({ storage });
    await store.save(story(1));
    storage.removeItem("stories-offline");
    await (await caches.open("audio-v1")).put("https://audio.example/w/orphan.mp3?v=1", new Response("x"));
    await store.reconcile([story(1)]);
    expect(store.status(story(1))).toBe("saved");
    expect((await caches.open("audio-v1")).entries.has("https://audio.example/w/orphan.mp3?v=1")).toBe(false);
  });

  it("re-caches the page of a saved story when it is missing from this build's shell", async () => {
    const { store, caches } = make();
    await store.save(story(1));
    (await caches.open("shell-b2")).entries.clear();
    await store.reconcile([story(1)]);
    expect(await (await caches.open("shell-b2")).match("/Stories/stories/tale-1/")).toBeDefined();
  });
});

describe("hardening", () => {
  const BASE = "https://robertbeverton.github.io/Stories/";
  const rel = (n) => story(n, { audioUrl: `/Stories/stories/w/tale-${n}.mp3` });

  function makeBase(opts = {}) {
    const caches = fakeCaches();
    const fetch = opts.fetch ?? audioFetch();
    const store = createStore({
      caches, fetch, storage: memoryStorage(), buildId: "b2", baseUrl: BASE,
      navigator: opts.navigator ?? { storage: { estimate: async () => ({ quota: 1e9, usage: 0 }), persist: async () => true } },
      whenOnline: opts.whenOnline,
    });
    return { caches, fetch, store };
  }

  it("resolves a relative audioUrl and uses the absolute url everywhere, without CORS", async () => {
    const { store, caches, fetch } = makeBase();
    await store.save(rel(1));
    const abs = "https://robertbeverton.github.io/Stories/stories/w/tale-1.mp3";
    expect([...(await caches.open("audio-v1")).entries.keys()]).toEqual([abs]);
    expect(store.index()["w/tale-1"].url).toBe(abs);
    expect(store.status(rel(1))).toBe("saved");
    expect(fetch).toHaveBeenCalledWith(abs, expect.not.objectContaining({ mode: "cors" }));
  });

  it("a partial body with no content-length leaves nothing when the stream errors", async () => {
    const fetch = vi.fn(async () => {
      let sent = false;
      const body = new ReadableStream({
        pull(c) { if (!sent) { sent = true; c.enqueue(new Uint8Array([1, 2])); } else c.error(new Error("reset")); },
      });
      return new Response(body, { status: 200 });
    });
    const { store, caches } = makeBase({ fetch });
    await expect(store.save(story(1))).rejects.toThrow();
    expect((await caches.open("audio-v1")).entries.size).toBe(0);
    expect(store.status(story(1))).toBe("none");
  });

  it("rejects a 206 and a body far from the known audioBytes", async () => {
    const f206 = vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 }));
    const a = makeBase({ fetch: f206 });
    await expect(a.store.save(story(1))).rejects.toThrow();
    const big = story(2, { audioBytes: 1000 });
    const b = makeBase();
    await expect(b.store.save(big)).rejects.toThrow(/implausible|incomplete/);
    expect((await b.caches.open("audio-v1")).entries.size).toBe(0);
  });

  it("cancel aborts the in-flight fetch and leaves nothing", async () => {
    let seenSignal;
    const fetch = vi.fn(async (url, init) => {
      seenSignal = init.signal;
      const body = new ReadableStream({
        start(c) { c.enqueue(new Uint8Array([1])); init.signal.addEventListener("abort", () => c.error(new DOMException("x", "AbortError"))); },
      });
      return new Response(body, { status: 200 });
    });
    const { store, caches } = makeBase({ fetch });
    const started = store.startJob([story(1), story(2)]);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    store.cancel();
    const job = await started;
    expect(seenSignal.aborted).toBe(true);
    expect(job).toMatchObject({ state: "cancelled", done: 0, failed: [] });
    expect((await caches.open("audio-v1")).entries.size).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("pauses while offline and resumes when online", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const navigator = { onLine: false, storage: { estimate: async () => ({ quota: 1e9, usage: 0 }) } };
    const { store, fetch } = makeBase({ navigator, whenOnline: () => gate });
    const started = store.startJob([story(1)]);
    await vi.waitFor(() => expect(store.getJob().paused).toBe(true));
    expect(fetch).not.toHaveBeenCalled();
    navigator.onLine = true;
    release();
    const job = await started;
    expect(job).toMatchObject({ state: "done", done: 1 });
    expect(job.paused).toBe(false);
  });

  it("cancel releases a paused job", async () => {
    const navigator = { onLine: false, storage: {} };
    const { store } = makeBase({ navigator, whenOnline: () => new Promise(() => {}) });
    const started = store.startJob([story(1)]);
    await vi.waitFor(() => expect(store.getJob().paused).toBe(true));
    store.cancel();
    expect((await started).state).toBe("cancelled");
  });

  it("does not throw when storage throws", async () => {
    const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
    const store = createStore({ caches: fakeCaches(), fetch: audioFetch(), storage, navigator: {}, buildId: "b2" });
    expect(store.index()).toEqual({});
    await store.save(story(1));
  });

  it("refuses a job that cannot fit", async () => {
    const navigator = { storage: { estimate: async () => ({ quota: 100, usage: 99 }) } };
    const { store, fetch } = makeBase({ navigator });
    const job = await store.startJob([story(1)]);
    expect(job).toMatchObject({ state: "error", done: 0, failed: ["w/tale-1"], noSpace: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
