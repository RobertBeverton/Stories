// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMediaMetadata } from "../../site/assets/js/media-session.mjs";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { libraryPageHtml, loadPage, seed, progressV2, stubLibraryFetch, useFixedNow } from "./helpers.mjs";

let main;

beforeEach(async () => {
  localStorage.clear();
  resetLibrary();
  useFixedNow();
  stubLibraryFetch();
  loadPage(libraryPageHtml);
  main = await import("../../site/assets/js/main.js");
});
afterEach(() => {
  main.unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("main.js", () => {
  it("mounts each data-mount element and tolerates modules that do not exist yet (dock)", async () => {
    seed(progressV2);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await main.mountAll();
    await vi.waitFor(() => expect(document.querySelector('[data-mount="continue"] a')).not.toBeNull());
    expect(document.querySelector('[data-mount="world-switcher"] button[data-world]')).not.toBeNull();
    expect(document.querySelector('[data-mount="filters"] [data-filter]')).not.toBeNull();
    expect(document.querySelector('[data-mount="played-lately"] li')).not.toBeNull();
    // dock is wave 2: its failure is a warning, not a crash.
    expect(warn.mock.calls.some((c) => String(c[0]).includes("dock"))).toBe(true);
  });

  it("ignores unknown data-mount names and does not mount twice", async () => {
    const odd = document.createElement("div");
    odd.dataset.mount = "nonsense";
    document.body.append(odd);
    await main.mountAll();
    await main.mountAll();
    expect(odd.children).toHaveLength(0);
    expect(document.querySelectorAll('[data-mount="world-switcher"] [role="group"]')).toHaveLength(1);
  });

  it("unmountAll tears modules down so they can mount again", async () => {
    await main.mountAll();
    await vi.waitFor(() => expect(document.querySelector('[data-mount="world-switcher"] button')).not.toBeNull());
    main.unmountAll();
    expect(document.querySelector('[data-mount="world-switcher"]').children).toHaveLength(0);
    await main.mountAll();
    await vi.waitFor(() => expect(document.querySelector('[data-mount="world-switcher"] button')).not.toBeNull());
  });
});

describe("buildMediaMetadata", () => {
  it("builds MediaMetadata-shaped data", () => {
    const meta = buildMediaMetadata({ title: "A Title", artworkUrl: "/Stories/assets/app-icon-512.png" });
    expect(meta.title).toBe("A Title");
    expect(meta.artist).toBe("Stories");
    expect(meta.artwork[0].src).toContain("app-icon-512.png");
  });

  it("falls back to a generic title and no artwork", () => {
    expect(buildMediaMetadata({}).title).toBe("Stories");
    expect(buildMediaMetadata({}).artwork).toEqual([]);
  });
});
