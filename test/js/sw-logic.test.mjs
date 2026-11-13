import { describe, expect, it, vi } from "vitest";
import { createWorker } from "../../site/assets/js/sw-logic.mjs";
import { fakeCaches } from "./fake-caches.mjs";

const ORIGIN = "https://site.example";
const SCOPE = "/Stories/";
const AUDIO = "https://audio.example/w/one.mp3?v=1";

const page = (path) => `${ORIGIN}${SCOPE}${path}`;
const html = (text) => new Response(text, { headers: { "Content-Type": "text/html" } });
const req = (url, init = {}) => new Request(url, init);

function setup({ fetch = vi.fn(async () => html("net")), precache = [page(""), page("library/")], timeoutMs = 20 } = {}) {
  const caches = fakeCaches();
  const worker = createWorker({ caches, fetch, origin: ORIGIN, scope: SCOPE, buildId: "b2", precache, timeoutMs });
  return { caches, fetch, worker };
}

describe("install and activate", () => {
  it("precaches the shell into shell-<buildId>", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async (u) => html(`page ${u}`)) });
    await worker.install();
    const shell = await caches.open("shell-b2");
    expect([...shell.entries.keys()].sort()).toEqual([page(""), page("library/")].sort());
  });

  it("fails the install when a precache file is missing, so the old worker stays", async () => {
    const { worker } = setup({ fetch: vi.fn(async () => new Response("no", { status: 404 })) });
    await expect(worker.install()).rejects.toThrow();
  });

  it("a failed install leaves no half-filled cache behind", async () => {
    const fetch = vi.fn(async (u) => (u === page("library/") ? new Response("no", { status: 404 }) : html("ok")));
    const { caches, worker } = setup({ fetch });
    await expect(worker.install()).rejects.toThrow();
    expect(await caches.has("shell-b2")).toBe(false);
  });

  it("activate deletes old shell caches and keeps the audio cache", async () => {
    const { caches, worker } = setup();
    await caches.open("shell-b1");
    await caches.open("shell-b2");
    await caches.open("audio-v1");
    await worker.activate();
    expect(await caches.keys()).toEqual(["shell-b2", "audio-v1"]);
  });
});

describe("shouldHandle", () => {
  const { worker } = setup();
  it("handles in-scope GETs and any mp3, not POSTs or other origins' pages", () => {
    expect(worker.shouldHandle(req(page("library/")))).toBe(true);
    expect(worker.shouldHandle(req(AUDIO))).toBe(true);
    expect(worker.shouldHandle(req(page("library/"), { method: "POST" }))).toBe(false);
    expect(worker.shouldHandle(req("https://other.example/x.html"))).toBe(false);
    expect(worker.shouldHandle(req(`${ORIGIN}/elsewhere/`))).toBe(false);
  });
});

describe("audio", () => {
  it("serves a saved story from the cache with Range support, without the network", async () => {
    const { caches, worker, fetch } = setup();
    const audio = await caches.open("audio-v1");
    await audio.put(AUDIO, new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { headers: { "Content-Type": "audio/mpeg" } }));
    const res = await worker.respond(req(AUDIO, { headers: { Range: "bytes=4-6" } }));
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 4-6/10");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([4, 5, 6]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes an unsaved story to the network", async () => {
    const net = vi.fn(async () => new Response("AUDIO", { status: 200 }));
    const { worker } = setup({ fetch: net });
    const res = await worker.respond(req(AUDIO));
    expect(await res.text()).toBe("AUDIO");
    expect(net).toHaveBeenCalledTimes(1);
  });

  it("does not match a different ?v= of the same file", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => new Response("NEW")) });
    const audio = await caches.open("audio-v1");
    await audio.put("https://audio.example/w/one.mp3?v=0", new Response("OLD"));
    expect(await (await worker.respond(req(AUDIO))).text()).toBe("NEW");
  });
});

