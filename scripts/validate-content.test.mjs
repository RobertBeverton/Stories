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
  it("returns a warning (not an error) when audio is missing", () => {
    const stories = [{ file: "stories/a.md", data: { audio: "a.mp3" } }];
    const { errors, warnings } = checkAudioFilesExistOrWarn(stories, () => false);
    expect(errors).toEqual([]);
    expect(warnings).toEqual(["stories/a.md: audio file 'a.mp3' not found (warning only, build not blocked)"]);
  });

  it("is silent when audio field is absent", () => {
    const stories = [{ file: "stories/a.md", data: {} }];
    const { errors, warnings } = checkAudioFilesExistOrWarn(stories, () => false);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("is silent when the audio file exists", () => {
    const stories = [{ file: "stories/a.md", data: { audio: "a.mp3" } }];
    const { errors, warnings } = checkAudioFilesExistOrWarn(stories, () => true);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe("checkRepoSize", () => {
  it("flags total size over threshold", () => {
    const errors = checkRepoSize([600, 600], 1000, 900);
    expect(errors.some((e) => e.includes("exceeds guard threshold"))).toBe(true);
  });
});
