import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { checkLibrary, checkProgressRecord } from "../scripts/schema/validate.mjs";

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const json = (name) => JSON.parse(fixture(name));

describe("library.json contract", () => {
  it("accepts the shared fixture", () => {
    expect(checkLibrary(json("library.json"))).toEqual({ ok: true, errors: [] });
  });

  it("accepts an empty index", () => {
    expect(checkLibrary({ stories: [], worlds: [], lore: [] }).ok).toBe(true);
  });

  it("rejects a story missing required fields", () => {
    const lib = json("library.json");
    delete lib.stories[0].world;
    expect(checkLibrary(lib).ok).toBe(false);
  });

  it("rejects unknown fields (so packages cannot drift)", () => {
    const lib = json("library.json");
    lib.stories[0].audioTime = 4;
    expect(checkLibrary(lib).ok).toBe(false);
  });

  it("rejects a part without a numeric start", () => {
    const lib = json("library.json");
    lib.stories[0].parts[0].start = "0";
    expect(checkLibrary(lib).ok).toBe(false);
  });
});

describe("progress record v2 contract", () => {
  it("accepts the v2 fixtures", () => {
    for (const rec of Object.values(json("progress-v2.json"))) {
      expect(checkProgressRecord(rec)).toEqual({ ok: true, errors: [] });
    }
  });

  it("rejects v1 records (they must be normalised first)", () => {
    for (const rec of Object.values(json("progress-v1.json"))) {
      expect(checkProgressRecord(rec).ok).toBe(false);
    }
  });

  it("rejects stored url/title/artwork on a v2 record", () => {
    const rec = { v: 2, audioTime: 1, scrollY: 0, playing: false, savedAt: 1, title: "x" };
    expect(checkProgressRecord(rec).ok).toBe(false);
  });
});

describe("fixtures", () => {
  it("every fixture slug in progress records exists in library.json", () => {
    const slugs = new Set(json("library.json").stories.map((s) => s.slug));
    for (const file of ["progress-v1.json", "progress-v2.json"]) {
      for (const slug of Object.keys(json(file))) expect(slugs.has(slug)).toBe(true);
    }
  });

  it("silent.mp3 is a real MPEG frame stream", () => {
    const bytes = fs.readFileSync(new URL("./fixtures/silent.mp3", import.meta.url));
    expect(bytes[0]).toBe(0xff);
    expect(bytes.length).toBeLessThan(10_000);
  });
});
