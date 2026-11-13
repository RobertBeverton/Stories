// The offline store: saves story audio into the Cache API, keeps a small index in
// localStorage, and runs one download job at a time. One instance per page
// context (the router keeps it alive across navigation, so a download keeps going).
// Rules: docs/contracts.md section 9.
import { AUDIO_CACHE, SHELL_PREFIX, needsSave, spaceCheck, storyBytes, totalBytes } from "./offline-core.mjs";

export const INDEX_KEY = "stories-offline";

const defaultWhenOnline = () => new Promise((resolve) => window.addEventListener("online", resolve, { once: true }));

export function createStore({
  caches, fetch, storage, navigator: nav, buildId, dispatch = () => {}, now = () => Date.now(),
  baseUrl = globalThis.location?.href, whenOnline = defaultWhenOnline,
}) {
  const listeners = new Set();
  let job = null;
  let controller = null;
  let asked = false;

  // library.json may carry relative same-origin audio paths (sibling mp3s). The
  // worker matches request.url, which is absolute, so resolve once and use the
  // absolute URL as the cache key and the index url everywhere.
  const resolve = (story) => {
    if (!story?.audioUrl) return story;
    try {
      const url = new URL(story.audioUrl, baseUrl).href;
      return url === story.audioUrl ? story : { ...story, audioUrl: url };
    } catch {
      return story;
    }
  };
  const sameOrigin = (url) => {
    try { return new URL(url).origin === new URL(baseUrl).origin; } catch { return false; }
  };

  // ---- the index (advisory; the cache is the truth) ----
  const index = () => {
    try {
      const value = JSON.parse(storage.getItem(INDEX_KEY) ?? "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  };
  const writeIndex = (value) => {
    try { storage.setItem(INDEX_KEY, JSON.stringify(value)); } catch { /* full or blocked: the cache still holds the audio */ }
  };
  const notify = (slug = null) => {
    dispatch(slug);
    for (const fn of listeners) fn();
  };

  const status = (story) => {
    const record = index()[story.slug];
    if (!record) return "none";
    return needsSave(resolve(story), record) ? "stale" : "saved";
  };
  const saved = () => {
    const records = Object.values(index());
    return { count: records.length, bytes: records.reduce((n, r) => n + (Number(r.bytes) || 0), 0) };
  };
  const savedSlugs = () => new Set(Object.keys(index()));

  async function storageInfo() {
    try {
      const { quota, usage } = (await nav?.storage?.estimate?.()) ?? {};
      return { quota, usage };
    } catch {
      return { quota: undefined, usage: undefined };
    }
  }

  async function cachePage(story) {
    if (!buildId || !story.url) return;
    const cache = await caches.open(`${SHELL_PREFIX}${buildId}`);
    if (await cache.match(story.url)) return;
    const res = await fetch(story.url, { headers: { Accept: "text/html" } });
    if (res.ok && !res.redirected) await cache.put(story.url, res);
  }

  // ---- save and remove ----
  async function save(input, { signal, onBytes } = {}) {
    const story = resolve(input);
    // Same-origin files need no CORS; cross-origin audio needs it so the response is not opaque.
    const init = sameOrigin(story.audioUrl) ? { signal } : { mode: "cors", signal };
    const res = await fetch(story.audioUrl, init);
    // Only a complete 200 is kept: never a 206 or an error page.
    if (!res.ok || res.status !== 200) throw new Error(`audio ${res.status}`);
    const declared = Number(res.headers.get("content-length")) || 0;
    const chunks = [];
    let got = 0;
    if (res.body?.getReader) {
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          got += value.length;
          onBytes?.(got, declared);
        }
      } catch (err) {
        reader.cancel().catch(() => {});
        throw err;
      }
    } else {
      const buffer = new Uint8Array(await res.arrayBuffer());
      chunks.push(buffer);
      got = buffer.length;
    }
    if (declared && got !== declared) throw new Error(`incomplete download (${got} of ${declared} bytes)`);
    const known = storyBytes(story);
    if (got === 0 || (known.exact && Math.abs(got - known.bytes) > known.bytes * 0.01)) {
      throw new Error(`implausible download (${got} bytes, expected ${known.bytes})`);
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const blob = new Blob(chunks, { type: "audio/mpeg" });
    const cache = await caches.open(AUDIO_CACHE);
    await cache.put(
      story.audioUrl,
      new Response(blob, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(blob.size) } }),
    );
    const next = index();
    const previous = next[story.slug];
    next[story.slug] = { url: story.audioUrl, bytes: blob.size, savedAt: now() };
    writeIndex(next);
    if (previous && previous.url !== story.audioUrl) await cache.delete(previous.url);
    try { await cachePage(story); } catch { /* the audio is saved; the page is a bonus */ }
    notify(story.slug);
  }

  async function remove(slug) {
    const next = index();
    const record = next[slug];
    if (!record) return;
    const cache = await caches.open(AUDIO_CACHE);
    await cache.delete(record.url);
    delete next[slug];
    writeIndex(next);
    notify(slug);
  }

  async function removeMany(slugs) {
    for (const slug of slugs) await remove(slug);
  }

  // ---- jobs ----
  const getJob = () => job;

  async function startJob(stories) {
    if (job?.state === "running") return job;
    const list = stories.filter((s) => s.audioUrl && status(s) !== "saved").map(resolve);
    controller = new AbortController();
    const { signal } = controller;
    job = {
      state: "running",
      slugs: list.map((s) => s.slug),
      total: list.length,
      done: 0,
      failed: [],
      current: null,
      bytesTotal: list.reduce((n, s) => n + storyBytes(s).bytes, 0),
      bytesDone: 0,
      currentBytes: 0,
      paused: false,
      noSpace: false,
    };
    notify();
    if (!asked) {
      asked = true;
      try { await nav?.storage?.persist?.(); } catch { /* a refusal changes nothing */ }
    }
    // Pre-flight: refuse a selection that cannot fit, before downloading anything.
    const { quota, usage } = await storageInfo();
    if (list.length && !spaceCheck({ needBytes: totalBytes(list).bytes, quota, usage }).fits) {
      job.noSpace = true;
      job.failed = [...job.slugs];
      job.state = "error";
      notify();
      return job;
    }
    const aborted = new Promise((resolveAbort) => signal.addEventListener("abort", resolveAbort, { once: true }));
    // Pause while the tablet is offline; Cancel releases the wait.
    const waitForNetwork = async () => {
      while (nav?.onLine === false && !signal.aborted) {
        job.paused = true;
        notify();
        await Promise.race([whenOnline(), aborted]);
      }
      if (job.paused) {
        job.paused = false;
        notify();
      }
    };
    let lastTick = 0;
    for (const story of list) {
      if (signal.aborted) break;
      job.current = story.slug;
      job.currentBytes = 0;
      notify();
      for (;;) {
        await waitForNetwork();
        if (signal.aborted) break;
        try {
          await save(story, {
            signal,
            onBytes: (got) => {
              job.currentBytes = got;
              const t = now();
              if (t - lastTick > 250) { lastTick = t; notify(); }
            },
          });
          job.done += 1;
          job.bytesDone += storyBytes(story).bytes;
        } catch {
          if (signal.aborted) break;
          // The network dropped mid-download: wait for it, then retry this story.
          if (nav?.onLine === false) continue;
          job.failed.push(story.slug);
        }
        break;
      }
    }
    job.current = null;
    job.currentBytes = 0;
    job.state = signal.aborted ? "cancelled" : job.failed.length ? "error" : "done";
    notify();
    return job;
  }

  function cancel() {
    controller?.abort();
  }

  // ---- housekeeping ----
  /** Makes the index agree with the cache, and re-caches saved stories' pages. Call when online with the library loaded. */
  async function reconcile(stories) {
    const cache = await caches.open(AUDIO_CACHE);
    const cached = new Set((await cache.keys()).map((r) => r.url));
    const next = index();
    const owned = new Set();
    for (const [slug, record] of Object.entries(next)) {
      if (cached.has(record.url)) owned.add(record.url);
      else delete next[slug];
    }
    for (const input of stories) {
      const story = resolve(input);
      if (!next[story.slug] && story.audioUrl && cached.has(story.audioUrl)) {
        next[story.slug] = { url: story.audioUrl, bytes: storyBytes(story).bytes, savedAt: now() };
        owned.add(story.audioUrl);
      }
    }
    for (const url of cached) if (!owned.has(url)) await cache.delete(url);
    writeIndex(next);
    for (const story of stories) {
      if (next[story.slug]) { try { await cachePage(story); } catch { /* offline: try next time */ } }
    }
    notify();
  }

  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  return { index, status, saved, savedSlugs, storageInfo, save, remove, removeMany, startJob, getJob, cancel, reconcile, subscribe };
}

// ---- the real one ----
let instance = null;

/** True when this browser can save for offline (Cache API and service workers). */
export function offlineSupported(env = globalThis) {
  return Boolean(env.caches && env.navigator?.serviceWorker);
}

export function getStore() {
  if (!instance) {
    instance = createStore({
      caches: globalThis.caches,
      fetch: (...args) => globalThis.fetch(...args),
      storage: globalThis.localStorage,
      navigator: globalThis.navigator,
      buildId: document.querySelector('meta[name="build-id"]')?.content,
      dispatch: (slug) => document.dispatchEvent(new CustomEvent("stories:offline", { detail: { slug } })),
    });
    // Across tabs: another tab saved or removed something.
    window.addEventListener("storage", (event) => {
      if (event.key === INDEX_KEY) document.dispatchEvent(new CustomEvent("stories:offline", { detail: { slug: null } }));
    });
  }
  return instance;
}

export function resetStore() {
  instance = null;
}
