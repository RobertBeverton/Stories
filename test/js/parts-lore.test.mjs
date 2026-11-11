// @vitest-environment jsdom
// Lore: the Stories | Lore segment (module) and the lore templates (real
// nunjucks render of lore-entry.njk and lore-links.njk with fixture data).
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import nunjucks from "nunjucks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { iconDetailSvgPath, iconSvgPath } from "../../scripts/icons.mjs";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { write } from "../../site/assets/js/progress.mjs";
import { mount } from "../../site/assets/js/lore.mjs";
import { getWorld, setWorld } from "../../site/assets/js/world-state.mjs";
import { renderStory, root, templateStory } from "../templates/render-pages.mjs";
import { library, loadPage, stubLibraryFetch, tick } from "./helpers.mjs";

const [FIRST, SECOND, LONE] = library.stories.map((s) => s.slug);
const ENTRY = library.lore[0];
let unmount;

async function open(current, world) {
  if (world) localStorage.setItem("stories-world", world);
  loadPage(`<html data-base="/Stories"><body>
    <div data-mount="lore" ${current ? `data-current="${current}"` : ""}></div>
    <section data-lore-world="test-world" id="a"><h2>A</h2></section>
    <section data-lore-world="other" id="b"><h2>B</h2></section></body></html>`);
  document.documentElement.dataset.base = "/Stories";
  const el = document.querySelector('[data-mount="lore"]');
  unmount = mount(el);
  await tick();
  await tick();
  return el;
}
const links = (el) => [...el.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")]);

beforeEach(() => {
  localStorage.clear();
  resetLibrary();
  stubLibraryFetch();
});
afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("Lore segment (Library)", () => {
  it("shows Stories | Lore only while the current world is a single world with lore", async () => {
    const el = await open(undefined, "test-world");
    expect(el.hidden).toBe(false);
    expect(links(el)).toEqual([
      ["Stories", "/Stories/library/", "page"],
      ["Lore", "/Stories/lore/", null],
    ]);
  });

  it("shows nothing for a world with no lore entries (no segment, no Lore link)", async () => {
    const el = await open(undefined, "other-world");
    expect(el.hidden).toBe(true);
    expect(el.children).toHaveLength(0);
    expect(el.textContent).toBe("");
  });

  it("shows nothing for All worlds", async () => {
    const el = await open();
    expect(el.hidden).toBe(true);
    expect(el.querySelector("a")).toBeNull();
  });

  it("follows stories:world, appearing and disappearing", async () => {
    const el = await open(undefined, "other-world");
    setWorld("test-world");
    expect(el.hidden).toBe(false);
    expect(el.querySelectorAll("a")).toHaveLength(2);
    setWorld("other-world");
    expect(el.hidden).toBe(true);
    expect(el.children).toHaveLength(0);
    setWorld("");
    expect(el.hidden).toBe(true);
    expect(getWorld()).toBe("");
  });

  it("shows nothing when library.json cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = await open(undefined, "test-world");
    expect(el.hidden).toBe(true);
    expect(el.children).toHaveLength(0);
  });
});

describe("Lore segment (Lore listing)", () => {
  it("is always shown, with Lore as the current page", async () => {
    const el = await open("lore");
    expect(el.hidden).toBe(false);
    expect(links(el)).toEqual([
      ["Stories", "/Stories/library/", null],
      ["Lore", "/Stories/lore/", "page"],
    ]);
  });

  it("limits the listing to the current world when it has a section, else shows all", async () => {
    await open("lore", "test-world");
    expect(document.querySelector("#a").hidden).toBe(false);
    expect(document.querySelector("#b").hidden).toBe(true);
    setWorld("nowhere-with-lore");
    expect(document.querySelector("#a").hidden).toBe(false);
    expect(document.querySelector("#b").hidden).toBe(false);
    setWorld("");
    expect(document.querySelector("#b").hidden).toBe(false);
  });
});