describe("pages", () => {
  it("goes to the network first and keeps a copy", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => html("fresh")) });
    const res = await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }));
    expect(await res.text()).toBe("fresh");
    const shell = await caches.open("shell-b2");
    expect(await (await shell.match(page("library/"))).text()).toBe("fresh");
  });

  it("falls back to the copy when the network fails", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => { throw new TypeError("offline"); }) });
    const shell = await caches.open("shell-b2");
    await shell.put(page("library/"), html("cached"));
    const res = await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }));
    expect(await res.text()).toBe("cached");
  });

  it("falls back to the copy when the network is too slow", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(() => new Promise(() => {})), timeoutMs: 10 });
    const shell = await caches.open("shell-b2");
    await shell.put(page("library/"), html("cached"));
    const res = await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }));
    expect(await res.text()).toBe("cached");
  });

  it("a navigation with a query string finds the cached page offline, not the Offline page", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => { throw new TypeError("offline"); }) });
    const shell = await caches.open("shell-b2");
    await shell.put(page("stories/one/"), html("cached story"));
    await shell.put(page("offline/"), html("offline page"));
    const res = await worker.respond(req(page("stories/one/?autoplay=1"), { headers: { Accept: "text/html" } }));
    expect(await res.text()).toBe("cached story");
  });

  it("a slow network serves the cached page for a query-string URL too", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(() => new Promise(() => {})), timeoutMs: 10 });
    const shell = await caches.open("shell-b2");
    await shell.put(page("stories/one/"), html("cached story"));
    const res = await worker.respond(req(page("stories/one/?autoplay=1"), { headers: { Accept: "text/html" } }));
    expect(await res.text()).toBe("cached story");
  });

  it("hands the background refresh to waitUntil", async () => {
    const fetch = vi.fn(() => new Promise((r) => setTimeout(() => r(html("late")), 40)));
    const { caches, worker } = setup({ fetch, timeoutMs: 10 });
    const shell = await caches.open("shell-b2");
    await shell.put(page("library/"), html("cached"));
    const waitUntil = vi.fn();
    await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }), waitUntil);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
  });

  it("shows the Offline page for a page that was never saved", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => { throw new TypeError("offline"); }) });
    const shell = await caches.open("shell-b2");
    await shell.put(page("offline/"), html("offline page"));
    const res = await worker.respond(req(page("stories/never/"), { headers: { Accept: "text/html" } }));
    expect(await res.text()).toBe("offline page");
  });

  it("does not keep a redirected response (a navigation cannot use one)", async () => {
    const redirected = html("moved");
    Object.defineProperty(redirected, "redirected", { value: true });
    const { caches, worker } = setup({ fetch: vi.fn(async () => redirected) });
    await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }));
    const shell = await caches.open("shell-b2");
    expect(await shell.match(page("library/"))).toBeUndefined();
  });
});

describe("assets and library.json", () => {
  it("serves an asset from the cache first, ignoring a different ?v= when the exact one is missing", async () => {
    const { caches, worker, fetch } = setup();
    const shell = await caches.open("shell-b2");
    await shell.put(page("assets/css/base.css?v=b2"), new Response("css"));
    expect(await (await worker.respond(req(page("assets/css/base.css?v=b2")))).text()).toBe("css");
    expect(await (await worker.respond(req(page("assets/css/base.css?v=old")))).text()).toBe("css");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches and keeps an asset it has not seen", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => new Response("new")) });
    expect(await (await worker.respond(req(page("assets/js/x.mjs?v=b2")))).text()).toBe("new");
    const shell = await caches.open("shell-b2");
    expect(await shell.match(page("assets/js/x.mjs?v=b2"))).toBeDefined();
  });

  it("library.json is network first and falls back to any cached version", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => { throw new TypeError("offline"); }) });
    const shell = await caches.open("shell-b2");
    await shell.put(page("library.json?v=b2"), new Response("{}"));
    expect(await (await worker.respond(req(page("library.json?v=zzz")))).text()).toBe("{}");
  });
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const audioStub = (url, headers = {}) => ({ url, method: "GET", destination: "audio", mode: "no-cors", headers: new Headers(headers) });
const seed = async (caches, url, extra = {}) => {
  const audio = await caches.open("audio-v1");
  await audio.put(url, new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { headers: { "Content-Type": "audio/mpeg", ...extra } }));
};

