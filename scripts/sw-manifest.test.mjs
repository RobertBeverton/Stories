import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { precacheList } from "./sw-manifest.mjs";

function project({ offlinePage = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swm-"));
  const put = (rel) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), "x");
  };
  put("site/assets/css/base.css");
  put("site/assets/css/tokens.css");
  put("site/assets/js/main.js");
  put("site/assets/js/dock.mjs");
  put("site/assets/js/dock.test.mjs");
  put("site/assets/js/offline-core.mjs");
  put("site/assets/js/sw-logic.mjs");
  put("site/assets/app-icon-192.png");
  if (offlinePage) put("site/offline.njk");
  return root;
}

describe("precacheList against the real source tree", () => {
  it("every asset it lists exists under site/assets, and the page sources exist", () => {
    const list = precacheList({ buildId: "b2", prefix: "/Stories" });
    const assets = list.filter((u) => u.startsWith("/Stories/assets/"));
    expect(assets.length).toBeGreaterThan(10);
    for (const u of assets) {
      const rel = u.replace("/Stories/", "site/").split("?")[0];
      expect(fs.existsSync(rel), rel).toBe(true);
    }
    for (const src of ["site/index.njk", "site/library.njk", "site/library.json.11ty.js", "site/manifest.webmanifest"]) {
      expect(fs.existsSync(src), src).toBe(true);
    }
  });
});

describe("precacheList", () => {
  const list = precacheList({ buildId: "b2", prefix: "/Stories", origin: "https://s.example", root: project() });

  it("has the pages, library.json and manifest", () => {
    for (const p of ["/Stories/", "/Stories/library/", "/Stories/offline/", "/Stories/manifest.webmanifest"]) {
      expect(list).toContain(`https://s.example${p}`);
    }
    expect(list).toContain("https://s.example/Stories/library.json?v=b2");
  });

  it("leaves /offline/ out while the page template does not exist, so install cannot 404", () => {
    const bare = precacheList({ buildId: "b2", prefix: "/Stories", origin: "https://s.example", root: project({ offlinePage: false }) });
    expect(bare).not.toContain("https://s.example/Stories/offline/");
    expect(bare).toContain("https://s.example/Stories/library/");
  });

  it("has css and modules with the build id exactly as the pages ask for them", () => {
    expect(list).toContain("https://s.example/Stories/assets/css/base.css?v=b2");
    expect(list).toContain("https://s.example/Stories/assets/js/main.js?v=b2");
    expect(list).toContain("https://s.example/Stories/assets/js/dock.mjs?v=b2");
  });

  it("keeps the worker's own modules without a version, and skips tests", () => {
    expect(list).toContain("https://s.example/Stories/assets/js/sw-logic.mjs");
    expect(list).toContain("https://s.example/Stories/assets/js/offline-core.mjs");
    expect(list.some((u) => u.includes("dock.test"))).toBe(false);
  });

  it("includes an icon that exists", () => {
    expect(list).toContain("https://s.example/Stories/assets/app-icon-192.png");
  });
});
