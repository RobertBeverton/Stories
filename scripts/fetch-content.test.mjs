import { describe, it, expect } from "vitest";
import { resolveSourceDir } from "./fetch-content.mjs";

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
