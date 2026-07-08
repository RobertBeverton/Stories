import { describe, it, expect } from "vitest";
import { computeStories, groupForLibrary } from "./stories-lib.mjs";

// NOTE: this test targets scripts/stories-lib.mjs (the pure URL/prevNext
// computation extracted out of site/_data/stories.js), not stories.js
// itself, for two reasons:
//   1. site/_data/stories.js must keep `export default` as its ONLY export,
//      or Eleventy's global data loader silently stops invoking it (see the
//      comment at the top of stories-lib.mjs).
//   2. It also means this test lives in scripts/ rather than under
//      site/_data/ — Eleventy imports every .js/.mjs file directly under
//      site/_data/ as a global data module, so a co-located *.test.mjs there
//      would break `npx @11ty/eleventy` too. Keeping it in scripts/ matches
//      the existing scripts/validate-content.test.mjs convention instead.

// Fixture helper: builds a { file, data, content } record like
// parseStoryFile() would produce, defaulting the fields computeStories()
// relies on so each test only needs to override what it cares about.
function makeStory(file, overrides = {}) {
  return {
    file,
    data: {
      title: "Untitled",
      description: "A story.",
      publishDate: "2026-01-01",
      ...overrides,
    },
    content: "word ".repeat(215), // exactly 1 readMinute of content by default
  };
}

describe("computeStories", () => {
  it("builds a series story's url from the slugified series name, not the folder name", () => {
    const stories = computeStories([
      makeStory("stories/bramble-wall/book-1.md", {
        title: "Book One",
        series: "The Bramble Wall",
        seriesOrder: 1,
      }),
    ]);
    expect(stories[0].url).toBe("/Stories/stories/the-bramble-wall/book-1/");
  });

  it("builds a flat url for a story with no series", () => {
    const stories = computeStories([
      makeStory("stories/standalone-tale.md", { title: "Standalone Tale" }),
    ]);
    expect(stories[0].url).toBe("/Stories/stories/standalone-tale/");
    expect(stories[0].url).not.toContain("undefined");
  });

  it("builds audioUrl from the real on-disk folder name, not the slugified series name", () => {
    const stories = computeStories([
      makeStory("stories/bramble-wall/book-1.md", {
        title: "Book One",
        series: "The Bramble Wall",
        seriesOrder: 1,
        audio: "book-1.mp3",
      }),
    ]);
    // Regression guard: the page URL uses slugify(series) ("the-bramble-wall"),
    // but the passthrough-copied MP3 keeps the real folder name
    // ("bramble-wall"). audioUrl must use the latter or the <audio> tag 404s.
    expect(stories[0].audioUrl).toBe("/Stories/stories/bramble-wall/book-1.mp3");
    expect(stories[0].audioUrl).not.toContain("the-bramble-wall");
  });

  it("returns null audioUrl when frontmatter has no audio field", () => {
    const stories = computeStories([
      makeStory("stories/standalone-tale.md", { title: "Standalone Tale" }),
    ]);
    expect(stories[0].audioUrl).toBeNull();
  });

  it("links prevStory/nextStory between two sequential entries in the same series", () => {
    const stories = computeStories([
      makeStory("stories/bramble-wall/book-1.md", {
        title: "Book One",
        series: "The Bramble Wall",
        seriesOrder: 1,
        publishDate: "2026-01-01",
      }),
      makeStory("stories/bramble-wall/book-2.md", {
        title: "Book Two",
        series: "The Bramble Wall",
        seriesOrder: 2,
        publishDate: "2026-02-01",
      }),
    ]);

    const bySlug = stories.bySlug;
    expect(bySlug["book-1"].prevStory).toBeNull();
    expect(bySlug["book-1"].nextStory).toEqual({
      url: "/Stories/stories/the-bramble-wall/book-2/",
      title: "Book Two",
    });

    expect(bySlug["book-2"].prevStory).toEqual({
      url: "/Stories/stories/the-bramble-wall/book-1/",
      title: "Book One",
    });
    expect(bySlug["book-2"].nextStory).toBeNull();
  });

  it("gives a story with no series null prevStory/nextStory without crashing", () => {
    const stories = computeStories([
      makeStory("stories/standalone-tale.md", { title: "Standalone Tale" }),
    ]);
    const entry = stories.bySlug["standalone-tale"];
    expect(entry.prevStory).toBeNull();
    expect(entry.nextStory).toBeNull();
  });

  it("defaults tags to an empty array when absent from frontmatter", () => {
    const stories = computeStories([
      makeStory("stories/standalone-tale.md", { title: "Standalone Tale" }),
    ]);
    expect(stories[0].tags).toEqual([]);
  });
});

describe("groupForLibrary", () => {
  it("groups stories by series, ordered by seriesOrder", () => {
    const stories = computeStories([
      makeStory("stories/a/book-2.md", { series: "The Bramble Wall", seriesOrder: 2, title: "Book 2" }),
      makeStory("stories/a/book-1.md", { series: "The Bramble Wall", seriesOrder: 1, title: "Book 1" }),
    ]);
    const result = groupForLibrary(stories);
    expect(result.seriesGroups).toHaveLength(1);
    expect(result.seriesGroups[0].series).toBe("The Bramble Wall");
    expect(result.seriesGroups[0].stories.map((s) => s.title)).toEqual(["Book 1", "Book 2"]);
  });

  it("includes an accentColor on each series group", () => {
    const stories = computeStories([
      makeStory("stories/a/book-1.md", { series: "The Bramble Wall", seriesOrder: 1 }),
    ]);
    const result = groupForLibrary(stories);
    expect(result.seriesGroups[0].accentColor).toHaveProperty("background");
    expect(result.seriesGroups[0].accentColor).toHaveProperty("text");
  });

  it("puts stories with no series into standalone, not a series group", () => {
    const stories = computeStories([
      makeStory("stories/standalone-tale.md", { title: "Lonely Tale" }),
    ]);
    const result = groupForLibrary(stories);
    expect(result.seriesGroups).toHaveLength(0);
    expect(result.standalone.map((s) => s.title)).toEqual(["Lonely Tale"]);
  });

  it("returns an empty standalone array (not omitted) when there are none", () => {
    const stories = computeStories([
      makeStory("stories/a/book-1.md", { series: "The Bramble Wall", seriesOrder: 1 }),
    ]);
    const result = groupForLibrary(stories);
    expect(result.standalone).toEqual([]);
  });

  it("sorts multiple series groups by each group's earliest publishDate, most recent first", () => {
    const stories = computeStories([
      makeStory("stories/old/book-1.md", { series: "Old Series", seriesOrder: 1, publishDate: "2025-01-01" }),
      makeStory("stories/new/book-1.md", { series: "New Series", seriesOrder: 1, publishDate: "2026-01-01" }),
    ]);
    const result = groupForLibrary(stories);
    expect(result.seriesGroups.map((g) => g.series)).toEqual(["New Series", "Old Series"]);
  });
});