describe("hardening", () => {
  it("a cache write that throws never breaks the response", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => html("fresh")) });
    const shell = await caches.open("shell-b2");
    shell.put = async () => { throw new DOMException("full", "QuotaExceededError"); };
    expect(await (await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }))).text()).toBe("fresh");
    expect(await (await worker.respond(req(page("assets/js/y.mjs")))).text()).toBe("fresh");
    await flush();
  });

  it("does not wait for the cache write before answering", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => html("fresh")) });
    const shell = await caches.open("shell-b2");
    shell.put = () => new Promise(() => {});
    expect(await (await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }))).text()).toBe("fresh");
    expect(await (await worker.respond(req(page("assets/js/z.mjs")))).text()).toBe("fresh");
  });

  it("does not cache a 206 or a 404", async () => {
    for (const status of [206, 404]) {
      const { caches, worker } = setup({ fetch: vi.fn(async () => new Response("x", { status })) });
      await worker.respond(req(page("assets/js/p.mjs")));
      await worker.respond(req(page("stories/p/"), { headers: { Accept: "text/html" } }));
      await flush();
      const shell = await caches.open("shell-b2");
      expect(shell.entries.size).toBe(0);
    }
  });

  it("a slow network with no cached copy still waits for the real answer", async () => {
    const fetch = vi.fn(() => new Promise((r) => setTimeout(() => r(html("late")), 40)));
    const { worker } = setup({ fetch, timeoutMs: 10 });
    const res = await worker.respond(req(page("stories/new/"), { headers: { Accept: "text/html" } }));
    expect(await res.text()).toBe("late");
  });

  it("a slow network with a copy serves the copy, and the late answer refreshes it", async () => {
    const fetch = vi.fn(() => new Promise((r) => setTimeout(() => r(html("late")), 40)));
    const { caches, worker } = setup({ fetch, timeoutMs: 10 });
    const shell = await caches.open("shell-b2");
    await shell.put(page("library/"), html("cached"));
    expect(await (await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }))).text()).toBe("cached");
    await new Promise((r) => setTimeout(r, 80));
    expect(await (await shell.match(page("library/"))).text()).toBe("late");
  });

  it("precache bypasses the HTTP cache and rejects redirects", async () => {
    const fetch = vi.fn(async () => html("ok"));
    await setup({ fetch }).worker.install();
    expect(fetch.mock.calls.every(([, init]) => init?.cache === "reload")).toBe(true);
    const moved = html("moved");
    Object.defineProperty(moved, "redirected", { value: true });
    await expect(setup({ fetch: vi.fn(async () => moved) }).worker.install()).rejects.toThrow();
  });

  it("a failing cache delete does not mask the install error", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => new Response("no", { status: 500 })) });
    caches.delete = async () => { throw new Error("delete failed"); };
    await expect(worker.install()).rejects.toThrow(/precache/);
  });

  it("activate leaves non-shell caches alone", async () => {
    const { caches, worker } = setup();
    await caches.open("audio-v1");
    await caches.open("something-else");
    await caches.open("shell-old");
    await worker.activate();
    expect(await caches.keys()).toEqual(["audio-v1", "something-else"]);
  });

  it("matches audio by destination, even for a non-.mp3 cross-origin URL", async () => {
    const url = "https://audio.example/w/stream?v=1";
    const { caches, worker, fetch } = setup();
    await seed(caches, url);
    const stub = audioStub(url, { Range: "bytes=2-3" });
    expect(worker.shouldHandle(stub)).toBe(true);
    const res = await worker.respond(stub);
    expect(res.status).toBe(206);
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([2, 3]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("answers open-ended, suffix and unsatisfiable ranges from the cache", async () => {
    const { caches, worker } = setup();
    await seed(caches, AUDIO, { ETag: "\"abc\"", "Last-Modified": "Wed, 01 Jan 2025 00:00:00 GMT" });
    const open = await worker.respond(req(AUDIO, { headers: { Range: "bytes=8-" } }));
    expect(open.status).toBe(206);
    expect(open.headers.get("Content-Range")).toBe("bytes 8-9/10");
    expect(open.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(open.headers.get("Content-Length")).toBe("2");
    expect(open.headers.get("Accept-Ranges")).toBe("bytes");
    expect(open.headers.get("ETag")).toBe("\"abc\"");
    expect(open.headers.get("Last-Modified")).toBe("Wed, 01 Jan 2025 00:00:00 GMT");
    const suffix = await worker.respond(req(AUDIO, { headers: { Range: "bytes=-3" } }));
    expect(suffix.headers.get("Content-Range")).toBe("bytes 7-9/10");
    const bad = await worker.respond(req(AUDIO, { headers: { Range: "bytes=50-" } }));
    expect(bad.status).toBe(416);
    expect(bad.headers.get("Content-Range")).toBe("bytes */10");
  });

  it("matches saved audio even if the stored response has a Vary header", async () => {
    const { caches, worker } = setup();
    await seed(caches, AUDIO);
    const audio = await caches.open("audio-v1");
    const calls = [];
    const orig = audio.match;
    audio.match = (k, o) => { calls.push(o); return orig(k, o); };
    await worker.respond(req(AUDIO));
    expect(calls[0]?.ignoreVary).toBe(true);
  });
});
