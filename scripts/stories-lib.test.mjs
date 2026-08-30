import { describe, it, expect } from "vitest";
import { computeStories, seriesPageData } from "./stories-lib.mjs";
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

describe("seriesPageData", () => {
  it("groups computed stories by series into page-ready records with slug, accent color, and ordered stories", () => {
    const raw = [
      { file: "stories/a/one.md", data: { title: "One", series: "Felix & Alex", seriesOrder: 2, publishDate: "2026-01-02" }, content: "hi" },
      { file: "stories/a/two.md", data: { title: "Two", series: "Felix & Alex", seriesOrder: 1, publishDate: "2026-01-01" }, content: "hi" },
      { file: "stories/standalone.md", data: { title: "Solo", publishDate: "2026-01-03" }, content: "hi" },
    ];
    const stories = computeStories(raw);
    const pages = seriesPageData(stories);
    expect(pages).toHaveLength(1);
    expect(pages[0].seriesSlug).toBe("felix-alex");
    expect(pages[0].stories.map((s) => s.title)).toEqual(["Two", "One"]); // ordered by seriesOrder
    expect(pages[0].accentColor).toBeDefined();
  });
});
