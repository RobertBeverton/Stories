import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUILD_ID, computeBuildId } from "./build-id.mjs";
import { buildImportMap, pageSecurity } from "./page-security.mjs";

let root;

function put(file, text) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "build-id-"));
  put("stories/world/a.md", "---\ntitle: A\n---\nText");
  put("stories/.worlds.json", '{"world/a.md":"world"}');
  put("lore/world/x.md", "lore");
  put("site/index.njk", "home");
  put("site/_includes/base.njk", "base");
  put("site/assets/js/main.js", "js");
  put("site/assets/css/base.css", "css");
  put("site/assets/generated/art.svg", "<svg/>");
  put("scripts/stories-lib.mjs", "lib");
  put("scripts/stories-lib.test.mjs", "test");
  put("content-sources.json", "[]");
  put("eleventy.config.js", "cfg");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("computeBuildId", () => {
  it("is a short hex content hash", () => {
    expect(computeBuildId(root)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("is the same for identical inputs, whenever it is computed (a nightly rebuild with no change)", async () => {
    const first = computeBuildId(root);
    await new Promise((resolve) => setTimeout(resolve, 20));
    fs.utimesSync(path.join(root, "stories/world/a.md"), new Date(), new Date()); // new mtime, same bytes
    expect(computeBuildId(root)).toBe(first);
  });

  it("does not depend on the directory it is built in", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "build-id-copy-"));
    try {
      fs.cpSync(root, other, { recursive: true });
      expect(computeBuildId(other)).toBe(computeBuildId(root));
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it.each([
    ["a story", "stories/world/a.md"],
    ["a worlds manifest", "stories/.worlds.json"],
    ["a lore entry", "lore/world/x.md"],
    ["a template", "site/_includes/base.njk"],
    ["a page template", "site/index.njk"],
    ["a module", "site/assets/js/main.js"],
    ["a stylesheet", "site/assets/css/base.css"],
    ["a build script", "scripts/stories-lib.mjs"],
    ["the world list", "content-sources.json"],
    ["the eleventy config", "eleventy.config.js"],
  ])("changes when %s changes", (_what, file) => {
    const before = computeBuildId(root);
    fs.appendFileSync(path.join(root, file), " changed");
    expect(computeBuildId(root)).not.toBe(before);
  });

  it("changes when a story is added or removed", () => {
    const before = computeBuildId(root);
    put("stories/world/b.md", "new");
    const added = computeBuildId(root);
    expect(added).not.toBe(before);
    fs.rmSync(path.join(root, "stories/world/b.md"));
    expect(computeBuildId(root)).toBe(before);
  });

  it("distinguishes a renamed file from a moved one (path is part of the input)", () => {
    const before = computeBuildId(root);
    fs.renameSync(path.join(root, "stories/world/a.md"), path.join(root, "stories/world/z.md"));
    expect(computeBuildId(root)).not.toBe(before);
  });

  it("ignores test files, generated art and story audio", () => {
    const before = computeBuildId(root);
    fs.appendFileSync(path.join(root, "scripts/stories-lib.test.mjs"), " changed");
    fs.appendFileSync(path.join(root, "site/assets/generated/art.svg"), " changed");
    put("stories/world/a.mp3", "audio");
    expect(computeBuildId(root)).toBe(before);
  });

  it("works with no lore folder", () => {
    fs.rmSync(path.join(root, "lore"), { recursive: true });
    expect(computeBuildId(root)).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("the build id of this checkout", () => {
  it("is fixed for the process and drives the import map and CSP hash", () => {
    expect(BUILD_ID).toMatch(/^[0-9a-f]{12}$/);
    expect(computeBuildId()).toBe(BUILD_ID);
    const defaults = pageSecurity();
    expect(defaults.json).toBe(buildImportMap(BUILD_ID).json);
    expect(JSON.parse(defaults.json).imports["/Stories/assets/js/main.js"]).toBeUndefined(); // main.js is not an .mjs module
    for (const versioned of Object.values(JSON.parse(defaults.json).imports)) expect(versioned.endsWith(`?v=${BUILD_ID}`)).toBe(true);
  });
});
