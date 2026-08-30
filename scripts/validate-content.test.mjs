import { describe, it, expect } from "vitest";
import {
  checkRequiredFields,
  checkDuplicateSlugs,
  checkAudioFilesExistOrWarn,
  checkRepoSize,
} from "./validate-content.mjs";

describe("checkRequiredFields", () => {
  it("flags missing title/description/publishDate", () => {
    const stories = [{ file: "stories/a.md", data: {} }];
    const errors = checkRequiredFields(stories);
    expect(errors).toContain("stories/a.md: missing required field 'title'");
    expect(errors).toContain("stories/a.md: missing required field 'description'");
    expect(errors).toContain("stories/a.md: missing required field 'publishDate'");
  });

  it("passes when all required fields present", () => {
    const stories = [
      { file: "stories/a.md", data: { title: "A", description: "d", publishDate: "2026-01-01" } },
    ];
    expect(checkRequiredFields(stories)).toEqual([]);
  });
});

describe("checkDuplicateSlugs", () => {
  it("flags duplicate slugs", () => {
    const stories = [
      { file: "stories/a.md", slug: "a" },
      { file: "stories/b.md", slug: "a" },
    ];
    const errors = checkDuplicateSlugs(stories);
    expect(errors).toEqual(["Duplicate slug 'a': stories/a.md, stories/b.md"]);
  });
});

describe("checkAudioFilesExistOrWarn", () => {
  it("returns a warning when audio is missing", () => {
    const stories = [{ file: "stories/a.md", data: { audio: "a.mp3" } }];
    const warnings = checkAudioFilesExistOrWarn(stories, () => false);
    expect(warnings).toEqual(["stories/a.md: audio file 'a.mp3' not found (warning only, build not blocked)"]);
  });

  it("is silent when audio field is absent", () => {
    const stories = [{ file: "stories/a.md", data: {} }];
    const warnings = checkAudioFilesExistOrWarn(stories, () => false);
    expect(warnings).toEqual([]);
  });

  it("is silent when the audio file exists", () => {
    const stories = [{ file: "stories/a.md", data: { audio: "a.mp3" } }];
    const warnings = checkAudioFilesExistOrWarn(stories, () => true);
    expect(warnings).toEqual([]);
  });

  it("aggregates one warning per story missing audio", () => {
    const stories = [
      { file: "stories/a.md", data: { audio: "a.mp3" } },
      { file: "stories/b.md", data: { audio: "b.mp3" } },
    ];
    const warnings = checkAudioFilesExistOrWarn(stories, () => false);
    expect(warnings).toEqual([
      "stories/a.md: audio file 'a.mp3' not found (warning only, build not blocked)",
      "stories/b.md: audio file 'b.mp3' not found (warning only, build not blocked)",
    ]);
  });
});

describe("checkRepoSize", () => {
  it("flags total size over threshold", () => {
    const errors = checkRepoSize([600, 600], 1000, 900);
    expect(errors.some((e) => e.includes("exceeds guard threshold"))).toBe(true);
  });
});

describe("errors and warnings independence", () => {
  it("a story with both a missing required field and missing audio produces both an error and a warning, independently", () => {
    const stories = [{ file: "stories/a.md", data: { audio: "a.mp3" }, slug: "a" }];
    const fieldErrors = checkRequiredFields(stories);
    const audioWarnings = checkAudioFilesExistOrWarn(stories, () => false);
    expect(fieldErrors.length).toBeGreaterThan(0);
    expect(audioWarnings.length).toBe(1);
  });
});
