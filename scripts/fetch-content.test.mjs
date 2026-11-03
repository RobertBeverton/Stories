import { describe, it, expect } from "vitest";
import { resolveSourceDir, findCollisions } from "./fetch-content.mjs";

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
