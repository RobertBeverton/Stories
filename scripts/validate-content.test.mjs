import { describe, it, expect } from "vitest";
import {
  checkDuplicateSeriesOrder,
  checkDuplicateSlugs,
  checkRequiredFields,
  checkAudioFilesExist,
  checkRepoSize,
} from "./validate-content.mjs";

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

describe("checkAudioFilesExist", () => {
  it("flags a story whose audio file does not exist on disk", () => {
    const stories = [{ file: "stories/a/book-1.md", data: { audio: "missing.mp3" } }];
    const exists = (p) => false;
    expect(checkAudioFilesExist(stories, exists)).toEqual([
      "stories/a/book-1.md: audio file 'missing.mp3' not found",
    ]);
  });

  it("passes when audio file exists", () => {
    const stories = [{ file: "stories/a/book-1.md", data: { audio: "book-1.mp3" } }];
    const exists = (p) => true;
    expect(checkAudioFilesExist(stories, exists)).toEqual([]);
  });

  it("skips stories with no audio field", () => {
    const stories = [{ file: "stories/a/book-1.md", data: {} }];
    expect(checkAudioFilesExist(stories, () => false)).toEqual([]);
  });
});

describe("checkRepoSize", () => {
  it("flags when total size exceeds the max", () => {
    const sizes = Array(10).fill(80 * 1024 * 1024);
    expect(checkRepoSize(sizes, 700 * 1024 * 1024, 90 * 1024 * 1024)).toEqual([
      "Total /stories size 800.0MB exceeds guard threshold 700MB",
    ]);
  });

  it("flags when a single file exceeds the max", () => {
    const sizes = [10 * 1024 * 1024, 95 * 1024 * 1024];
    const errors = checkRepoSize(sizes, 700 * 1024 * 1024, 90 * 1024 * 1024);
    expect(errors).toEqual(["A file in /stories exceeds 90MB (95.0MB)"]);
  });

  it("passes when under both thresholds", () => {
    expect(checkRepoSize([10 * 1024 * 1024], 700 * 1024 * 1024, 90 * 1024 * 1024)).toEqual([]);
  });
});
