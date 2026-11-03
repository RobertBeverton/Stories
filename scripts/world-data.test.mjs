import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLibrary,
  checkWorldConfigs,
  formatWarning,
  partHeadings,
  sanitizeWorldData,
  validateLoreEntry,
  validateParts,
} from "./world-data.mjs";
import { computeStories } from "./stories-lib.mjs";
import { checkLibrary } from "./schema/validate.mjs";

// All story and lore text here is invented placeholder text.

const body = (...titles) => titles.map((t) => `## ${t}\n\nSome invented words.\n`).join("\n");
const HEADINGS = ["Part One. The Start", "Part Two. The Middle"];

const goodConfig = { name: "alpha", title: "Alpha", tagline: "Invented.", accent: "sage", icon: "sun" };

describe("checkWorldConfigs", () => {
  it("accepts a complete config", () => {
    expect(checkWorldConfigs([goodConfig, { ...goodConfig, name: "beta", lorePath: "lore" }])).toEqual([]);
  });

  it("fails on an unknown accent, naming the world and the valid names", () => {
    const errors = checkWorldConfigs([{ ...goodConfig, accent: "#ff0000" }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^alpha: unknown accent '#ff0000'/);
    expect(errors[0]).toMatch(/sage/);
  });

  it("fails on a missing title, tagline, bad icon, bad lorePath and duplicate name", () => {
    const errors = checkWorldConfigs([
      { name: "a", accent: "sky", icon: "spaceship", lorePath: "" },
      goodConfig,
      goodConfig,
    ]);
    expect(errors.join("\n")).toMatch(/a: missing world 'title'/);
    expect(errors.join("\n")).toMatch(/a: missing world 'tagline'/);
    expect(errors.join("\n")).toMatch(/a: invalid icon 'spaceship'/);
    expect(errors.join("\n")).toMatch(/a: 'lorePath' must be/);
    expect(errors.join("\n")).toMatch(/alpha: duplicate world name/);
  });
});

describe("partHeadings", () => {
  it("lists '## Part' headings in order and ignores other headings", () => {
    const content = "# Title\n\n## Part One. A\n\ntext\n\n## An aside\n\n## Part Two. B  \r\n";
    expect(partHeadings(content)).toEqual(["Part One. A", "Part Two. B"]);
  });

  it("returns nothing for a story without parts", () => {
    expect(partHeadings("Just words.\n")).toEqual([]);
  });
});

describe("validateParts", () => {
  const parts = [
    { title: "Part One. The Start", start: 0 },
    { title: "Part Two. The Middle", start: 240.5 },
  ];
  const ctx = { headings: HEADINGS, audioDuration: 600 };

  it("accepts parts that match the headings and fit the audio", () => {
    expect(validateParts(parts, ctx)).toEqual({ parts, problems: [] });
  });

  it("treats absent or empty parts as no parts, without a problem", () => {
    expect(validateParts(undefined, ctx)).toEqual({ parts: null, problems: [] });
    expect(validateParts([], ctx)).toEqual({ parts: null, problems: [] });
  });

  it("strips fields the contract does not allow", () => {
    const result = validateParts([{ ...parts[0], extra: 1 }, parts[1]], ctx);
    expect(result.parts[0]).toEqual(parts[0]);
  });

  it("drops parts when the count differs from the headings", () => {
    const result = validateParts(parts.slice(0, 1), ctx);
    expect(result.parts).toBeNull();
    expect(result.problems[0]).toMatch(/1 entries but the story has 2/);
  });

  it("drops parts whose titles are out of order", () => {
    const swapped = [{ ...parts[0], title: parts[1].title }, { ...parts[1], title: parts[0].title }];
    const result = validateParts(swapped, ctx);
    expect(result.parts).toBeNull();
    expect(result.problems.join(" ")).toMatch(/does not match heading/);
  });

  it("matches titles the narrator recorded with emphasis markers stripped", () => {
    const emphasised = { headings: ["Part One. The *Big* Day", "Part Two. _Quiet_ Night"], audioDuration: 600 };
    const recorded = [
      { title: "Part One. The Big Day", start: 0 },
      { title: "Part Two. Quiet Night", start: 100 },
    ];
    const result = validateParts(recorded, emphasised);
    expect(result.problems).toEqual([]);
    expect(result.parts).toEqual(recorded);
  });

  it("still drops parts whose words differ, emphasis aside", () => {
    const result = validateParts(
      [{ title: "Part One. The Small Day", start: 0 }],
      { headings: ["Part One. The *Big* Day"], audioDuration: 600 },
    );
    expect(result.parts).toBeNull();
  });

  it("drops parts whose starts are not increasing", () => {
    const result = validateParts([parts[0], { ...parts[1], start: 0 }], ctx);
    expect(result.parts).toBeNull();
    expect(result.problems[0]).toMatch(/not after/);
  });

  it("drops parts with a start beyond audioDuration (equal is fine)", () => {
    expect(validateParts(parts, { ...ctx, audioDuration: 240.5 }).parts).toEqual(parts);
    const result = validateParts(parts, { ...ctx, audioDuration: 240 });
    expect(result.parts).toBeNull();
    expect(result.problems[0]).toMatch(/beyond audioDuration 240/);
  });

  it("drops parts when there is no audioDuration to check against", () => {
    const result = validateParts(parts, { headings: HEADINGS, audioDuration: undefined });
    expect(result.parts).toBeNull();
    expect(result.problems[0]).toMatch(/no audioDuration/);
  });

  it("drops malformed entries", () => {
    expect(validateParts("nope", ctx).parts).toBeNull();
    expect(validateParts([{ title: "", start: 1 }], ctx).problems[0]).toMatch(/no title/);
    expect(validateParts([{ title: "x", start: -1 }], ctx).problems[0]).toMatch(/start must be/);
    expect(validateParts([{ title: "x", start: "3" }], ctx).problems[0]).toMatch(/start must be/);
  });
});

describe("validateLoreEntry", () => {
  const slugs = new Set(["alpha-one", "alpha-two"]);
  const file = (data) => ({
    world: "alpha",
    slug: "a-figure",
    file: "lore/alpha/a-figure.md",
    data,
    content: "\nA short invented note.\n",
  });
  const good = {
    title: "A Figure",
    tradition: "Invented",
    summary: "Made up.",
    link: "https://example.invalid/a",
    stories: ["alpha-one"],
  };

  it("builds an entry with a namespaced url and the body text", () => {
    const { entry, warnings } = validateLoreEntry(file(good), slugs);
    expect(warnings).toEqual([]);
    expect(entry).toEqual({
      world: "alpha",
      slug: "a-figure",
      title: "A Figure",
      tradition: "Invented",
      summary: "Made up.",
      link: "https://example.invalid/a",
      stories: ["alpha-one"],
      url: "/Stories/lore/alpha/a-figure/",
      body: "A short invented note.",
    });
  });

  it("drops the entry when required front matter is missing or mistyped, naming world and file", () => {
    const { entry, warnings } = validateLoreEntry(file({ ...good, summary: undefined, tradition: 4 }), slugs);
    expect(entry).toBeNull();
    expect(formatWarning(warnings[0])).toMatch(/^alpha: lore\/alpha\/a-figure\.md: lore entry dropped: 'tradition'.*'summary'/);
  });

  it("drops the entry when stories is not a list of slugs (a field-name typo)", () => {
    const { stories, ...rest } = good;
    expect(validateLoreEntry(file({ ...rest, storeis: ["alpha-one"] }), slugs).entry).toBeNull();
  });

  it("drops only dangling story slugs and keeps the entry", () => {
    const { entry, warnings } = validateLoreEntry(file({ ...good, stories: ["alpha-one", "alpha-oen"] }), slugs);
    expect(entry.stories).toEqual(["alpha-one"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/'alpha-oen' dropped/);
  });

  it("drops a link that is not http(s), keeping the entry", () => {
    const { entry, warnings } = validateLoreEntry(file({ ...good, link: "javascript:alert(1)" }), slugs);
    expect(entry.link).toBeUndefined();
    expect(warnings[0].message).toMatch(/'link' dropped/);
  });

  it("allows no link at all", () => {
    const { link, ...noLink } = good;
    const result = validateLoreEntry(file(noLink), slugs);
    expect("link" in result.entry).toBe(false);
    expect(result.warnings).toEqual([]);
  });
});

describe("sanitizeWorldData", () => {
  const story = (file, data = {}, content = "") => ({
    file,
    content,
    data: { title: file, description: "d", publishDate: "2026-01-01", ...data },
  });
  const loreFile = (world, slug, data) => ({ world, slug, file: `lore/${world}/${slug}.md`, data, content: "" });
  const loreData = (stories) => ({ title: "T", tradition: "Trad", summary: "S", stories });

  const base = () => ({
    rawStories: [
      story("stories/one.md", { audioDuration: 100, parts: [{ title: "Part One. X", start: 0 }], lore: "fig" }, body("Part One. X")),
      story("stories/b/two.md", { lore: "ghost" }),
      story("stories/b/draft.md", { draft: true }),
    ],
    manifest: { "one.md": "alpha", "b/two.md": "beta", "b/draft.md": "beta" },
    worldNames: ["alpha", "beta"],
    loreFiles: [loreFile("alpha", "fig", loreData(["one"]))],
  });

  it("passes clean data through, adding the world", () => {
    const { rawStories, lore, warnings, errors } = sanitizeWorldData(base());
    expect(errors).toEqual([]);
    expect(rawStories[0].data.world).toBe("alpha");
    expect(rawStories[0].data.parts).toHaveLength(1);
    expect(rawStories[0].data.lore).toBe("fig");
    expect(lore).toHaveLength(1);
    // beta's dangling lore link is the only warning
    expect(warnings.map(formatWarning)).toEqual([
      "beta: stories/b/two.md: lore link dropped: no lore entry 'ghost' in world 'beta'",
    ]);
    expect(rawStories[1].data.lore).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const input = base();
    sanitizeWorldData(input);
    expect(input.rawStories[1].data.lore).toBe("ghost");
    expect(input.rawStories[0].data.world).toBeUndefined();
  });

  it("scopes a problem to the world that caused it", () => {
    const input = base();
    input.rawStories[0].data.audioDuration = 5; // alpha: part start 0 is fine, so break the count instead
    input.rawStories[0].data.parts = [];
    input.rawStories[0].content = body("Part One. X");
    input.loreFiles.push(loreFile("beta", "oops", { ...loreData([]), summary: undefined }));
    const { warnings } = sanitizeWorldData(input);
    expect(warnings.filter((w) => w.world === "alpha")).toEqual([]);
    expect(warnings.filter((w) => w.world === "beta")).toHaveLength(2);
  });

  it("does not count a draft story as a link target", () => {
    const input = base();
    input.loreFiles = [loreFile("beta", "x", loreData(["b/draft"]))];
    const { lore, warnings } = sanitizeWorldData(input);
    expect(lore[0].stories).toEqual([]);
    expect(warnings.some((w) => /'b\/draft' dropped/.test(w.message))).toBe(true);
  });

  it("does not let a lore entry link to another world's story", () => {
    const input = base();
    input.loreFiles = [loreFile("alpha", "x", loreData(["b/two"]))];
    expect(sanitizeWorldData(input).lore[0].stories).toEqual([]);
  });

  it("warns and drops lore for a world that is not configured", () => {
    const input = base();
    input.loreFiles = [loreFile("gamma", "x", loreData([]))];
    const result = sanitizeWorldData(input);
    expect(result.lore).toEqual([]);
    expect(result.warnings.some((w) => w.world === "gamma")).toBe(true);
  });

  it("errors (structural) on a story missing from the manifest or in an unconfigured world", () => {
    const input = base();
    input.manifest = { "one.md": "nowhere" };
    const { errors } = sanitizeWorldData(input);
    expect(errors.join("\n")).toMatch(/stories\/one\.md: world 'nowhere' is not in content-sources\.json/);
    expect(errors.join("\n")).toMatch(/stories\/b\/two\.md: not in the world manifest/);
  });

  it("drops a story's parts and warns when they disagree with the headings", () => {
    const input = base();
    input.rawStories[0].content = body("Part One. X", "Part Two. Y");
    const { rawStories, warnings } = sanitizeWorldData(input);
    expect(rawStories[0].data.parts).toBeUndefined();
    expect(warnings.map(formatWarning)[0]).toMatch(/^alpha: stories\/one\.md: parts dropped: 'parts' has 1 entries but the story has 2/);
  });

  it("orders lore by world, then tradition, then title", () => {
    const input = base();
    input.loreFiles = [
      loreFile("beta", "z", { ...loreData([]), tradition: "A", title: "Z" }),
      loreFile("alpha", "y", { ...loreData([]), tradition: "B", title: "Y" }),
      loreFile("alpha", "x", { ...loreData([]), tradition: "A", title: "X" }),
    ];
    expect(sanitizeWorldData(input).lore.map((e) => `${e.world}/${e.slug}`)).toEqual(["alpha/x", "alpha/y", "beta/z"]);
  });
});

describe("buildLibrary", () => {
  it("emits a schema-valid library from computed stories, worlds and lore", () => {
    const raw = [
      {
        file: "stories/one.md",
        content: "words words",
        data: {
          title: "One",
          world: "alpha",
          series: "A Series",
          seriesOrder: 2,
          publishDate: new Date("2026-10-01"), // gray-matter parses unquoted dates to Date
          audioDuration: 90,
          tags: ["x"],
          parts: [{ title: "Part One. X", start: 0 }],
        },
      },
      { file: "stories/solo.md", content: "w", data: { title: "Solo", world: "beta", publishDate: "2026-09-01" } },
    ];
    const stories = computeStories(raw);
    const lore = [
      {
        world: "alpha",
        slug: "fig",
        title: "Fig",
        tradition: "T",
        summary: "S",
        stories: ["one"],
        url: "/Stories/lore/alpha/fig/",
        body: "private body is not in the index",
      },
    ];
    const library = buildLibrary({
      stories,
      sources: [goodConfig, { ...goodConfig, name: "beta", accent: "sky" }],
      lore,
    });

    expect(checkLibrary(library)).toEqual({ ok: true, errors: [] });
    const one = library.stories.find((s) => s.slug === "one");
    expect(one).toEqual({
      slug: "one",
      title: "One",
      world: "alpha",
      series: "A Series",
      seriesOrder: 2,
      durationSec: 90,
      tags: ["x"],
      url: "/Stories/stories/a-series/one/",
      icon: "sun",
      publishDate: "2026-10-01",
      parts: [{ title: "Part One. X", start: 0 }],
    });
    const solo = library.stories.find((s) => s.slug === "solo");
    expect(solo).toMatchObject({ series: null, seriesOrder: null, durationSec: null, world: "beta" });
    expect("parts" in solo).toBe(false);
    expect(library.worlds.map((w) => [w.name, w.hasLore])).toEqual([["alpha", true], ["beta", false]]);
    expect(library.lore[0]).not.toHaveProperty("body");
  });

  it("leaves out drafts (computeStories drops them)", () => {
    const stories = computeStories([
      { file: "stories/d.md", content: "w", data: { title: "D", world: "alpha", publishDate: "2026-09-01", draft: true } },
    ]);
    expect(buildLibrary({ stories, sources: [goodConfig], lore: [] }).stories).toEqual([]);
  });
});

// End to end through the real CLI in a throwaway project directory, so the
// disk loader, manifest, lore tree and exit codes are exercised for real.
describe("validate-world-data CLI", () => {
  const script = fileURLToPath(new URL("./validate-world-data.mjs", import.meta.url));

  function project(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "world-data-"));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
    return dir;
  }
  const run = (cwd, ...args) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });

  const story = (extra = "") =>
    `---\ntitle: "A Tale"\ndescription: "d"\npublishDate: 2026-10-01\naudioDuration: 100\n${extra}---\n\n${body("Part One. The Start")}`;
  const lore = (storiesLine) =>
    `---\ntitle: "A Figure"\ntradition: "Invented"\nsummary: "Made up."\n${storiesLine}\n---\n\nShort note.\n`;
  const sources = JSON.stringify([
    goodConfig,
    { ...goodConfig, name: "beta", title: "Beta", accent: "sky", icon: "boat" },
  ]);
  const manifest = JSON.stringify({ "tale.md": "alpha", "other.md": "beta" });
  const clean = () => ({
    "content-sources.json": sources,
    "stories/.worlds.json": manifest,
    "stories/tale.md": story(),
    "stories/other.md": story(),
    "lore/alpha/a-figure.md": lore("stories: [tale]"),
  });

  it("passes clean data with exit 0", () => {
    const res = run(project(clean()));
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/World data OK \(2 stories, 1 lore entries, 0 warnings\)/);
  });

  it("warns, naming world and file, and exits 0 for an injected lore typo", () => {
    const files = { ...clean(), "lore/alpha/a-figure.md": lore("stories: [tael]") };
    const res = run(project(files));
    expect(res.status).toBe(0);
    expect(res.stderr).toMatch(/alpha: lore\/alpha\/a-figure\.md: story link 'tael' dropped/);
  });

  it("fails the same typo under --strict", () => {
    const files = { ...clean(), "lore/alpha/a-figure.md": lore("stories: [tael]") };
    const res = run(project(files), "--strict");
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/failing because of --strict/);
  });

  it("fails on an unknown accent name (structural)", () => {
    const bad = JSON.stringify([{ ...goodConfig, accent: "chartreuse" }, { ...goodConfig, name: "beta" }]);
    const res = run(project({ ...clean(), "content-sources.json": bad }));
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/alpha: unknown accent 'chartreuse'/);
  });

  it("fails on a story the manifest does not know (structural)", () => {
    // Duplicate slugs are covered by checkDuplicateSlugs in validate-content.test.mjs.
    const files = { ...clean(), "stories/extra.md": story() };
    const res = run(project(files));
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/stories\/extra\.md: not in the world manifest/);
  });

  it("drops bad parts with a warning and exits 0", () => {
    const files = { ...clean(), "stories/tale.md": story('parts:\n  - { title: "Part One. The Start", start: 500 }\n') };
    const res = run(project(files));
    expect(res.status).toBe(0);
    expect(res.stderr).toMatch(/alpha: stories\/tale\.md: parts dropped: .*beyond audioDuration 100/);
  });

  it("checks a single world repo's own layout with --world, with no manifest or config", () => {
    const dir = project({
      "stories/tale.md": story(),
      "lore/a-figure.md": lore("stories: [tael]"),
    });
    expect(run(dir, "--world", "alpha").status).toBe(0);
    const strict = run(dir, "--strict", "--world", "alpha");
    expect(strict.status).toBe(1);
    expect(strict.stderr).toMatch(/alpha: lore\/a-figure\.md: story link 'tael' dropped/);
  });

  it("rejects unknown arguments", () => {
    const res = run(project(clean()), "--bogus");
    expect(res.status).not.toBe(0);
  });
});