describe("story page links back to lore", () => {
  const stories = library.stories.map((s) => templateStory(s));
  const withLore = (slug, extra = {}) =>
    new DOMParser().parseFromString(
      renderStory(stories.find((s) => s.slug === slug), { loreEntries: library.lore, ...extra }, stories),
      "text/html",
    );

  it("links the entries whose stories[] list the story", () => {
    const doc = withLore(FIRST);
    const link = doc.querySelector(".story-lore a");
    expect(link.getAttribute("href")).toBe(ENTRY.url);
    expect(link.textContent).toContain(ENTRY.title);
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
  });

  it("puts one card per entry near the top, before the Play row and the text, and not again below", () => {
    const doc = withLore(FIRST);
    const section = doc.querySelector(".story-hero .story-lore");
    expect(section).not.toBeNull();
    expect(doc.querySelectorAll(".story-lore")).toHaveLength(1);
    expect(doc.querySelector(".story-body ~ .story-lore")).toBeNull();
    const actions = doc.querySelector(".story-actions");
    expect(section.compareDocumentPosition(actions) & 4).toBeTruthy(); // the actions follow the section
    const card = section.querySelector("a.lore-chip");
    expect(card.querySelector(".lore-link-title").textContent).toBe(`About ${ENTRY.title}`);
    expect(card.querySelector(".lore-link-kicker").textContent).toBe(ENTRY.tradition);
    expect(card.querySelector(".lore-link-summary").textContent).toBe(ENTRY.summary);
  });

  it("links the entry named by the story's lore: slug, exactly", () => {
    const doc = withLore(SECOND, { lore: ENTRY.slug });
    expect(doc.querySelector(".story-lore a").getAttribute("href")).toBe(ENTRY.url);
    expect(withLore(SECOND, { lore: "test-fig" }).querySelector(".story-lore")).toBeNull();
  });

  it("emits nothing for a story no entry covers, or when there is no lore at all", () => {
    expect(withLore(SECOND).querySelector(".story-lore")).toBeNull();
    expect(withLore(LONE).querySelector(".story-lore")).toBeNull();
    const none = new DOMParser().parseFromString(renderStory(stories[0], {}, stories), "text/html");
    expect(none.querySelector(".story-lore")).toBeNull();
  });

  it("does not link an entry from another world, even with the same slug", () => {
    const other = { ...ENTRY, world: "other-world", stories: [FIRST], url: "/Stories/lore/other-world/test-figure/" };
    const doc = withLore(FIRST, { loreEntries: [other] });
    expect(doc.querySelector(".story-lore")).toBeNull();
  });
});

describe("lore entry page", () => {
  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(root, "site", "_includes")), { autoescape: true });
  env.addFilter("url", (p) => "/Stories" + p);
  env.addGlobal("icons", { path: iconSvgPath, detail: iconDetailSvgPath });
  const { content: template } = matter(fs.readFileSync(path.join(root, "site", "_includes", "lore-entry.njk"), "utf8"));
  const render = (entry) =>
    new DOMParser().parseFromString(
      env.renderString(template, {
        entry,
        content: "<p>Invented body.</p>",
        stories: { bySlug: Object.fromEntries(library.stories.map((s) => [s.slug, s])) },
      }),
      "text/html",
    );

  it("has one h1, the body, story links by library url, and a back link", () => {
    const doc = render(ENTRY);
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(doc.querySelector("h1").textContent).toBe(ENTRY.title);
    expect(doc.querySelector(".lore-body").textContent).toContain("Invented body.");
    expect(doc.querySelector(".lore-stories a").getAttribute("href")).toBe(library.stories[0].url);
    expect(doc.querySelector(".crumbs a").getAttribute("href")).toBe("/Stories/lore/");
  });

  it("shows the external link as a plain link at the bottom, opened safely", () => {
    const doc = render(ENTRY);
    const external = [...doc.querySelectorAll("a")].filter((a) => /^https?:/.test(a.getAttribute("href")));
    expect(external).toHaveLength(1);
    expect(external[0].closest("details")).toBeNull();
    expect(external[0].getAttribute("target")).toBe("_blank");
    expect(external[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(external[0].textContent).toMatch(/^Read more on [a-z0-9.-]+$/);
    expect(external[0].textContent).not.toContain("http");
    expect(doc.querySelector(".lore-body a")).toBeNull();
    expect(external[0].closest(".lore-more").parentElement.lastElementChild).toBe(external[0].closest(".lore-more")); // at the bottom
  });

  it("has no external link without one, and refuses non-http links", () => {
    const { link, ...noLink } = ENTRY;
    expect(render(noLink).querySelector(".lore-more")).toBeNull();
    expect(render({ ...ENTRY, link: "javascript:alert(1)" }).querySelector(".lore-more")).toBeNull();
  });

  it("skips story slugs library.json does not know and escapes entry text", () => {
    const doc = render({ ...ENTRY, title: "<b>Hostile</b>", stories: ["nope/nope"] });
    expect(doc.querySelector("h1 b")).toBeNull();
    expect(doc.querySelector(".lore-stories")).toBeNull();
  });
});

