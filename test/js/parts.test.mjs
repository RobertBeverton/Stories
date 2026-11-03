// @vitest-environment jsdom
// The parts module on the story-page fixture: list from library.json, the
// highlight following the audio clock, tap to jump, and staying quiet.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { currentPartIndex, mount } from "../../site/assets/js/parts.mjs";
import { fakeAudio, library, loadPage, storyPageHtml, stubLibraryFetch, tick } from "./helpers.mjs";

const SLUG = "test-world/first-tale";
const PARTS = library.stories[0].parts;
let audio;
let ctl;
let unmount;

async function mountPage({ slug = SLUG, withHeadings = true, data = library } = {}) {
  stubLibraryFetch(data);
  loadPage(storyPageHtml);
  const root = document.querySelector('[data-mount="parts"]');
  root.dataset.slug = slug;
  if (withHeadings) {
    const body = document.createElement("div");
    body.className = "story-body";
    for (const part of PARTS) {
      const heading = document.createElement("h2");
      heading.textContent = part.title;
      body.append(heading, Object.assign(document.createElement("p"), { textContent: "Invented text." }));
    }
    document.querySelector("article").append(body);
  }
  audio = document.querySelector("audio#player");
  ctl = fakeAudio(audio, { duration: 600 });
  unmount = mount(root);
  await tick();
  return root;
}

const buttons = () => [...document.querySelectorAll('[data-mount="parts"] button')];
const current = () => buttons().filter((b) => b.getAttribute("aria-current") === "true");
const headingsCurrent = () => [...document.querySelectorAll(".part-current")].map((h) => h.textContent);

beforeEach(() => {
  localStorage.clear();
  resetLibrary();
});
afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("currentPartIndex", () => {
  const parts = [{ title: "A", start: 0 }, { title: "B", start: 240.5 }, { title: "C", start: 400 }];
  it("is the last part started, whatever the playback speed", () => {
    expect(currentPartIndex(parts, 0)).toBe(0);
    expect(currentPartIndex(parts, 240.4)).toBe(0);
    expect(currentPartIndex(parts, 240.5)).toBe(1);
    expect(currentPartIndex(parts, 399.97)).toBe(2); // within the tolerance of the boundary
    expect(currentPartIndex(parts, 9999)).toBe(2);
  });
  it("is -1 before the first part", () => {
    expect(currentPartIndex([{ title: "A", start: 5 }], 1)).toBe(-1);
  });
});

describe("part list", () => {
  it("builds ul.parts-list > li > button.btn, one per part, with titles as text", async () => {
    const root = await mountPage();
    expect(root.querySelector("ul.parts-list")).not.toBeNull();
    expect(root.querySelectorAll("ul.parts-list > li > button.btn")).toHaveLength(PARTS.length);
    expect(buttons().map((b) => b.querySelector(".part-title").textContent)).toEqual(PARTS.map((p) => p.title));
    expect(buttons()[1].querySelector(".part-time").textContent).toBe("4:00");
    expect(buttons().every((b) => b.type === "button")).toBe(true);
  });

  it("renders nothing for a story without parts (root stays empty)", async () => {
    const root = await mountPage({ slug: "test-world/second-tale" });
    expect(root.children).toHaveLength(0);
  });

  it("renders nothing for a slug that library.json does not know", async () => {
    const root = await mountPage({ slug: "nope/nope" });
    expect(root.children).toHaveLength(0);
  });

  it("never creates a live region", async () => {
    const root = await mountPage();
    ctl.tick(300);
    expect(root.querySelector("[aria-live], [role=status], [role=alert], [role=log]")).toBeNull();
  });

  it("puts story text only in text nodes (a hostile part title is not markup)", async () => {
    const data = structuredClone(library);
    data.stories[0].parts[0].title = '<img src=x onerror="boom()">';
    const root = await mountPage({ data, withHeadings: false });
    expect(root.querySelector("img")).toBeNull();
    expect(buttons()[0].textContent).toContain("<img");
  });
});

describe("highlight follows the audio clock", () => {
  it("marks the first part at the start and the second after a simulated timeupdate", async () => {
    await mountPage();
    expect(current().map((b) => b.dataset.index)).toEqual(["0"]);
    ctl.tick(100);
    expect(current().map((b) => b.dataset.index)).toEqual(["0"]);
    ctl.tick(240.5);
    expect(current().map((b) => b.dataset.index)).toEqual(["1"]);
    expect(buttons()[0].hasAttribute("aria-current")).toBe(false);
  });

  it("follows backwards seeks too", async () => {
    await mountPage();
    ctl.tick(500);
    expect(current()[0].dataset.index).toBe("1");
    ctl.tick(3);
    expect(current()[0].dataset.index).toBe("0");
  });

  it("highlights the matching heading in the story text with .part-current", async () => {
    await mountPage();
    expect(headingsCurrent()).toEqual([PARTS[0].title]);
    ctl.tick(250);
    expect(headingsCurrent()).toEqual([PARTS[1].title]);
  });

  it("is driven by currentTime, so playback speed does not matter", async () => {
    await mountPage();
    audio.playbackRate = 2;
    ctl.tick(241); // 241 s of media is the second part at 2x as at 1x
    expect(current()[0].dataset.index).toBe("1");
  });

  it("does not touch the DOM when the part has not changed (focus and live state stay put)", async () => {
    await mountPage();
    const first = buttons()[0];
    first.focus();
    const observer = new MutationObserver(() => {});
    observer.observe(document.querySelector('[data-mount="parts"]'), { subtree: true, attributes: true, childList: true, characterData: true });
    ctl.tick(10);
    ctl.tick(20);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
    expect(document.activeElement).toBe(first);
  });

  it("ignores audio that belongs to another story (player data-slug)", async () => {
    await mountPage();
    audio.dataset.slug = "other-world/lone-tale";
    ctl.tick(300);
    expect(current().map((b) => b.dataset.index)).toEqual(["0"]);
    buttons()[1].click();
    expect(audio.currentTime).toBe(300);
  });

  it("stops following after unmount", async () => {
    await mountPage();
    unmount();
    unmount = undefined;
    ctl.tick(300);
    expect(document.querySelectorAll(".part-current")).toHaveLength(0);
    expect(buttons()).toHaveLength(0);
  });
});

describe("tap to jump", () => {
  it("seeks to the part start and moves the highlight, without starting a paused story", async () => {
    await mountPage();
    buttons()[1].click();
    expect(audio.currentTime).toBe(240.5);
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.paused).toBe(true);
    expect(current()[0].dataset.index).toBe("1");
  });

  it("keeps a playing story playing (no pause, no extra play call)", async () => {
    await mountPage();
    await audio.play();
    audio.play.mockClear();
    buttons()[1].click();
    expect(audio.currentTime).toBe(240.5);
    expect(audio.pause).not.toHaveBeenCalled();
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.paused).toBe(false);
  });

  it("does not scroll the page", async () => {
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    await mountPage();
    buttons()[1].click();
    ctl.tick(250);
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    delete Element.prototype.scrollIntoView;
  });
});
