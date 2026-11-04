import { describe, expect, it } from "vitest";
import { computeStories } from "./stories-lib.mjs";

const story = (name, data) => ({
  file: `stories/w/${name}.md`,
  data: { title: name, publishDate: "2026-01-01", series: "S", ...data },
  content: "text",
});

describe("drafts", () => {
  const raw = [
    story("one", { seriesOrder: 1 }),
    story("two", { seriesOrder: 2, draft: true }),
    story("three", { seriesOrder: 3 }),
  ];
  const result = computeStories(raw);

  it("are left out of the list and of the slug lookup, so no page is built for them", () => {
    expect(result.map((s) => s.title).sort()).toEqual(["one", "three"]);
    expect(Object.keys(result.bySlug)).toHaveLength(2);
    expect(Object.values(result.bySlug).map((s) => s.title).sort()).toEqual(["one", "three"]);
  });

  it("are skipped by previous and next links", () => {
    const by = (title) => Object.values(result.bySlug).find((s) => s.title === title);
    expect(by("one").nextStory.title).toBe("three");
    expect(by("three").prevStory.title).toBe("one");
  });
});