describe("Lore listing (A to Z, search, heard)", () => {
  const row = (title, tradition, summary = "") =>
    `<li data-search="${title} ${tradition} ${summary}"><a class="lore-row" href="/Stories/lore/x/${title}/"><span class="lore-link-title">${title}</span><span class="lore-row-tradition">${tradition}</span></a></li>`;
  const letter = (l, world, rows) =>
    `<section class="lore-letter" data-letter="${l}"><h3 class="lore-letter-head" id="l-${world}-${l}" tabindex="-1">${l}</h3><ul class="lore-list lore-rows">${rows.join("")}</ul></section>`;
  const ALL = [
    ["A", [row("Anubis", "Egyptian", "Guide of the lost")]],
    ["B", [row("Bast", "Egyptian", "The cat goddess")]],
    ["H", [row("Hadad", "Canaanite", "Storm god")]],
    ["T", [row("Thor", "Norse", "The god of thunder"), row("Thoth", "Egyptian", "Scribe of the gods")]],
    ["Z", [row("Zeus", "Greek", "King of the gods")]],
  ];

  async function openListing({ letters = ALL, extraWorld = false } = {}) {
    loadPage(`<html data-base="/Stories"><body>
      <div data-mount="lore" data-current="lore"></div>
      <input type="search" data-role="lore-search"><p data-role="lore-status"></p>
      <div data-role="heard" hidden><ul data-role="heard-list"></ul></div>
      <nav data-role="letters" hidden></nav>
      <section data-lore-world="test-world">${letters.map(([l, rows]) => letter(l, "test-world", rows)).join("")}</section>
      ${extraWorld ? `<section data-lore-world="other">${letter("Q", "other", [row("Quetzal", "Aztec")])}</section>` : ""}
      </body></html>`);
    document.documentElement.dataset.base = "/Stories";
    unmount = mount(document.querySelector('[data-mount="lore"]'));
    await tick();
    await tick();
    const input = document.querySelector("input");
    const type = (value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    return { type, status: document.querySelector('[data-role="lore-status"]') };
  }
  const shown = () => [...document.querySelectorAll(".lore-list > li:not([hidden]) .lore-link-title")].map((n) => n.textContent);
  const letterButtons = () => [...document.querySelectorAll('[data-role="letters"] button')].map((b) => b.textContent);

  it("matches every typed word against title, tradition and summary, and hides empty letters", async () => {
    const { type, status } = await openListing();
    type("thunder");
    expect(shown()).toEqual(["Thor"]);
    expect([...document.querySelectorAll(".lore-letter")].filter((s) => !s.hidden).map((s) => s.dataset.letter)).toEqual(["T"]);
    expect(status.textContent).toBe("1 of 6 entries");
    type("egyptian bast");
    expect(shown()).toEqual(["Bast"]);
  });

  it("says so when nothing matches, hides the world, and restores everything when cleared", async () => {
    const { type, status } = await openListing();
    type("nothing here");
    expect(shown()).toEqual([]);
    expect(document.querySelector("[data-lore-world]").hidden).toBe(true);
    expect(status.textContent).toMatch(/No lore matches/);
    type("");
    expect(shown()).toHaveLength(6);
    expect(document.querySelector("[data-lore-world]").hidden).toBe(false);
    expect(status.textContent).toBe("");
  });

  it("builds a letter strip of only the letters that have entries, and a button jumps to its heading", async () => {
    await openListing();
    expect(document.querySelector('[data-role="letters"]').hidden).toBe(false);
    expect(letterButtons()).toEqual(["A", "B", "H", "T", "Z"]);
    const head = document.getElementById("l-test-world-T");
    head.scrollIntoView = vi.fn();
    document.querySelector('[data-role="letters"] [data-letter="T"]').click();
    expect(head.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(head);
  });

  it("the strip follows the search, and goes away when there are fewer than five letters", async () => {
    const { type } = await openListing();
    type("egyptian");
    expect(document.querySelector('[data-role="letters"]').hidden).toBe(true); // A, B, T: only three
    type("");
    expect(letterButtons()).toEqual(["A", "B", "H", "T", "Z"]);
  });

  it("shows no strip while several worlds are on show", async () => {
    await openListing({ extraWorld: true });
    expect(document.querySelector('[data-role="letters"]').hidden).toBe(true);
  });

  it("lists, by name, the entries of stories heard on this device, most recent first, and hides them while searching", async () => {
    const { type } = await openListing();
    const box = document.querySelector('[data-role="heard"]');
    expect(box.hidden).toBe(true); // nothing heard yet
    write(ENTRY.stories[0], { audioTime: 60 });
    expect(box.hidden).toBe(false);
    const names = () => [...box.querySelectorAll("a")].map((a) => a.textContent);
    expect(names()).toEqual([ENTRY.title]);
    expect(box.querySelector("a").getAttribute("href")).toBe(ENTRY.url);
    type("zzz");
    expect(box.hidden).toBe(true);
    type("");
    expect(box.hidden).toBe(false);
  });

  it("a story that was only opened (no listening) does not count as heard", async () => {
    await openListing();
    write(ENTRY.stories[0], { audioTime: 0, scrollY: 0 });
    expect(document.querySelector('[data-role="heard"]').hidden).toBe(true);
  });
});
