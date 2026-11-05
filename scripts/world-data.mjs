// World data: the single source of truth for everything a story world
// contributes beyond its story text. The library emitter
// (site/library.json.11ty.js), the Eleventy data files and
// scripts/validate-world-data.mjs all call into this module, so the same
// checks run everywhere. A world repo's own CI can run them too, in fail mode
// (`validate-world-data --strict --world <name>`).
//
// Severity (docs/plans/2026-11-03-stories-app-redesign-design.md, "Validation
// severity"):
//   - STRUCTURAL problems are returned in `errors` and must fail the build:
//     duplicate slug, unknown world accent (or other bad world config), a story
//     with no world, a malformed library.json.
//   - WORLD-DATA problems are returned in `warnings`, each naming the world
//     and file, and the offending data is DROPPED: a story's `parts`, a
//     story's `lore` link, a lore entry or one of its links. One world's typo
//     therefore cannot block another world's release.
import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import { PATH_PREFIX, computeStories, loadStories } from "./stories-lib.mjs";
import { PALETTE, PALETTE_NAMES, paletteByName } from "./accent-colors.mjs";
import { ICON_NAMES, isValidIcon } from "./icons.mjs";
import { checkDuplicateSlugs } from "./validate-content.mjs";
import { checkLibrary } from "./schema/validate.mjs";
import { AUDIO_ORIGIN, isAudioUrl } from "./audio-origin.mjs";

// ---------------------------------------------------------------------------
// Small helpers

const isNonEmptyString = (v) => typeof v === "string" && v.trim() !== "";
const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());

// Path of a story relative to stories/, with forward slashes: the key used by
// the world manifest (e.g. "bramble-wall/book-1.md").
export function storyKey(file) {
  return path.relative("stories", file).split(path.sep).join("/");
}

// Story slug (see computeStories): the folder-qualified path without ".md".
export function storySlug(file) {
  return storyKey(file).replace(/\.md$/, "");
}

export function formatWarning({ world, file, message }) {
  return `${world ?? "(no world)"}: ${file}: ${message}`;
}

// gray-matter turns an unquoted YAML date into a Date. library.json wants
// "YYYY-MM-DD…".
function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return typeof value === "string" ? value : undefined;
}

// ---------------------------------------------------------------------------
// World config (content-sources.json): structural, so these are errors.

