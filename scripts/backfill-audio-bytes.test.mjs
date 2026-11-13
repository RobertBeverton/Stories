import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planBackfill, run } from "./backfill-audio-bytes.mjs";

// Invented placeholder stories.
function world() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-"));
  const stories = path.join(dir, "stories");
  fs.mkdirSync(stories);
  const write = (name, text) => fs.writeFileSync(path.join(stories, name), text);
  write("has.md", "---\ntitle: A\naudioUrl: https://audio.kinly.download/w/has.mp3?v=1\naudioBytes: 5\n---\nBody\n");
  write("needs.md", "---\ntitle: B\naudioUrl: https://audio.kinly.download/w/needs.mp3?v=2\naudioDuration: 60\n---\nBody\n");
  write("silent.md", "---\ntitle: C\n---\nBody\n");
  return { dir, source: { name: "w", localPath: dir, storiesPath: "stories" } };
}

describe("planBackfill", () => {
  it("lists only stories with an audioUrl and no audioBytes", () => {
    const { source } = world();
    expect(planBackfill(source).map((i) => i.rel)).toEqual(["needs.md"]);
  });
});

describe("run", () => {
  it("dry run changes nothing", async () => {
    const { source, dir } = world();
    const head = vi.fn(async () => 777);
    expect(await run([], { log: () => {}, error: () => {}, sources: [source], head })).toBe(0);
    expect(fs.readFileSync(path.join(dir, "stories", "needs.md"), "utf8")).not.toContain("audioBytes");
  });

  it("--apply writes audioBytes from the HEAD size", async () => {
    const { source, dir } = world();
    const head = vi.fn(async () => 777);
    expect(await run(["--apply"], { log: () => {}, error: () => {}, sources: [source], head })).toBe(0);
    expect(head).toHaveBeenCalledWith("https://audio.kinly.download/w/needs.mp3?v=2");
    expect(fs.readFileSync(path.join(dir, "stories", "needs.md"), "utf8")).toContain("audioBytes: 777");
  });

  it("reports a failed HEAD, leaves the file alone and exits 1", async () => {
    const { source, dir } = world();
    const head = vi.fn(async () => { throw new Error("404"); });
    const error = vi.fn();
    expect(await run(["--apply"], { log: () => {}, error, sources: [source], head })).toBe(1);
    expect(fs.readFileSync(path.join(dir, "stories", "needs.md"), "utf8")).not.toContain("audioBytes");
    expect(error).toHaveBeenCalled();
  });
});
