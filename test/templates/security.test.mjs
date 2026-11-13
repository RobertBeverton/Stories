// The page CSP only protects scripts if no page needs an inline one. This renders
// the real pages and checks them against the policy they carry.
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { accentColorFor } from "../../scripts/accent-colors.mjs";
import { AUDIO_ORIGIN } from "../../scripts/audio-origin.mjs";
import { buildImportMap, contentSecurityPolicy, pageSecurity, scriptHash } from "../../scripts/page-security.mjs";
import { renderHome, renderLibrary, renderStory } from "./render-pages.mjs";

const SERIES = "The Placeholder Series";
const story = (n) => ({
  slug: `test-world/tale-${n}`,
  title: `Tale ${n}`,
  description: "Invented placeholder text.",
  series: SERIES,
  tags: [],
  icon: "sun",
  accentColor: accentColorFor(SERIES),
  publishDate: new Date(`2026-10-0${n}T00:00:00Z`),
  audioDuration: 600,
  audioMinutes: 10,
  readMinutes: 4,
  url: `/Stories/stories/tale-${n}/`,
  audioUrl: `${AUDIO_ORIGIN}/test-world/tale-${n}.mp3?v=abc`,
  keyIslands: [],
  characters: [],
});
const stories = [1, 2].map(story);
stories.groups = [{ series: SERIES, accentColor: accentColorFor(SERIES), stories, keyIslands: [], characters: [] }];

const pages = {
  home: () => renderHome(stories),
  library: () => renderLibrary(stories),
  story: () => renderStory(stories[0], {}, stories),
};

const csp = (doc) => doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? "";
const directive = (policy, name) => policy.split(/;\s*/).find((d) => d.startsWith(name + " "));

describe.each(Object.entries(pages))("%s page security", (_name, render) => {
  const doc = new JSDOM(render()).window.document;

  it("has a CSP meta tag first after charset, and noindex", () => {
    expect(csp(doc)).not.toBe("");
    expect(doc.querySelector('meta[name="robots"]').content).toBe("noindex");
    expect(doc.head.children[1].getAttribute("http-equiv")).toBe("Content-Security-Policy");
  });

  it("has no inline script except the import map, and the CSP hash matches it", () => {
    const inline = [...doc.querySelectorAll("script:not([src])")];
    expect(inline.map((s) => s.type)).toEqual(["importmap"]);
    expect(directive(csp(doc), "script-src")).toContain(`'${scriptHash(inline[0].textContent)}'`);
  });

  it("puts the import map before the module script", () => {
    expect([...doc.querySelectorAll("script")].map((s) => s.type)).toEqual(["importmap", "module"]);
  });

  it("has no inline event handlers and no javascript: URLs", () => {
    for (const el of doc.querySelectorAll("*")) {
      for (const attr of el.attributes) {
        expect(attr.name, `<${el.localName}>`).not.toMatch(/^on/i);
        expect(attr.value.trim(), `<${el.localName} ${attr.name}>`).not.toMatch(/^javascript:/i);
      }
    }
  });

  it("references nothing external except the audio origin", () => {
    const refs = [...doc.querySelectorAll("script[src], link[href], img[src], source[src], audio[src], video[src], iframe[src]")].map(
      (el) => el.getAttribute("src") ?? el.getAttribute("href"),
    );
    expect(refs.length).toBeGreaterThan(5);
    for (const ref of refs) {
      if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(ref)) {
        expect(new URL(ref, "https://x.invalid").origin, ref).toBe(AUDIO_ORIGIN);
      }
    }
  });
});

describe("content security policy", () => {
  const { csp: policy, hash } = pageSecurity(777);

  it("locks scripts to self plus the one import map hash", () => {
    expect(directive(policy, "script-src")).toBe(`script-src 'self' '${hash}'`);
    expect(policy).not.toMatch(/unsafe-eval/);
  });

  it("allows audio only from self and the audio origin", () => {
    expect(directive(policy, "media-src")).toBe(`media-src 'self' ${AUDIO_ORIGIN}`);
  });

  it("lets scripts fetch the audio origin and run the service worker", () => {
    const p = contentSecurityPolicy({ importMapHash: "sha256-x", audioOrigin: AUDIO_ORIGIN });
    expect(p).toContain(`connect-src 'self' ${AUDIO_ORIGIN}`);
    expect(p).toContain("worker-src 'self'");
    expect(p).toContain(`media-src 'self' ${AUDIO_ORIGIN}`);
  });

  it("sets the remaining directives", () => {
    for (const d of [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      `connect-src 'self' ${AUDIO_ORIGIN}`,
      "worker-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(policy.split("; ")).toContain(d);
    }
  });
});

describe("import map", () => {
  const { json } = buildImportMap(777);
  const map = JSON.parse(json);

  it("versions every module with the build id, keyed by its absolute URL", () => {
    expect(Object.keys(map.imports).length).toBeGreaterThan(10);
    for (const [url, versioned] of Object.entries(map.imports)) {
      expect(url).toMatch(/^\/Stories\/assets\/js\/[\w-]+\.mjs$/);
      expect(versioned).toBe(`${url}?v=777`);
    }
    expect(map.imports["/Stories/assets/js/library.mjs"]).toBeDefined();
  });

  it("is deterministic and cannot close its own script tag", () => {
    expect(buildImportMap(777).json).toBe(json);
    expect(json).not.toContain("<");
    expect(buildImportMap(778).hash).not.toBe(buildImportMap(777).hash);
  });
});