export function checkWorldConfigs(sources) {
  const errors = [];
  const seen = new Set();
  for (const source of sources) {
    const label = source?.name ?? "(unnamed source)";
    if (!isNonEmptyString(source?.name)) {
      errors.push("content-sources.json: a source has no name");
      continue;
    }
    if (seen.has(source.name)) errors.push(`${label}: duplicate world name in content-sources.json`);
    seen.add(source.name);
    if (!isNonEmptyString(source.title)) errors.push(`${label}: missing world 'title'`);
    if (typeof source.tagline !== "string") errors.push(`${label}: missing world 'tagline'`);
    if (!paletteByName(source.accent)) {
      errors.push(
        `${label}: unknown accent '${source.accent}' (must be a palette name: ${PALETTE_NAMES.join(", ")})`,
      );
    }
    if (!isValidIcon(source.icon)) {
      errors.push(`${label}: invalid icon '${source.icon}' (must be one of: ${ICON_NAMES.join(", ")})`);
    }
    if (source.lorePath !== undefined && !isNonEmptyString(source.lorePath)) {
      errors.push(`${label}: 'lorePath' must be a non-empty string when present`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Story parts

// `## Part ...` headings in a story body, in order, as their heading text
// without the leading hashes (e.g. "Part One. Two Visitors in the Hedge").
export function partHeadings(content) {
  const out = [];
  for (const match of content.matchAll(/^##[ \t]+(Part\b[^\r\n]*?)[ \t]*$/gm)) out.push(match[1]);
  return out;
}

// Heading text as the narrator records it in `parts`: emphasis markers removed
// (it strips them from the title), whitespace trimmed. Both sides of the
// comparison go through this, so `## Part One. The *Big* Day` matches a part
// titled "Part One. The Big Day".
export function plainHeading(text) {
  return String(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, "$1$2")
    .trim();
}

// Validates a story's `parts` front matter against its `## Part` headings and
// audioDuration. Returns { parts, problems }: `parts` is the cleaned list
// ({title, start} only) when valid, or null when it must be dropped.
export function validateParts(parts, { headings, audioDuration }) {
  if (parts === undefined || parts === null) return { parts: null, problems: [] };
  if (!Array.isArray(parts)) {
    return { parts: null, problems: ["'parts' must be a list of {title, start}"] };
  }
  if (parts.length === 0) return { parts: null, problems: [] };

  const problems = [];
  parts.forEach((p, i) => {
    const where = `parts[${i}]`;
    if (!p || typeof p !== "object") problems.push(`${where} must be {title, start}`);
    else {
      if (!isNonEmptyString(p.title)) problems.push(`${where} has no title`);
      if (typeof p.start !== "number" || !Number.isFinite(p.start) || p.start < 0) {
        problems.push(`${where} start must be a number of seconds, 0 or more`);
      }
    }
  });
  if (problems.length) return { parts: null, problems };

  if (parts.length !== headings.length) {
    problems.push(`'parts' has ${parts.length} entries but the story has ${headings.length} '## Part' headings`);
  } else {
    parts.forEach((p, i) => {
      if (plainHeading(p.title) !== plainHeading(headings[i])) {
        problems.push(`parts[${i}] title '${p.title}' does not match heading '${headings[i]}'`);
      }
    });
  }
  parts.forEach((p, i) => {
    if (i > 0 && p.start <= parts[i - 1].start) {
      problems.push(`parts[${i}] start ${p.start} is not after parts[${i - 1}] start ${parts[i - 1].start}`);
    }
  });
  if (typeof audioDuration !== "number" || !Number.isFinite(audioDuration)) {
    problems.push("'parts' present but the story has no audioDuration to check starts against");
  } else {
    parts.forEach((p, i) => {
      if (p.start > audioDuration) {
        problems.push(`parts[${i}] start ${p.start} is beyond audioDuration ${audioDuration}`);
      }
    });
  }
  if (problems.length) return { parts: null, problems };
  return { parts: parts.map((p) => ({ title: p.title, start: p.start })), problems: [] };
}

// ---------------------------------------------------------------------------
// Lore

// Reads lore markdown. With `world` set, `dir` is that world's lore folder
// itself (a world repo's own `lore/`); otherwise `dir` is the merged
// `lore/<world>/` tree that fetch-content writes.
export function loadLoreFiles(dir = "lore", { world = null } = {}) {
  if (!fs.existsSync(dir)) return [];
  const pattern = world ? "*.md" : "*/*.md";
  return fg
    .sync(pattern, { cwd: dir })
    .sort()
    .map((rel) => {
      const raw = fs.readFileSync(path.join(dir, rel), "utf8");
      const { data, content } = matter(raw);
      const parts = rel.split("/");
      return {
        world: world ?? parts[0],
        slug: path.basename(rel, ".md"),
        file: world ? path.posix.join("lore", rel) : path.posix.join(path.basename(dir), rel),
        data,
        content,
      };
    });
}

// Validates one lore file. `storySlugs` is the set of published story slugs
// in the entry's own world. Returns { entry, warnings }; entry is null when the
// whole entry must be dropped.
export function validateLoreEntry({ world, slug, file, data, content }, storySlugs) {
  const warnings = [];
  const warn = (message) => warnings.push({ world, file, message });

  const bad = [];
  for (const field of ["title", "tradition", "summary"]) {
    if (!isNonEmptyString(data[field])) bad.push(`'${field}' is missing or not text`);
  }
  if (!Array.isArray(data.stories) || !data.stories.every(isNonEmptyString)) {
    bad.push("'stories' must be a list of story slugs");
  }
  if (bad.length) {
    warn(`lore entry dropped: ${bad.join("; ")}`);
    return { entry: null, warnings };
  }

  const stories = [];
  for (const s of data.stories) {
    if (storySlugs.has(s)) stories.push(s);
    else warn(`story link '${s}' dropped: no such story in world '${world}'`);
  }

  let link;
  if (data.link !== undefined) {
    if (isHttpUrl(data.link)) link = data.link.trim();
    else warn(`'link' dropped: not an http(s) URL`);
  }

  const entry = {
    world,
    slug,
    title: data.title.trim(),
    tradition: data.tradition.trim(),
    summary: data.summary.trim(),
    ...(link ? { link } : {}),
    stories,
    url: `${PATH_PREFIX}/lore/${world}/${slug}/`,
    body: content.trim(),
  };
  return { entry, warnings };
}

// ---------------------------------------------------------------------------
// The shared check. Pure: no filesystem.

// Applies every world-data check.
//   rawStories: [{ file, data, content }]  (as loadStories returns)
//   manifest:   { "<path under stories/>": "<world>" }
//   worldNames: [string]
//   loreFiles:  as loadLoreFiles returns
// Returns { rawStories, lore, warnings, errors }. `rawStories` are copies whose
// data carries `world`, with invalid `parts` / `lore` removed.
export function sanitizeWorldData({ rawStories, manifest, worldNames, loreFiles }) {
  const warnings = [];
  const errors = [];

  const stories = rawStories.map((raw) => {
    const key = storyKey(raw.file);
    const world = manifest[key];
    if (!world) errors.push(`${raw.file}: not in the world manifest (stories/.worlds.json); run fetch-content`);
    else if (!worldNames.includes(world)) errors.push(`${raw.file}: world '${world}' is not in content-sources.json`);
    return { ...raw, data: { ...raw.data, ...(world ? { world } : {}) } };
  });

  // Published story slugs per world, for dangling-link checks.
  const slugsByWorld = new Map(worldNames.map((n) => [n, new Set()]));
  for (const s of stories) {
    if (s.data.draft) continue;
    slugsByWorld.get(s.data.world)?.add(storySlug(s.file));
  }

  // Lore.
  const lore = [];
  for (const file of loreFiles) {
    if (!slugsByWorld.has(file.world)) {
      warnings.push({ world: file.world, file: file.file, message: "lore dropped: no such world in content-sources.json" });
      continue;
    }
    const result = validateLoreEntry(file, slugsByWorld.get(file.world));
    warnings.push(...result.warnings);
    if (result.entry) lore.push(result.entry);
  }
  const worldOrder = new Map(worldNames.map((n, i) => [n, i]));
  lore.sort(
    (a, b) =>
      worldOrder.get(a.world) - worldOrder.get(b.world) ||
      a.tradition.localeCompare(b.tradition) ||
      a.title.localeCompare(b.title),
  );
  const loreSlugsByWorld = new Map();
  for (const e of lore) {
    if (!loreSlugsByWorld.has(e.world)) loreSlugsByWorld.set(e.world, new Set());
    loreSlugsByWorld.get(e.world).add(e.slug);
  }

  // Per-story parts and lore link.
  for (const s of stories) {
    const world = s.data.world;
    const warn = (message) => warnings.push({ world, file: s.file, message });

    const { parts, problems } = validateParts(s.data.parts, {
      headings: partHeadings(s.content),
      audioDuration: s.data.audioDuration,
    });
    if (parts) s.data.parts = parts;
    else delete s.data.parts;
    if (problems.length) warn(`parts dropped: ${problems.join("; ")}`);

    if (s.data.audioUrl !== undefined && !isAudioUrl(s.data.audioUrl)) {
      warn(`audioUrl ignored: must be an absolute https URL on ${AUDIO_ORIGIN}`);
      delete s.data.audioUrl;
    }

    if (s.data.lore !== undefined) {
      const wanted = s.data.lore;
      if (!isNonEmptyString(wanted) || !loreSlugsByWorld.get(world)?.has(wanted)) {
        warn(`lore link dropped: no lore entry '${wanted}' in world '${world}'`);
        delete s.data.lore;
      }
    }
  }

  return { rawStories: stories, lore, warnings, errors };
}

// ---------------------------------------------------------------------------
// library.json

// Builds the library.json value from computed stories (computeStories output,
// already carrying `world`, and validated `parts`), world config and lore.
export function buildLibrary({ stories, sources, lore }) {
  const hasLore = new Set(lore.map((e) => e.world));
  return {
    stories: stories.map((s) => ({
      slug: s.slug,
      title: s.title,
      world: s.world,
      series: s.series ?? null,
      seriesOrder: s.seriesOrder ?? null,
      durationSec: typeof s.audioDuration === "number" && Number.isFinite(s.audioDuration) ? s.audioDuration : null,
      tags: s.tags,
      url: s.url,
      icon: s.icon,
      publishDate: isoDate(s.publishDate),
      ...(Array.isArray(s.characters) && s.characters.some(isNonEmptyString)
        ? { characters: s.characters.filter(isNonEmptyString) }
        : {}),
      ...(s.parts ? { parts: s.parts } : {}),
    })),
    worlds: sources.map((w) => ({
      name: w.name,
      title: w.title,
      tagline: w.tagline,
      accent: w.accent,
      icon: w.icon,
      hasLore: hasLore.has(w.name),
    })),
    lore: lore.map(({ body, ...entry }) => entry),
  };
}

// ---------------------------------------------------------------------------
// Disk loader

export function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return { manifest: {}, error: `${manifestPath} not found; run fetch-content` };
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("not an object");
    return { manifest, error: null };
  } catch (err) {
    return { manifest: {}, error: `${manifestPath} is not a valid world manifest (${err.message})` };
  }
}

// Loads everything and runs every check.
//
// Default (this repo): content-sources.json, stories/.worlds.json, lore/<world>/.
// `singleWorld: { name, loreDir }` (a world repo's own CI): every story in
// ./stories belongs to that world and its lore is `loreDir` (default "lore");
// world config and library.json are not checked there.
//
// Returns { library, stories, worlds, lore, warnings, errors }. Warnings are
// objects ({world, file, message}); use formatWarning. Never throws for data
// problems, so callers choose how to report them.
export async function loadWorldData({
  sourcesPath = "content-sources.json",
  manifestPath = "stories/.worlds.json",
  loreRoot = "lore",
  storiesGlob = "stories/**/*.md",
  audioFileExists = fs.existsSync,
  singleWorld = null,
} = {}) {
  const loaded = await loadStories(storiesGlob);
  const errors = [];

  let configErrors = [];
  let sources;
  let manifest;
  let loreFiles;
  if (singleWorld) {
    sources = [{ name: singleWorld.name }];
    manifest = Object.fromEntries(loaded.map((s) => [storyKey(s.file), singleWorld.name]));
    loreFiles = loadLoreFiles(singleWorld.loreDir ?? "lore", { world: singleWorld.name });
  } else {
    sources = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
    configErrors = checkWorldConfigs(sources);
    errors.push(...configErrors);
    const read = readManifest(manifestPath);
    if (read.error) errors.push(read.error);
    manifest = read.manifest;
    loreFiles = loadLoreFiles(loreRoot);
  }

  errors.push(...checkDuplicateSlugs(loaded.map((s) => ({ file: s.file, slug: storySlug(s.file) }))));

  const result = sanitizeWorldData({
    rawStories: loaded,
    manifest,
    worldNames: sources.map((s) => s.name),
    loreFiles,
  });
  errors.push(...result.errors);

  const stories = computeStories(
    result.rawStories,
    audioFileExists,
    Object.fromEntries(sources.map((w) => [w.name, w.icon])),
  );
  const loreWorlds = new Set(result.lore.map((e) => e.world));
  const worlds = sources.map((w) => ({
    ...w,
    hasLore: loreWorlds.has(w.name),
    accentColor: paletteByName(w.accent) ?? PALETTE[0],
  }));

  let library = null;
  if (!singleWorld) {
    library = buildLibrary({ stories, sources, lore: result.lore });
    // A bad world config would only repeat itself as schema noise.
    if (configErrors.length === 0) {
      const check = checkLibrary(library);
      if (!check.ok) errors.push(...check.errors.map((e) => `library.json malformed: ${e}`));
    }
  }

  return { library, stories, worlds, lore: result.lore, warnings: result.warnings, errors };
}
