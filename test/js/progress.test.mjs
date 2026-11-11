// @vitest-environment jsdom
// Behaviour spec for the progress store and escaping, using the shared fixtures.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, safeHref } from "../../site/assets/js/escape.mjs";
import {
  markCompleted, playCount, read, readAll, readPlays, toViewModel, write,
} from "../../site/assets/js/progress.mjs";
import { library, NOW, progressV1, progressV2, seed, useFixedNow } from "./helpers.mjs";

const KEY = (slug) => `story-progress:${slug}`;
const stored = (slug) => JSON.parse(localStorage.getItem(KEY(slug)));

beforeEach(() => {
  localStorage.clear();
  useFixedNow();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("progress store", () => {
  it("reads v1 records, ignoring url/title/artworkUrl, and normalises to v2", () => {
    seed(progressV1);
    const record = read("test-world/first-tale");
    expect(record).toEqual({
      v: 2, audioTime: 120.5, scrollY: 800, playing: false, savedAt: 1790000000000,
    });
    const all = readAll();
    expect(Object.keys(all).sort()).toEqual(["test-world/first-tale", "test-world/second-tale"]);
    expect(JSON.stringify(all)).not.toContain("onerror");
  });

  it("reads a bare v1 page-visit record (title and url only) as no progress", () => {
    seed({ "test-world/first-tale": { url: "/x/", title: "T", savedAt: 5 } });
    const record = read("test-world/first-tale");
    expect(record).toEqual({ v: 2, audioTime: 0, scrollY: 0, playing: false, savedAt: 5 });
    expect(toViewModel(record).state).toBe("new");
  });

  it("reads v2 fixtures as they are", () => {
    seed(progressV2);
    expect(read("test-world/first-tale")).toEqual(progressV2["test-world/first-tale"]);
    expect(read("test-world/second-tale").completedAt).toBe(1790000300000);
  });

  it("rewrites a v1 record as v2 on next write, dropping url/title/artworkUrl", () => {
    seed(progressV1);
    write("test-world/first-tale", { audioTime: 130 });
    const raw = stored("test-world/first-tale");
    expect(raw).toEqual({
      v: 2, audioTime: 130, scrollY: 800, playing: false, savedAt: NOW,
    });
    expect(raw).not.toHaveProperty("url");
    expect(raw).not.toHaveProperty("title");
    expect(raw).not.toHaveProperty("artworkUrl");
  });

  it("readAll skips corrupt JSON and records failing the v2 check", () => {
    seed({
      "ok/one": progressV2["test-world/first-tale"],
      "bad/json": "{not json",
      "bad/null": "null",
      "bad/array": "[1,2]",
      "bad/string-time": { v: 2, audioTime: "5", scrollY: 0, playing: false, savedAt: 1 },
      "bad/negative": { v: 2, audioTime: -1, scrollY: 0, playing: false, savedAt: 1 },
      "bad/playing": { v: 2, audioTime: 1, scrollY: 0, playing: "yes", savedAt: 1 },
      "bad/missing": { v: 2, audioTime: 1 },
      "bad/extra-field": { v: 2, audioTime: 1, scrollY: 0, playing: false, savedAt: 1, url: "/x/" },
      "bad/future": { v: 3, audioTime: 1, scrollY: 0, playing: false, savedAt: 1 },
      "bad/v1-nan": { audioTime: "soon", savedAt: 1 },
    });
    localStorage.setItem("unrelated-key", "{}");
    localStorage.setItem("story-progress:", JSON.stringify(progressV2["test-world/first-tale"]));
    expect(Object.keys(readAll())).toEqual(["ok/one"]);
    expect(read("bad/json")).toBeNull();
  });

  it("write merges partial updates and stamps savedAt", () => {
    expect(read("a/b")).toBeNull();
    write("a/b", { audioTime: 10 });
    vi.setSystemTime(NOW + 5000);
    write("a/b", { scrollY: 300, playing: true });
    expect(stored("a/b")).toEqual({
      v: 2, audioTime: 10, scrollY: 300, playing: true, savedAt: NOW + 5000,
    });
  });

  it("write ignores unknown fields and invalid values", () => {
    write("a/b", { audioTime: 10, title: "x", url: "/y/", scrollY: -4, playing: "yes", completedAt: NaN });
    expect(stored("a/b")).toEqual({
      v: 2, audioTime: 10, scrollY: 0, playing: false, savedAt: NOW,
    });
  });

  it("write announces stories:progress with the slug", () => {
    const seen = [];
    document.addEventListener("stories:progress", (e) => seen.push(e.detail.slug));
    write("a/b", { audioTime: 1 });
    markCompleted("c/d");
    expect(seen).toEqual(["a/b", "c/d"]);
  });

  it("markCompleted sets completedAt and resets audioTime", () => {
    seed(progressV2);
    const record = markCompleted("test-world/first-tale");
    expect(record).toEqual({
      v: 2, audioTime: 0, scrollY: 1200, playing: false, savedAt: NOW, completedAt: NOW,
    });
    expect(stored("test-world/first-tale")).toEqual(record);
  });

  it("counts one listen per finish, and not twice for the same listen", () => {
    expect(playCount("a/b")).toBe(0);
    markCompleted("a/b");
    expect(playCount("a/b")).toBe(1);
    markCompleted("a/b"); // `ended` and the foreground check can both fire for one listen
    expect(playCount("a/b")).toBe(1);

    write("a/b", { audioTime: 30, playing: true }); // a real replay, past the threshold
    markCompleted("a/b");
    expect(playCount("a/b")).toBe(2);
    expect(JSON.parse(localStorage.getItem("story-plays:a/b"))).toEqual({ n: 2 });
  });

  it("a story finished before counts existed is 1, and the next finish makes it 2", () => {
    localStorage.setItem(KEY("old/tale"), JSON.stringify({ v: 2, audioTime: 40, scrollY: 0, playing: false, savedAt: 5, completedAt: 3 }));
    expect(playCount("old/tale")).toBe(1);
    markCompleted("old/tale");
    expect(playCount("old/tale")).toBe(2);
  });

  it("readPlays lists only stories heard at least once, from counts or old completions", () => {
    markCompleted("a/b");
    localStorage.setItem(KEY("old/tale"), JSON.stringify({ v: 2, audioTime: 0, scrollY: 0, playing: false, savedAt: 5, completedAt: 3 }));
    write("c/d", { audioTime: 200 }); // started, never finished
    expect(readPlays()).toEqual({ "a/b": 1, "old/tale": 1 });
  });

  it("junk in a play count key is ignored, and counts do not touch the v2 record", () => {
    localStorage.setItem("story-plays:x/y", "not json");
    localStorage.setItem("story-plays:p/q", JSON.stringify({ n: -4 }));
    expect(playCount("x/y")).toBe(0);
    expect(playCount("p/q")).toBe(0);
    markCompleted("a/b");
    expect(Object.keys(stored("a/b")).sort()).toEqual(["audioTime", "completedAt", "playing", "savedAt", "scrollY", "v"]);
    expect(readAll()["a/b"]).toBeTruthy();
    expect(Object.keys(readAll())).toEqual(["a/b"]); // play keys are not progress records
  });

  it("replay: completedAt survives; counts as in progress again only after 10s of playback", () => {
    markCompleted("a/b");
    const completedAt = read("a/b").completedAt;
    expect(toViewModel(read("a/b"), { durationSec: 600 }).state).toBe("finished");

    write("a/b", { audioTime: 6, playing: true }); // replay under way, under the threshold
    expect(read("a/b").completedAt).toBe(completedAt);
    expect(toViewModel(read("a/b"), { durationSec: 600 }).state).toBe("finished");

    write("a/b", { audioTime: 10 }); // exactly 10s is not "after"
    expect(toViewModel(read("a/b"), { durationSec: 600 }).state).toBe("finished");

    write("a/b", { audioTime: 10.5 });
    const vm = toViewModel(read("a/b"), { durationSec: 600 });
    expect(vm.state).toBe("in-progress");
    expect(read("a/b").completedAt).toBe(completedAt); // still remembered
    expect(vm.fraction).toBeCloseTo(10.5 / 600);
  });

  it("toViewModel returns new / in-progress / finished and a 0..1 fraction", () => {
    expect(toViewModel(null)).toEqual({ state: "new", fraction: 0 });
    const base = { v: 2, audioTime: 0, scrollY: 0, playing: false, savedAt: 1 };
    expect(toViewModel(base)).toEqual({ state: "new", fraction: 0 });
    expect(toViewModel({ ...base, audioTime: 0.4 }).state).toBe("new");
    expect(toViewModel({ ...base, audioTime: 300 }, { durationSec: 600 })).toEqual({ state: "in-progress", fraction: 0.5 });
    expect(toViewModel({ ...base, audioTime: 300 }).fraction).toBe(0); // unknown duration
    expect(toViewModel({ ...base, audioTime: 900 }, { durationSec: 600 }).fraction).toBe(1); // clamped
    expect(toViewModel({ ...base, scrollY: 500 }).state).toBe("in-progress"); // read, not heard
    expect(toViewModel({ ...base, scrollY: 100 }).state).toBe("new");
    expect(toViewModel({ ...base, completedAt: 2 })).toEqual({ state: "finished", fraction: 1 });
  });

  it("never throws when localStorage is unavailable", () => {
    const throwing = {
      get length() { throw new Error("blocked"); },
      key() { throw new Error("blocked"); },
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("quota"); },
      removeItem() { throw new Error("blocked"); },
    };
    vi.stubGlobal("localStorage", throwing);
    expect(readAll()).toEqual({});
    expect(read("a/b")).toBeNull();
    expect(write("a/b", { audioTime: 1 })).toBeNull();
    expect(markCompleted("a/b")).toBeNull();

    vi.stubGlobal("localStorage", undefined);
    expect(readAll()).toEqual({});
    expect(write("a/b", { audioTime: 1 })).toBeNull();
  });

  it("never throws when reading localStorage itself throws", () => {
    vi.spyOn(globalThis, "localStorage", "get").mockImplementation(() => { throw new Error("SecurityError"); });
    expect(readAll()).toEqual({});
    expect(read("a/b")).toBeNull();
    expect(write("a/b", {})).toBeNull();
  });
});

describe("escape.mjs", () => {
  const hostile = library.stories[1].title; // contains <, >, & and quotes on purpose

  it("neutralises <, >, &, quotes (fixture title with <img onerror>)", () => {
    expect(escapeHtml(hostile)).toBe("The &lt;Second&gt; &amp; &quot;Quoted&quot; Tale");
    const nasty = progressV1["test-world/second-tale"].title;
    const escaped = escapeHtml(nasty);
    expect(escaped).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(escaped).not.toMatch(/[<>]/);
    expect(escapeHtml(`'"&\``)).toBe("&#39;&quot;&amp;&#96;");

    const holder = document.createElement("div");
    holder.innerHTML = escaped; // inert once escaped
    expect(holder.querySelector("img")).toBeNull();
    expect(holder.textContent).toBe(nasty);
  });

  it("escapes non-strings and nullish values to text", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });

  it("safeHref only lets same-site paths through", () => {
    expect(safeHref("/Stories/stories/x/")).toBe("/Stories/stories/x/");
    for (const bad of ['/evil"><img src=x onerror=alert(1)>'.replace("/", "x"), "javascript:alert(1)", "//evil.example", "/\\evil.example", "https://evil.example", "", null, undefined, 5, "/a\nb"]) {
      expect(safeHref(bad)).toBe("#");
    }
  });
});
