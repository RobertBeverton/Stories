import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPronunciations, cleanForNarration, defaultOutPath, extractParts, loadWorldNarration, locateHeadings, packChunks, parseScenes, resolveWorld, storyMarkdown,
} from "./narrate.mjs";

const sources = [
  { name: "isles-of-yum", localPath: "../isles-of-yum", storiesPath: "stories" },
  { name: "bramble-wall", localPath: "../bramble-wall" },
];
const cwd = path.resolve("/work/Stories");

describe("resolveWorld", () => {
  it("finds the world whose stories folder holds the file, and the path under it", () => {
    const w = resolveWorld("../isles-of-yum/stories/marzipans-well.md", sources, { cwd });
    expect(w.source.name).toBe("isles-of-yum");
    expect(w.rel).toBe("marzipans-well.md");
  });

  it("keeps sub-folders, with forward slashes", () => {
    const w = resolveWorld("../bramble-wall/stories/bramble-wall/book-1.md", sources, { cwd });
    expect(w.source.name).toBe("bramble-wall");
    expect(w.rel).toBe("bramble-wall/book-1.md");
  });

  it("accepts an absolute path", () => {
    const abs = path.resolve(cwd, "../bramble-wall/stories/a.md");
    expect(resolveWorld(abs, sources, { cwd }).rel).toBe("a.md");
  });

  it("refuses a file outside every world, a non-story file, and a path that only looks similar", () => {
    expect(() => resolveWorld("stories/x.md", sources, { cwd })).toThrow(/not inside any world/);
    expect(() => resolveWorld("../isles-of-yum/README.md", sources, { cwd })).toThrow(/not inside any world/);
    expect(() => resolveWorld("../isles-of-yum-old/stories/x.md", sources, { cwd })).toThrow(/not inside any world/);
    expect(() => resolveWorld("../isles-of-yum/stories/x.txt", sources, { cwd })).toThrow(/not inside any world/);
  });
});

describe("defaultOutPath", () => {
  it("is narrator/out/<world>/<path>.mp3", () => {
    const w = resolveWorld("../bramble-wall/stories/bramble-wall/book-1.md", sources, { cwd });
    expect(defaultOutPath(w, "/out")).toBe(path.join("/out", "bramble-wall", "bramble-wall", "book-1.mp3"));
  });
});

describe("loadWorldNarration", () => {
  let root;
  let shared;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "narr-world-"));
    shared = path.join(root, "shared.json");
    fs.writeFileSync(shared, JSON.stringify({ _readme: "x", Mrs: "Missus", Ms: "Mizz" }));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("uses the defaults and the shared respellings when the world has no narration folder", () => {
    const n = loadWorldNarration(root, { sharedPronunciations: shared });
    expect(n.voiceId).toMatch(/\w+/);
    expect(n.modelId).toBe("eleven_v4");
    expect(n.pronunciations).toEqual({ Mrs: "Missus", Ms: "Mizz" });
  });

  it("adds the world's respellings, which win over the shared ones", () => {
    fs.mkdirSync(path.join(root, "narration"));
    fs.writeFileSync(path.join(root, "narration", "pronunciations.json"), JSON.stringify({ Ms: "Miz", Haida: "Hydah" }));
    expect(loadWorldNarration(root, { sharedPronunciations: shared }).pronunciations)
      .toEqual({ Mrs: "Missus", Ms: "Miz", Haida: "Hydah" });
  });

  it("reads the world's voice and model, ignoring values of the wrong type", () => {
    fs.mkdirSync(path.join(root, "narration"));
    fs.writeFileSync(path.join(root, "narration", "narrator.json"), JSON.stringify({ voiceId: "abc", modelId: 7 }));
    const n = loadWorldNarration(root, { sharedPronunciations: shared });
    expect(n.voiceId).toBe("abc");
    expect(n.modelId).toBe("eleven_v4");
  });

  it("survives a broken settings file", () => {
    fs.mkdirSync(path.join(root, "narration"));
    fs.writeFileSync(path.join(root, "narration", "narrator.json"), "{");
    fs.writeFileSync(path.join(root, "narration", "pronunciations.json"), "nope");
    expect(loadWorldNarration(root, { sharedPronunciations: shared }).pronunciations).toEqual({ Mrs: "Missus", Ms: "Mizz" });
  });
});


describe("storyMarkdown", () => {
  const lf = "---\ntitle: T\n---\n## Part One. Start\nText.\n\n## Part Two. End\nMore.\n";

  it("removes the front matter and leaves the body", () => {
    expect(storyMarkdown(lf)).toBe("## Part One. Start\nText.\n\n## Part Two. End\nMore.\n");
  });

  it("gives a CRLF file the same text as its LF twin, so headings are still found", () => {
    const crlf = lf.replace(/\n/g, "\r\n");
    expect(storyMarkdown(crlf)).toBe(storyMarkdown(lf));
    const md = storyMarkdown(crlf);
    const parts = extractParts(md);
    const chunks = packChunks(parseScenes(applyPronunciations(cleanForNarration(md), {})));
    expect(locateHeadings(chunks, parts.map((p) => p.spoken))).toHaveLength(2);
  });

  it("leaves a story with no front matter alone", () => {
    expect(storyMarkdown("Just text.\n")).toBe("Just text.\n");
  });
});
