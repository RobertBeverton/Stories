// Renders the real templates (site/index.njk, site/library.njk,
// site/_includes/story.njk, via base.njk) with invented data and greps the
// output for every data-mount hook in the contract (docs/contracts.md section 3).
// No story text and no stories/ folder needed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import matter from "gray-matter";
import nunjucks from "nunjucks";
import { JSDOM } from "jsdom";
import { accentColorFor } from "../../scripts/accent-colors.mjs";
import { iconSvgPath } from "../../scripts/icons.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const site = path.join(root, "site");

const contractHooks = (() => {
  const md = fs.readFileSync(path.join(root, "docs", "contracts.md"), "utf8");
  const line = md.match(/Names:\s*([^.]+)\./s)?.[1];
  return [...line.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
})();

const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(site, "_includes")), { autoescape: true });
env.addFilter("url", (p) => "/Stories" + p);
env.addGlobal("icons", { path: iconSvgPath });

function story(n, extra = {}) {
  const series = n === 3 ? undefined : "The Placeholder Series";
  return {
    slug: `test-world/tale-${n}`,
    title: `Tale ${n} of Testing`,
    description: "Invented placeholder text.",
    series,
    tags: ["placeholder"],
    icon: "sun",
    accentColor: accentColorFor(series),
    publishDate: new Date(`2026-10-0${n}T00:00:00Z`),
    audioDuration: 600,
    audioMinutes: 10,
    readMinutes: 4,
    url: `/Stories/stories/tale-${n}/`,
    audioUrl: `/Stories/stories/test-world/tale-${n}.mp3`,
    keyIslands: [],
    characters: ["Placeholder"],
    ...extra,
  };
}
const stories = [story(3), story(2), story(1)];

function page(templatePath, data, pageUrl) {
  const { content: body, data: front } = matter(fs.readFileSync(templatePath, "utf8"));
  const ctx = { buildTime: 12345, page: { url: pageUrl }, stories, ...front, ...data };
  const inner = env.renderString(body, ctx);
  return env.render("base.njk", { ...ctx, content: inner });
}

const pages = {
  home: page(path.join(site, "index.njk"), {}, "/"),
  library: page(path.join(site, "library.njk"), {}, "/library/"),
  story: page(path.join(site, "_includes", "story.njk"), {
    ...story(1),
    title: "Tale 1 of Testing",
    content: "<p>Invented placeholder text.</p>",
    prevStory: null,
    nextStory: { url: "/Stories/stories/tale-2/", title: "Tale 2 of Testing" },
  }, "/stories/tale-1/"),
};
const doc = Object.fromEntries(Object.entries(pages).map(([k, html]) => [k, new JSDOM(html).window.document]));
const hooksIn = (d) => new Set([...d.querySelectorAll("[data-mount]")].map((el) => el.dataset.mount));

describe("template hooks", () => {
  it("reads the hook list from the contract", () => {
    expect(contractHooks).toEqual([
      "continue", "played-lately", "story-resume", "search", "play-button",
      "filters", "world-switcher", "parts", "dock",
    ]);
  });

  it("emits every contract hook somewhere across the pages", () => {
    const all = new Set(Object.values(doc).flatMap((d) => [...hooksIn(d)]));
    for (const hook of contractHooks) expect(all, hook).toContain(hook);
  });

  it("emits no hook the contract does not name", () => {
    for (const d of Object.values(doc)) for (const h of hooksIn(d)) expect(contractHooks).toContain(h);
  });

  it.each([
    ["home", ["continue", "played-lately", "world-switcher", "dock"]],
    ["library", ["search", "filters", "world-switcher", "play-button", "dock"]],
    ["story", ["story-resume", "play-button", "parts", "dock"]],
  ])("%s carries its hooks", (name, expected) => {
    for (const hook of expected) expect(hooksIn(doc[name]), `${name}: ${hook}`).toContain(hook);
  });

  it("puts the flat slug on slug-keyed hooks", () => {
    const d = doc.story;
    for (const hook of ["story-resume", "play-button", "parts"]) {
      expect(d.querySelector(`[data-mount="${hook}"]`).dataset.slug).toBe("test-world/tale-1");
    }
    const rows = [...doc.library.querySelectorAll('.row [data-mount="play-button"]')];
    expect(rows.map((b) => b.dataset.slug)).toEqual(stories.map((s) => s.slug));
  });
});

describe("page shell", () => {
  it.each(Object.keys(pages))("%s has the required head tags and no external fonts", (name) => {
    const d = doc[name];
    expect(d.querySelector("meta[name=robots]").content).toBe("noindex");
    expect(d.querySelector("meta[name=build-id]").content).toBe("12345");
    expect(d.querySelector("meta[name=viewport]").content).toContain("viewport-fit=cover");
    expect(d.documentElement.dataset.base).toBe("/Stories");
    expect(pages[name]).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(d.querySelectorAll("h1").length).toBe(1);
  });

  it("marks the current dock link and leaves the other plain", () => {
    const current = (n) => [...doc[n].querySelectorAll(".dock-link[aria-current]")].map((a) => a.textContent.trim());
    expect(current("home")).toEqual(["Home"]);
    expect(current("library")).toEqual(["Library"]);
    expect(current("story")).toEqual([]);
    const hrefs = [...doc.home.querySelectorAll(".dock-link")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/Stories/", "/Stories/library/"]);
  });

  it("gives the story page a text size control and a series-coloured header", () => {
    const d = doc.story;
    expect([...d.querySelectorAll(".textsize input")].map((i) => i.value)).toEqual(["sm", "md", "lg"]);
    for (const input of d.querySelectorAll(".textsize input")) {
      expect(d.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    }
    expect(d.querySelector(".story-hero").getAttribute("style")).toContain("--series:");
  });

  it("links every stylesheet it ships and each file exists", () => {
    const hrefs = [...doc.home.querySelectorAll("link[rel=stylesheet]")].map((l) => l.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const file = path.join(site, href.replace(/^\/Stories\//, "").replace(/\?.*$/, ""));
      expect(fs.existsSync(file), href).toBe(true);
    }
  });

  it("escapes story titles in rendered attributes", () => {
    const rows = doc.library.querySelectorAll(".row");
    expect(rows.length).toBe(3);
    const html = page(path.join(site, "library.njk"), { stories: [story(1, { title: '<b>"x"</b>' })] }, "/library/");
    expect(html).not.toContain("<b>\"x\"</b>");
  });
});
