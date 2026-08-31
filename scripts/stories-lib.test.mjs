import { describe, it, expect } from "vitest";
import { computeStories, groupForLibrary } from "./stories-lib.mjs";
import { accentColorFor } from "./accent-colors.mjs";

describe("computeStories", () => {
  it("falls back to the default icon when a story's icon field is missing or invalid", () => {
    const raw = [
      { file: "stories/no-icon.md", data: { title: "No Icon", publishDate: "2026-01-01" }, content: "text" },
      {
        file: "stories/bad-icon.md",
        data: { title: "Bad Icon", publishDate: "2026-01-01", icon: "spaceship" },
        content: "text",
      },
    ];
    const result = computeStories(raw);
    expect(result[0].icon).toBe("sun");
    expect(result[1].icon).toBe("sun");
  });

  it("passes through a valid icon unchanged", () => {
    const raw = [
      {
        file: "stories/boat-story.md",
        data: { title: "Boat Story", publishDate: "2026-01-01", icon: "boat" },
        content: "text",
      },
    ];
    const result = computeStories(raw);
    expect(result[0].icon).toBe("boat");
  });

  it("computes each story's own accentColor from its series, so a story-card include renders the right color regardless of which page/loop it appears in", () => {
    const raw = [
      { file: "stories/a/one.md", data: { title: "One", series: "Felix & Alex", publishDate: "2026-01-01" }, content: "text" },
      { file: "stories/standalone.md", data: { title: "Solo", publishDate: "2026-01-02" }, content: "text" },
    ];
    const result = computeStories(raw);
    expect(result.find((s) => s.title === "One").accentColor).toEqual(accentColorFor("Felix & Alex"));
    expect(result.find((s) => s.title === "Solo").accentColor).toEqual(accentColorFor(undefined));
  });
});

describe("groupForLibrary", () => {
  it("returns one merged, ordered list of arc and standalone groups", () => {
    const raw = [
      { file: "stories/a/one.md", data: { title: "One", series: "Arc A", seriesOrder: 1, publishDate: "2026-01-01" }, content: "hi" },
      { file: "stories/standalone.md", data: { title: "Solo", publishDate: "2026-01-05" }, content: "hi" },
    ];
    const stories = computeStories(raw);
    const { groups } = groupForLibrary(stories);
    expect(groups).toHaveLength(2);
    // Solo (2026-01-05) is more recent than Arc A's only story (2026-01-01),
    // so it sorts first.
    expect(groups[0].series).toBeNull();
    expect(groups[0].stories[0].title).toBe("Solo");
    expect(groups[1].series).toBe("Arc A");
  });

  it("sorts an arc by its MOST RECENT story, not its earliest — adding a new story to an old arc pushes it back to the top", () => {
    const raw = [
      { file: "stories/a/one.md", data: { title: "One", series: "Arc A", seriesOrder: 1, publishDate: "2026-01-01" }, content: "hi" },
      { file: "stories/a/two.md", data: { title: "Two", series: "Arc A", seriesOrder: 2, publishDate: "2026-06-01" }, content: "hi" },
      { file: "stories/b/one.md", data: { title: "B One", series: "Arc B", seriesOrder: 1, publishDate: "2026-03-01" }, content: "hi" },
    ];
    const stories = computeStories(raw);
    const { groups } = groupForLibrary(stories);
    // Arc A's newest story (2026-06-01) beats Arc B's only story (2026-03-01).
    expect(groups[0].series).toBe("Arc A");
    expect(groups[1].series).toBe("Arc B");
  });

  it("wraps every standalone story as its own group with a neutral accent color and null series", () => {
    const raw = [
      { file: "stories/standalone.md", data: { title: "Solo", publishDate: "2026-01-05" }, content: "hi" },
    ];
    const stories = computeStories(raw);
    const { groups } = groupForLibrary(stories);
    expect(groups[0].series).toBeNull();
    expect(groups[0].accentColor).toEqual(accentColorFor(undefined));
    expect(groups[0].stories).toHaveLength(1);
  });

  it("takes keyIslands/characters from the arc's first story only (by seriesOrder)", () => {
    const raw = [
      { file: "stories/a/one.md", data: { title: "One", series: "Arc A", seriesOrder: 1, publishDate: "2026-01-01", keyIslands: ["Isle A"], characters: ["Nib"] }, content: "hi" },
      { file: "stories/a/two.md", data: { title: "Two", series: "Arc A", seriesOrder: 2, publishDate: "2026-06-01", keyIslands: ["Isle B"], characters: ["Someone Else"] }, content: "hi" },
    ];
    const stories = computeStories(raw);
    const { groups } = groupForLibrary(stories);
    expect(groups[0].keyIslands).toEqual(["Isle A"]);
    expect(groups[0].characters).toEqual(["Nib"]);
  });
});
