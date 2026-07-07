import { describe, it, expect } from "vitest";
import { checkDuplicateSeriesOrder, checkDuplicateSlugs, checkRequiredFields } from "./validate-content.mjs";

describe("checkRequiredFields", () => {
  it("returns an error for a story missing title", () => {
    const stories = [{ file: "a.md", data: { description: "x", publishDate: "2026-01-01" } }];
    const errors = checkRequiredFields(stories);
    expect(errors).toEqual(["a.md: missing required field 'title'"]);
  });

  it("returns no errors when all required fields present", () => {
    const stories = [{ file: "a.md", data: { title: "T", description: "D", publishDate: "2026-01-01" } }];
    expect(checkRequiredFields(stories)).toEqual([]);
  });
});

describe("checkDuplicateSeriesOrder", () => {
  it("flags two stories in the same series with the same seriesOrder", () => {
    const stories = [
      { file: "a.md", data: { series: "X", seriesOrder: 1 } },
      { file: "b.md", data: { series: "X", seriesOrder: 1 } },
    ];
    expect(checkDuplicateSeriesOrder(stories)).toEqual([
      "Series 'X' has duplicate seriesOrder 1: a.md, b.md",
    ]);
  });

  it("allows same seriesOrder across different series", () => {
    const stories = [
      { file: "a.md", data: { series: "X", seriesOrder: 1 } },
      { file: "b.md", data: { series: "Y", seriesOrder: 1 } },
    ];
    expect(checkDuplicateSeriesOrder(stories)).toEqual([]);
  });
});

describe("checkDuplicateSlugs", () => {
  it("flags two files producing the same slug", () => {
    const stories = [
      { file: "stories/a/book-1.md", data: {}, slug: "book-1" },
      { file: "stories/b/book-1.md", data: {}, slug: "book-1" },
    ];
    expect(checkDuplicateSlugs(stories)).toEqual([
      "Duplicate slug 'book-1': stories/a/book-1.md, stories/b/book-1.md",
    ]);
  });
});
