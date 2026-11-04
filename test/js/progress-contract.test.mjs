// Node environment on purpose: scripts/schema/validate.mjs reads the schema from
// disk and cannot load under jsdom. This file proves everything progress.mjs
// writes or returns passes the shared v2 check, and that the store works with
// no DOM at all.
import { beforeEach, describe, expect, it } from "vitest";
import { checkProgressRecord } from "../../scripts/schema/validate.mjs";
import { markCompleted, read, readAll, write } from "../../site/assets/js/progress.mjs";
import { progressV1, progressV2 } from "./helpers-node.mjs";

class MemoryStorage {
  #m = new Map();
  get length() { return this.#m.size; }
  key(i) { return [...this.#m.keys()][i] ?? null; }
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(k, String(v)); }
  removeItem(k) { this.#m.delete(k); }
  clear() { this.#m.clear(); }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

describe("progress records against the shared v2 check", () => {
  it("normalised v1 and v2 fixtures pass checkProgressRecord", () => {
    for (const [slug, record] of Object.entries({ ...progressV1 })) localStorage.setItem(`story-progress:${slug}`, JSON.stringify(record));
    for (const record of Object.values(readAll())) expect(checkProgressRecord(record)).toEqual({ ok: true, errors: [] });
    localStorage.clear();
    for (const [slug, record] of Object.entries(progressV2)) localStorage.setItem(`story-progress:${slug}`, JSON.stringify(record));
    for (const record of Object.values(readAll())) expect(checkProgressRecord(record).ok).toBe(true);
  });

  it("everything written passes checkProgressRecord, with and without completedAt", () => {
    localStorage.setItem("story-progress:a/b", JSON.stringify(progressV1["test-world/first-tale"]));
    const rewritten = write("a/b", { audioTime: 30, playing: true });
    expect(checkProgressRecord(rewritten).ok).toBe(true);
    expect(checkProgressRecord(JSON.parse(localStorage.getItem("story-progress:a/b"))).ok).toBe(true);
    expect(checkProgressRecord(markCompleted("a/b")).ok).toBe(true);
    expect(checkProgressRecord(read("a/b")).ok).toBe(true);
  });

  it("works with no document (no event, no throw)", () => {
    expect(typeof document).toBe("undefined");
    expect(write("a/b", { audioTime: 1 }).audioTime).toBe(1);
  });
});
