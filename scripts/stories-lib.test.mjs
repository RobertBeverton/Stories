import { describe, it, expect } from "vitest";
import { computeStories } from "./stories-lib.mjs";

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
});
