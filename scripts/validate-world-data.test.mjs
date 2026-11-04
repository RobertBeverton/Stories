import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs, run } from "./validate-world-data.mjs";
import { readManifest } from "./world-data.mjs";

describe("parseArgs", () => {
  it("defaults to a lenient run over this repo", () => {
    expect(parseArgs([])).toEqual({ strict: false, world: null, loreDir: "lore" });
  });

  it("reads --strict, --world and --lore-dir", () => {
    expect(parseArgs(["--strict", "--world", "gods", "--lore-dir", "notes"]))
      .toEqual({ strict: true, world: "gods", loreDir: "notes" });
  });

  it("rejects an unknown flag and a flag with no value", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
    expect(() => parseArgs(["--world"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--world", "--strict"])).toThrow(/needs a value/);
  });
});

describe("run (a world repo's own CI)", () => {
  let dir;
  let previous;
  const out = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

  function write(rel, text) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  const story = (extra = "") => `---\ntitle: One\ndescription: d\npublishDate: 2026-01-01\n${extra}---\nBody\n`;

  beforeEach(() => {
    previous = process.cwd();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "world-data-"));
    process.chdir(dir);
    Object.values(out).forEach((fn) => fn.mockClear());
  });
  afterEach(() => {
    process.chdir(previous);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("exits 0 and reports a clean world", async () => {
    write("stories/one.md", story());
    expect(await run(["--strict", "--world", "gods"], out)).toBe(0);
    expect(out.log).toHaveBeenCalledWith(expect.stringContaining("World data OK (1 stories"));
    expect(out.warn).not.toHaveBeenCalled();
  });

  it("warns about a dangling lore link and still exits 0 without --strict", async () => {
    write("stories/one.md", story("lore: nobody\n"));
    expect(await run(["--world", "gods"], out)).toBe(0);
    expect(out.warn).toHaveBeenCalledWith(expect.stringContaining("World data warnings"));
  });

  it("fails on the same warning under --strict", async () => {
    write("stories/one.md", story("lore: nobody\n"));
    expect(await run(["--strict", "--world", "gods"], out)).toBe(1);
    expect(out.error).toHaveBeenCalledWith(expect.stringContaining("failing because of --strict"));
  });

});

describe("readManifest", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("reports a missing file, bad JSON and a non-object", () => {
    expect(readManifest(path.join(dir, "none.json")).error).toMatch(/not found/);
    fs.writeFileSync(path.join(dir, "bad.json"), "{");
    expect(readManifest(path.join(dir, "bad.json")).error).toMatch(/not a valid world manifest/);
    fs.writeFileSync(path.join(dir, "arr.json"), "[]");
    expect(readManifest(path.join(dir, "arr.json")).error).toMatch(/not a valid world manifest/);
  });

  it("returns the manifest when it is an object", () => {
    fs.writeFileSync(path.join(dir, "ok.json"), JSON.stringify({ "a.md": "gods" }));
    expect(readManifest(path.join(dir, "ok.json"))).toEqual({ manifest: { "a.md": "gods" }, error: null });
  });
});
