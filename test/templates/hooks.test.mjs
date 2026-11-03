// Renders the real templates (site/index.njk, site/library.njk,
// site/_includes/story.njk, via base.njk) with invented data and greps the
// output for every data-mount hook in the contract (docs/contracts.md section 3).
// No story text and no stories/ folder needed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { accentColorFor } from "../../scripts/accent-colors.mjs";
import { renderHome, renderLibrary, renderStory } from "./render-pages.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const site = path.join(root, "site");

const contractHooks = (() => {
  const md = fs.readFileSync(path.join(root, "docs", "contracts.md"), "utf8");
  const line = md.match(/Names:\s*([^.]+)\./s)?.[1];
  return [...line.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
})();

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

const pages = {
  home: renderHome(stories),
  library: renderLibrary(stories),
  story: renderStory(story(1), {
    title: "Tale 1 of Testing",
    nextStory: { url: "/Stories/stories/tale-2/", title: "Tale 2 of Testing" },
  }, stories),
};
const doc = Object.fromEntries(Object.entries(pages).map(([k, html]) => [k, new JSDOM(html).window.document]));
const hooksIn = (d) => new Set([...d.querySelectorAll("[data-mount]")].map((el) => el.dataset.mount));

describe("template hooks", () => {
  it("reads the hook list from the contract", () => {
    expect(contractHooks).toEqual([
      "continue", "played-lately", "story-resume", "search", "play-button",
      "filters", "world-switcher", "text-size", "parts", "dock",
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
    ["story", ["story-resume", "play-button", "text-size", "parts", "dock"]],
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
    const html = renderLibrary([story(1, { title: '<b>"x"</b>' })]);
    expect(html).not.toContain("<b>\"x\"</b>");
  });
});

describe("what the modules need from the templates", () => {
  it("marks every library row and the empty states the way search and filters look for them", () => {
    const rows = [...doc.library.querySelectorAll('[data-role="story-row"][data-slug]')];
    expect(rows.map((r) => r.dataset.slug)).toEqual(stories.map((s) => s.slug));
    expect(doc.library.querySelector('[data-role="no-results"]').hidden).toBe(true);
    expect(doc.library.querySelector('[data-role="results-status"]')).not.toBeNull();
  });

  it("gives the story page the audio element story-resume claims, with the story's audio", () => {
    const audio = doc.story.querySelector("audio#player");
    expect(audio.getAttribute("src")).toBe("/Stories/stories/test-world/tale-1.mp3");
    expect(doc.story.querySelectorAll("audio")).toHaveLength(1);
    expect(doc.story.querySelector('[data-mount="story-resume"] [data-role="resume"]')).not.toBeNull();
    expect(doc.story.querySelector('[data-mount="play-button"] [data-role="label"]').textContent).toBe("Play");
  });

  it("omits the audio element for a story with no audio", () => {
    const d = new JSDOM(renderStory(story(1, { audioUrl: undefined }))).window.document;
    expect(d.querySelector("audio")).toBeNull();
    expect(d.querySelector('[data-mount="play-button"]')).toBeNull();
  });

  it("draws covers with the main and detail icon paths", () => {
    const paths = [...doc.library.querySelectorAll(".row .cover svg")[0].querySelectorAll("path")];
    expect(paths.map((p) => p.getAttribute("class"))).toEqual(["icon-main", "icon-detail"]);
  });
});
