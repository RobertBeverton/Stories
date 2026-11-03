import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveSourceDir, findCollisions, fetchContent, buildWorldManifest } from "./fetch-content.mjs";

const source = { name: "isles-of-yum", repo: "https://example.com/x.git", localPath: "../isles-of-yum" };

describe("resolveSourceDir", () => {
  it("uses the sibling checkout locally when it exists", () => {
    expect(resolveSourceDir(source, { isCI: false, exists: () => true })).toEqual({
      mode: "local",
      dir: "../isles-of-yum",
    });
  });

  it("clones when the sibling checkout is missing", () => {
    expect(resolveSourceDir(source, { isCI: false, exists: () => false }).mode).toBe("clone");
  });

  it("always clones in CI, even if a local path exists", () => {
    expect(resolveSourceDir(source, { isCI: true, exists: () => true }).mode).toBe("clone");
  });
});

describe("findCollisions", () => {
  it("passes when worlds use different paths", () => {
    expect(
      findCollisions({ "isles-of-yum": ["marzipans-well.md"], "bramble-wall": ["bramble-wall/book-1.md"] }),
    ).toEqual([]);
  });

  it("reports a path two worlds both ship", () => {
    expect(
      findCollisions({ a: ["shared.md", "a-only.md"], b: ["shared.md"] }),
    ).toEqual(["stories/shared.md is in both a and b"]);
  });

  it("ignores placeholder files like .gitkeep", () => {
    expect(findCollisions({ a: [".gitkeep"], b: [".gitkeep"] })).toEqual([]);
  });
});

describe("buildWorldManifest", () => {
  it("maps only story files, sorted, ignoring audio and placeholders", () => {
    expect(
      buildWorldManifest([
        { source: { name: "b" }, files: ["z.md", "z.mp3", ".gitkeep"] },
        { source: { name: "a" }, files: ["sub/y.md"] },
      ]),
    ).toEqual({ "sub/y.md": "a", "z.md": "b" });
  });
});

// fetchContent for real, in throwaway directories. Sources use absolute
// localPath values, so this does not depend on sibling checkouts.
describe("fetchContent", () => {
  const write = (root, rel, text = "x") => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };

  function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fetch-content-"));
    write(root, "alpha/stories/one.md");
    write(root, "alpha/stories/sub/two.md");
    write(root, "alpha/stories/one.mp3");
    write(root, "alpha/lore/athena.md", "alpha athena");
    write(root, "beta/stories/three.md");
    write(root, "beta/lore/athena.md", "beta athena");
    const world = (name, extra = {}) => ({
      name,
      title: name,
      tagline: "Invented.",
      accent: "sage",
      icon: "sun",
      localPath: path.join(root, name),
      ...extra,
    });
    return { root, world, outDir: path.join(root, "out-stories"), loreDir: path.join(root, "out-lore") };
  }
  const quiet = (fn) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      return fn(warn);
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  };

  it("merges stories flat and writes a manifest mapping each story path to its world", () => {
    const { world, outDir, loreDir } = setup();
    quiet(() => fetchContent([world("alpha"), world("beta")], { isCI: false, outDir, loreDir }));
    expect(fs.existsSync(path.join(outDir, "sub/two.md"))).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, ".worlds.json"), "utf8"));
    expect(manifest).toEqual({ "one.md": "alpha", "sub/two.md": "alpha", "three.md": "beta" });
  });

  it("copies lore into lore/<world>/ only for sources with a lorePath, never mixing worlds", () => {
    const { world, outDir, loreDir } = setup();
    quiet(() =>
      fetchContent([world("alpha", { lorePath: "lore" }), world("beta", { lorePath: "lore" })], {
        isCI: false,
        outDir,
        loreDir,
      }),
    );
    expect(fs.readFileSync(path.join(loreDir, "alpha/athena.md"), "utf8")).toBe("alpha athena");
    expect(fs.readFileSync(path.join(loreDir, "beta/athena.md"), "utf8")).toBe("beta athena");

    quiet(() => fetchContent([world("alpha"), world("beta")], { isCI: false, outDir, loreDir }));
    expect(fs.existsSync(loreDir)).toBe(false); // stale lore from the last fetch is cleared
  });

  it("warns and carries on when a lorePath does not exist", () => {
    const { world, outDir, loreDir } = setup();
    quiet((warn) => {
      fetchContent([world("alpha", { lorePath: "nope" }), world("beta")], { isCI: false, outDir, loreDir });
      expect(warn.mock.calls.flat().join("\n")).toMatch(/alpha: warning: lorePath 'nope' not found/);
    });
    expect(fs.existsSync(path.join(outDir, "one.md"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, ".worlds.json"))).toBe(true);
  });

  it("still fails loudly when two worlds ship the same path", () => {
    const { root, world, outDir, loreDir } = setup();
    write(root, "beta/stories/one.md");
    expect(() => fetchContent([world("alpha"), world("beta")], { isCI: false, outDir, loreDir })).toThrow(
      /stories\/one\.md is in both alpha and beta/,
    );
  });

  it("fails on an unknown accent before copying anything", () => {
    const { world, outDir, loreDir } = setup();
    expect(() =>
      fetchContent([world("alpha", { accent: "chartreuse" })], { isCI: false, outDir, loreDir }),
    ).toThrow(/alpha: unknown accent 'chartreuse'/);
    expect(fs.existsSync(outDir)).toBe(false);
  });
});
