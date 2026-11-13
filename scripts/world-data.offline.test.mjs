import { describe, expect, it } from "vitest";
import { buildLibrary, sanitizeWorldData } from "./world-data.mjs";
import { computeStories } from "./stories-lib.mjs";
import { checkLibrary } from "./schema/validate.mjs";

// Invented placeholder data only.
const source = { name: "alpha", title: "Alpha", tagline: "Invented.", accent: "sage", icon: "sun" };
const raw = (data) => ({ file: "stories/one.md", data: { title: "One", publishDate: "2026-10-01", ...data }, content: "Words." });
const run = (data) =>
  sanitizeWorldData({ rawStories: [raw(data)], manifest: { "one.md": "alpha" }, worldNames: ["alpha"], loreFiles: [] });

describe("audioBytes", () => {
  it("is kept when it is a positive whole number", () => {
    expect(run({ audioBytes: 9_600_000 }).rawStories[0].data.audioBytes).toBe(9_600_000);
  });

  it.each([0, -5, 1.5, "9", null])("is dropped with a warning when it is %s", (bad) => {
    const result = run({ audioBytes: bad });
    expect(result.rawStories[0].data.audioBytes).toBeUndefined();
    expect(result.warnings.some((w) => /audioBytes/.test(w.message))).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("buildLibrary audio fields", () => {
  const stories = (data) =>
    computeStories(
      sanitizeWorldData({ rawStories: [raw(data)], manifest: { "one.md": "alpha" }, worldNames: ["alpha"], loreFiles: [] }).rawStories,
      () => false, // no sibling mp3 on disk (the default predicate says every file exists)
    );

  it("emits audioUrl and audioBytes and still validates", () => {
    const library = buildLibrary({
      stories: stories({ audioUrl: "https://audio.kinly.download/alpha/one.mp3?v=abc", audioBytes: 123456, audioDuration: 60 }),
      sources: [source],
      lore: [],
    });
    expect(library.stories[0].audioUrl).toBe("https://audio.kinly.download/alpha/one.mp3?v=abc");
    expect(library.stories[0].audioBytes).toBe(123456);
    expect(checkLibrary(library).ok).toBe(true);
  });

  it("omits both when the story has no audio", () => {
    const library = buildLibrary({ stories: stories({}), sources: [source], lore: [] });
    expect("audioUrl" in library.stories[0]).toBe(false);
    expect("audioBytes" in library.stories[0]).toBe(false);
  });
});
