# Isles of Yum Scaffold Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up a new, separate, public GitHub repo (`RobertBeverton/isles-of-yum`) with a working 11ty site pipeline, content validation, a `/write-isles-story` skill, and a local-only ElevenLabs audio narration pipeline — ported and adapted from the existing `Stories` repo, without pulling in that repo's Felix & Alex shared-canon files.

**Architecture:** Two parts. (1) Site/content pipeline: an almost-verbatim copy of `Stories`' `site/`, `eleventy.config.js`, and generic scripts (`slugify.mjs`, `accent-colors.mjs`, `stories-lib.mjs`) — this layer is pure mechanism with zero canon-specific content, confirmed by grep. Only `validate-content.mjs` (audio becomes a warning not a hard fail) and frontmatter shape (add `islands: []`, drop `series`/`seriesOrder` as required) are adapted. (2) New audio pipeline: `audio-pipeline/narrate.mjs`, a from-scratch Node script implementing `SPEC.md`'s design (parse → flag low-confidence → batch → call ElevenLabs → concatenate via ffmpeg), never run in CI.

**Tech Stack:** Node (`.mjs`, ESM), 11ty v3, vitest, gray-matter, fast-glob, music-metadata, ffmpeg (shelled out), raw `fetch` against ElevenLabs' `POST /v1/text-to-dialogue`.

**Design doc:** `docs/plans/2026-08-30-isles-of-yum-scaffold-design.md` (this repo) has the full rationale — read it first if anything below is ambiguous.

---

### Task 0: Create the local repo folder and GitHub remote

**Files:** none (filesystem + gh CLI only)

**Step 1: Create the folder and initialize git**

```bash
mkdir -p "/d/GitHub/isles-of-yum"
cd "/d/GitHub/isles-of-yum"
git init
```

**Step 2: Create the GitHub repo (public, no auto-init — we're pushing our own initial commit)**

```bash
gh repo create RobertBeverton/isles-of-yum --public --source=. --remote=origin
```

Expected: prints the new repo URL, sets `origin` remote in this folder.

**Step 3: Verify remote**

```bash
git remote -v
```

Expected: `origin  https://github.com/RobertBeverton/isles-of-yum.git (fetch/push)`

No commit yet — first commit happens at the end of Task 1.

---

### Task 1: Port the generic 11ty pipeline (site, config, generic scripts)

These files have zero Felix & Alex canon content (verified by grep for `Felix|Alex|Bramble|shared-cannon` across `site/` — no matches) — copy verbatim, then make the two branding edits below.

**Files:**
- Copy from `d:\GitHub\Stories\site\` → `d:\GitHub\isles-of-yum\site\` (all files: `_data/buildTime.js`, `_data/stories.js`, `_includes/base.njk`, `_includes/story-card.njk`, `_includes/story.njk`, `assets/library.js`, `assets/mini-player.js`, `assets/resume.js`, `assets/search.js`, `assets/style.css`, `index.njk`, `story-pages.11ty.js`)
- Copy from `d:\GitHub\Stories\scripts\` → `d:\GitHub\isles-of-yum\scripts\`: `slugify.mjs`, `accent-colors.mjs`, `accent-colors.test.mjs`, `stories-lib.mjs`
- Copy `d:\GitHub\Stories\eleventy.config.js` → `d:\GitHub\isles-of-yum\eleventy.config.js`
- Modify: `eleventy.config.js` (pathPrefix), `scripts/stories-lib.mjs` (PATH_PREFIX constant)

**Step 1: Copy files**

```bash
cd "/d/GitHub"
cp -r Stories/site isles-of-yum/site
mkdir -p isles-of-yum/scripts
cp Stories/scripts/slugify.mjs Stories/scripts/accent-colors.mjs Stories/scripts/accent-colors.test.mjs Stories/scripts/stories-lib.mjs isles-of-yum/scripts/
cp Stories/eleventy.config.js isles-of-yum/eleventy.config.js
```

**Step 2: Update PATH_PREFIX in `scripts/stories-lib.mjs`**

Find:
```js
export const PATH_PREFIX = "/Stories";
```
Replace with:
```js
export const PATH_PREFIX = "/isles-of-yum";
```

**Step 3: Update page title/heading branding**

In `site/index.njk`, change `<h1>Stories</h1>` to `<h1>Isles of Yum</h1>` and the search placeholder from `"Search stories..."` to `"Search Isles of Yum..."`.

In `site/_includes/base.njk`, find the `<title>`/site-name text (read the file first — it likely has "Stories" in a `<title>` tag or header) and change it to "Isles of Yum".

**Step 4: Sanity-check no other repo-specific strings remain**

```bash
cd "/d/GitHub/isles-of-yum"
grep -ril "robertbeverton.github.io/Stories\|/Stories\b" site/ scripts/ eleventy.config.js
```

Expected: no matches (PATH_PREFIX was the only one; already fixed in Step 2). If matches appear, fix them the same way.

**Step 5: Commit**

```bash
git add site/ scripts/ eleventy.config.js
git commit -m "feat: port 11ty site pipeline from Stories repo"
```

---

### Task 2: package.json, .gitignore, and install dependencies

**Files:**
- Create: `d:\GitHub\isles-of-yum\package.json`
- Create: `d:\GitHub\isles-of-yum\.gitignore`

**Step 1: Write package.json**

```json
{
  "name": "isles-of-yum",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "directories": {
    "doc": "docs"
  },
  "scripts": {
    "validate": "node scripts/validate-content.mjs",
    "build": "npm run validate && npx @11ty/eleventy",
    "serve": "npx @11ty/eleventy --serve",
    "narrate": "node audio-pipeline/narrate.mjs"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "The Isles of Yum \u2014 a story world and writing project for Felix & Alex.",
  "devDependencies": {
    "@11ty/eleventy": "^3.1.6",
    "fast-glob": "^3.3.3",
    "gray-matter": "^4.0.3",
    "music-metadata": "^11.13.0",
    "vitest": "^4.1.10"
  }
}
```

**Step 2: Write .gitignore**

```
node_modules/
_site/
.DS_Store
```

**Step 3: Install**

```bash
cd "/d/GitHub/isles-of-yum"
npm install
```

Expected: installs cleanly, creates `package-lock.json` and `node_modules/`.

**Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add package.json and dependencies"
```

---

### Task 3: Content structure — sample story, frontmatter shape, narration dir

Bring across the one existing markdown story (`08_Marzipans_Well.md`) as a real fixture, since it's needed for validate-content tests and to prove the pipeline end-to-end. This is a light touch, not full migration (explicitly out of scope per the design doc) — just enough to have one real, working story.

**Files:**
- Create: `d:\GitHub\isles-of-yum\stories\marzipans-well.md`
- Create: `d:\GitHub\isles-of-yum\narration\` (empty dir placeholder via `.gitkeep`)
- Create: `d:\GitHub\isles-of-yum\audio\` (empty dir placeholder via `.gitkeep`)

**Step 1: Read the source story**

Read `C:\Users\bever\Downloads\isles-of-yum\isles-of-yum\stories\08_Marzipans_Well.md` in full (already read once earlier in this session — reuse that content).

**Step 2: Write `stories/marzipans-well.md`**

Frontmatter shape: title, description, tags, islands (new field, array — from Story_Archive.md's "Islands Featured: Satin Slopes / Rattlenut Rocks" for this story, i.e. the almond-themed island — note the actual island name isn't in World_Guide's established list yet, since this story predates that doc being fully updated; use `["Satin Slopes", "Rattlenut Rocks"]`), publishDate (use `2026-08-30`, today, since no original date is recorded), draft: true (no audio file exists yet in this repo), no `audio`/`audioDuration` fields (add them once real narration exists).

```markdown
---
title: "Marzipan's Well"
description: "Felix and Alex follow a nodding well down into an island split between two feuding almond-butter villages, and find out who's been working it, unthanked, the whole time."
tags: ["adventure", "islands", "well", "almonds", "kindness"]
islands: ["Satin Slopes", "Rattlenut Rocks"]
publishDate: 2026-08-30
draft: true
---

<full body content from the source file, unchanged>
```

**Step 3: Create placeholder dirs**

```bash
mkdir -p "/d/GitHub/isles-of-yum/narration" "/d/GitHub/isles-of-yum/audio"
touch "/d/GitHub/isles-of-yum/narration/.gitkeep" "/d/GitHub/isles-of-yum/audio/.gitkeep"
```

**Step 4: Commit**

```bash
git add stories/ narration/ audio/
git commit -m "content: add Marzipan's Well as first story (draft, pending narration)"
```

---

### Task 4: Adapt validate-content.mjs (audio warning, not hard fail)

**Files:**
- Create: `d:\GitHub\isles-of-yum\scripts\validate-content.mjs` (adapted from `d:\GitHub\Stories\scripts\validate-content.mjs`)
- Create: `d:\GitHub\isles-of-yum\scripts\validate-content.test.mjs`

**Step 1: Write the failing tests first**

```js
// scripts/validate-content.test.mjs
import { describe, it, expect } from "vitest";
import {
  checkRequiredFields,
  checkDuplicateSlugs,
  checkAudioFilesExistOrWarn,
  checkRepoSize,
} from "./validate-content.mjs";

describe("checkRequiredFields", () => {
  it("flags missing title/description/publishDate", () => {
    const stories = [{ file: "stories/a.md", data: {} }];
    const errors = checkRequiredFields(stories);
    expect(errors).toContain("stories/a.md: missing required field 'title'");
    expect(errors).toContain("stories/a.md: missing required field 'description'");
    expect(errors).toContain("stories/a.md: missing required field 'publishDate'");
  });

  it("passes when all required fields present", () => {
    const stories = [
      { file: "stories/a.md", data: { title: "A", description: "d", publishDate: "2026-01-01" } },
    ];
    expect(checkRequiredFields(stories)).toEqual([]);
  });
});

describe("checkDuplicateSlugs", () => {
  it("flags duplicate slugs", () => {
    const stories = [
      { file: "stories/a.md", slug: "a" },
      { file: "stories/b.md", slug: "a" },
    ];
    const errors = checkDuplicateSlugs(stories);
    expect(errors).toEqual(["Duplicate slug 'a': stories/a.md, stories/b.md"]);
  });
});

describe("checkAudioFilesExistOrWarn", () => {
  it("returns a warning (not an error) when audio is missing", () => {
    const stories = [{ file: "stories/a.md", data: { audio: "a.mp3" } }];
    const { errors, warnings } = checkAudioFilesExistOrWarn(stories, () => false);
    expect(errors).toEqual([]);
    expect(warnings).toEqual(["stories/a.md: audio file 'a.mp3' not found (warning only, build not blocked)"]);
  });

  it("is silent when audio field is absent", () => {
    const stories = [{ file: "stories/a.md", data: {} }];
    const { errors, warnings } = checkAudioFilesExistOrWarn(stories, () => false);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("is silent when the audio file exists", () => {
    const stories = [{ file: "stories/a.md", data: { audio: "a.mp3" } }];
    const { errors, warnings } = checkAudioFilesExistOrWarn(stories, () => true);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe("checkRepoSize", () => {
  it("flags total size over threshold", () => {
    const errors = checkRepoSize([600, 600], 1000, 900);
    expect(errors.some((e) => e.includes("exceeds guard threshold"))).toBe(true);
  });
});
```

**Step 2: Run to verify it fails**

```bash
cd "/d/GitHub/isles-of-yum"
npx vitest run scripts/validate-content.test.mjs
```

Expected: FAIL — `validate-content.mjs` does not exist yet.

**Step 3: Write `scripts/validate-content.mjs`**

Adapted from `Stories/scripts/validate-content.mjs`:
- Drop `checkDuplicateSeriesOrder` (Isles of Yum stories don't use `series`/`seriesOrder`).
- Rename `checkAudioFilesExist` → `checkAudioFilesExistOrWarn`, returning `{ errors, warnings }` instead of a flat error array, and treating **missing audio as a warning regardless of `draft` status** (Stories only warns for non-draft; here it's always non-blocking since the narration pipeline lags story-writing by design).
- Keep `checkRequiredFields`, `checkDuplicateSlugs`, `checkRepoSize`, `slugify`, `loadStories`, `deriveAudioDurations` logic unchanged (duration mismatch stays a hard fail once a file exists — that's a real correctness bug, not a "haven't gotten to it yet" state).

```js
import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseFile } from "music-metadata";

export function checkRequiredFields(stories) {
  const required = ["title", "description", "publishDate"];
  const errors = [];
  for (const story of stories) {
    for (const field of required) {
      if (!story.data[field]) {
        errors.push(`${story.file}: missing required field '${field}'`);
      }
    }
  }
  return errors;
}

export function checkDuplicateSlugs(stories) {
  const seen = new Map();
  for (const story of stories) {
    if (!seen.has(story.slug)) seen.set(story.slug, []);
    seen.get(story.slug).push(story.file);
  }
  const errors = [];
  for (const [slug, files] of seen) {
    if (files.length > 1) {
      errors.push(`Duplicate slug '${slug}': ${files.join(", ")}`);
    }
  }
  return errors;
}

export function slugify(filePath) {
  const relative = path.relative("stories", filePath).replace(/\.md$/, "");
  return relative.split(path.sep).join("/");
}

export async function loadStories(globPattern = "stories/**/*.md") {
  const files = await fg(globPattern);
  return files.map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    const { data } = matter(raw);
    return { file, data, slug: slugify(file) };
  });
}

// Unlike Stories (audio required for non-draft), Isles of Yum treats missing
// audio as a non-blocking warning always: the narration pipeline is a
// separate, slower, manual step run after a story is written, so a story
// pending narration is a normal, expected state, not a build error.
export function checkAudioFilesExistOrWarn(stories, exists) {
  const errors = [];
  const warnings = [];
  for (const story of stories) {
    if (!story.data.audio) continue;
    const audioPath = path.join(path.dirname(story.file), story.data.audio);
    if (!exists(audioPath)) {
      warnings.push(`${story.file}: audio file '${story.data.audio}' not found (warning only, build not blocked)`);
    }
  }
  return { errors, warnings };
}

export function checkRepoSize(fileSizes, maxTotalBytes, maxFileBytes) {
  const errors = [];
  const total = fileSizes.reduce((a, b) => a + b, 0);
  if (total > maxTotalBytes) {
    errors.push(
      `Total /stories size ${(total / 1024 / 1024).toFixed(1)}MB exceeds guard threshold ${maxTotalBytes / 1024 / 1024}MB`
    );
  }
  const tooBig = fileSizes.find((s) => s > maxFileBytes);
  if (tooBig) {
    errors.push(`A file in /stories exceeds ${maxFileBytes / 1024 / 1024}MB (${(tooBig / 1024 / 1024).toFixed(1)}MB)`);
  }
  return errors;
}

async function deriveAudioDurations(stories) {
  const errors = [];
  for (const story of stories) {
    if (!story.data.audio) continue;
    const audioPath = path.join(path.dirname(story.file), story.data.audio);
    if (!fs.existsSync(audioPath)) continue;
    let metadata;
    try {
      metadata = await parseFile(audioPath);
    } catch (err) {
      errors.push(
        `${story.file}: failed to read audio duration from '${story.data.audio}' (${err.message})`
      );
      continue;
    }
    const seconds = Math.round(metadata.format.duration ?? 0);
    if (story.data.audioDuration !== seconds) {
      const raw = fs.readFileSync(story.file, "utf8");
      const updated = raw.replace(
        /audioDuration:\s*\d+/,
        `audioDuration: ${seconds}`
      );
      fs.writeFileSync(story.file, updated);
      console.log(`${story.file}: audioDuration updated to ${seconds}`);
    }
  }
  return errors;
}

async function main() {
  const stories = await loadStories();
  const audioDurationErrors = await deriveAudioDurations(stories);
  const refreshed = await loadStories();

  const fileSizes = refreshed
    .filter((s) => s.data.audio)
    .map((s) => {
      const p = path.join(path.dirname(s.file), s.data.audio);
      return fs.existsSync(p) ? fs.statSync(p).size : 0;
    });

  const { errors: audioErrors, warnings: audioWarnings } = checkAudioFilesExistOrWarn(
    refreshed,
    (p) => fs.existsSync(p)
  );

  const errors = [
    ...audioDurationErrors,
    ...checkRequiredFields(refreshed),
    ...checkDuplicateSlugs(refreshed),
    ...audioErrors,
    ...checkRepoSize(fileSizes, 700 * 1024 * 1024, 90 * 1024 * 1024),
  ];

  if (audioWarnings.length > 0) {
    console.warn("Content validation warnings:\n" + audioWarnings.map((w) => `  - ${w}`).join("\n"));
  }

  if (errors.length > 0) {
    console.error("Content validation failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`Content validation passed (${refreshed.length} stories checked).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run scripts/validate-content.test.mjs
```

Expected: PASS (all cases green).

**Step 5: Run the real validate script against the actual content**

```bash
npm run validate
```

Expected: prints an audio warning for `marzipans-well.md` (no audio yet) but exits 0.

**Step 6: Commit**

```bash
git add scripts/validate-content.mjs scripts/validate-content.test.mjs
git commit -m "feat: add validate-content with non-blocking audio warnings"
```

---

### Task 5: GitHub Actions build workflow

**Files:**
- Create: `d:\GitHub\isles-of-yum\.github\workflows\build.yml`

**Step 1: Write the workflow (ported from Stories, unchanged — validate/build/deploy steps are already generic)**

```yaml
name: Build and Deploy

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run validate
      - run: npx @11ty/eleventy
      - if: github.ref == 'refs/heads/main'
        uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Step 2: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci: add build and deploy workflow"
```

**Step 3: Push and enable Pages (do this now so the first Action run has somewhere to deploy to)**

```bash
git push -u origin main
gh api -X POST repos/RobertBeverton/isles-of-yum/pages -f "build_type=workflow" 2>&1 || echo "Pages may need enabling manually in repo Settings > Pages > Source: GitHub Actions"
```

Expected: push succeeds; Pages API call either succeeds or (if it 404s/409s because Pages needs the first successful Actions run first) — in that case enable it manually via `gh repo view --web` → Settings → Pages → Source: GitHub Actions, or wait and rerun after Task 5's push triggers the first build.

**Step 4: Verify the Action run**

```bash
gh run list --repo RobertBeverton/isles-of-yum --limit 3
```

Expected: a run for the push, ideally succeeding. If `npm run validate` or the build fails, read the run log (`gh run view --repo RobertBeverton/isles-of-yum --log-failed`) and fix before continuing — don't proceed to later tasks with a broken CI baseline.

---

### Task 6: reference/ and docs/process/ (world docs + writing process)

**Files:**
- Create: `d:\GitHub\isles-of-yum\reference\World_Guide.md` (copy from source, unchanged)
- Create: `d:\GitHub\isles-of-yum\reference\Story_Archive.md` (copy from source, unchanged)
- Create: `d:\GitHub\isles-of-yum\reference\Ideas_and_Arcs_Tracker.md` (copy from source, unchanged)
- Create: `d:\GitHub\isles-of-yum\audio-pipeline\SPEC.md` (copy from source, unchanged — historical spec, kept for reference alongside the real implementation built in Task 7)
- Create: `d:\GitHub\isles-of-yum\docs\process\README.md` (new, short index)

**Step 1: Copy the three reference docs and the spec verbatim**

```bash
mkdir -p "/d/GitHub/isles-of-yum/reference" "/d/GitHub/isles-of-yum/audio-pipeline"
cp "/c/Users/bever/Downloads/isles-of-yum/isles-of-yum/docs/World_Guide.md" "/d/GitHub/isles-of-yum/reference/World_Guide.md"
cp "/c/Users/bever/Downloads/isles-of-yum/isles-of-yum/docs/Story_Archive.md" "/d/GitHub/isles-of-yum/reference/Story_Archive.md"
cp "/c/Users/bever/Downloads/isles-of-yum/isles-of-yum/docs/Ideas_and_Arcs_Tracker.md" "/d/GitHub/isles-of-yum/reference/Ideas_and_Arcs_Tracker.md"
cp "/c/Users/bever/Downloads/isles-of-yum/isles-of-yum/audio-pipeline/SPEC.md" "/d/GitHub/isles-of-yum/audio-pipeline/SPEC.md"
```

**Step 2: Write `docs/process/README.md`**

```markdown
# Isles of Yum — writing process index

Read in this order when starting or continuing any story work:

1. `reference/World_Guide.md` — the master reference: world premise, established
   islands, characters, craft rules, and the writing process. Written so a new
   session can pick up the whole project cold.
2. `reference/Story_Archive.md` — every story written so far, with craft notes
   on what worked. Check the latest entry before starting something new.
3. `reference/Ideas_and_Arcs_Tracker.md` — seeds not yet used.

The World Guide's "THE WRITING PROCESS THAT'S WORKED" section is authoritative.
Short version: outline first, run the two-persona check (five-year-old listener +
editor) on the outline before drafting, write the full draft, run at least one
full review pass, then lock.

For narration, see `audio-pipeline/SPEC.md` for the design and
`audio-pipeline/narrate.mjs` for the implementation.
```

**Step 3: Commit**

```bash
cd "/d/GitHub/isles-of-yum"
git add reference/ audio-pipeline/SPEC.md docs/process/README.md
git commit -m "docs: add world reference, story archive, and process index"
```

---

### Task 7: Audio pipeline — narrate.mjs (parser + batcher, TDD)

This is the new, from-scratch piece. Build it test-first: parser and batcher are pure functions with no network/filesystem dependency, so they're fully unit-testable without an API key.

**Files:**
- Create: `d:\GitHub\isles-of-yum\audio-pipeline\narrate.mjs`
- Create: `d:\GitHub\isles-of-yum\audio-pipeline\narrate.test.mjs`
- Create: `d:\GitHub\isles-of-yum\audio-pipeline\voice_map.json`

**Step 1: Write the failing tests for the parser**

```js
// audio-pipeline/narrate.test.mjs
import { describe, it, expect } from "vitest";
import { parseScenes, splitIntoTurns, flagLowConfidence, mergeAdjacentTurns, packBatches } from "./narrate.mjs";

describe("parseScenes", () => {
  it("splits on scene-break lines", () => {
    const md = "Scene one.\n\n• • •\n\nScene two.";
    expect(parseScenes(md)).toEqual(["Scene one.", "Scene two."]);
  });

  it("returns a single scene when there is no break", () => {
    expect(parseScenes("Just one scene.")).toEqual(["Just one scene."]);
  });
});

describe("splitIntoTurns", () => {
  it("attributes a quote to the speaker named in an adjacent dialogue tag", () => {
    const text = `"Alex," said Felix, "the water's gone weird."`;
    const turns = splitIntoTurns(text);
    expect(turns).toEqual([
      { speaker: "FELIX", text: `"Alex," said Felix, "the water's gone weird."`, confident: true },
    ]);
  });

  it("marks narration-only sentences as NARRATOR", () => {
    const text = "The sea had been perfectly ordinary blue-green for ages.";
    const turns = splitIntoTurns(text);
    expect(turns).toEqual([
      { speaker: "NARRATOR", text, confident: true },
    ]);
  });

  it("marks a quote with no adjacent dialogue tag as low-confidence", () => {
    const text = `"Where did it go?"`;
    const turns = splitIntoTurns(text);
    expect(turns[0].confident).toBe(false);
  });
});

describe("flagLowConfidence", () => {
  it("collects low-confidence turns with their line context", () => {
    const turns = [
      { speaker: "FELIX", text: "a", confident: true, line: 1 },
      { speaker: null, text: `"huh?"`, confident: false, line: 2 },
    ];
    const flagged = flagLowConfidence(turns);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].line).toBe(2);
  });

  it("flags a speaker not present in the voice map", () => {
    const turns = [{ speaker: "MYSTERY_KID", text: `"hi"`, confident: true, line: 3 }];
    const flagged = flagLowConfidence(turns, { NARRATOR: "x", FELIX: "y" });
    expect(flagged).toHaveLength(1);
  });
});

describe("mergeAdjacentTurns", () => {
  it("merges consecutive turns from the same speaker", () => {
    const turns = [
      { speaker: "NARRATOR", text: "One.", confident: true },
      { speaker: "NARRATOR", text: "Two.", confident: true },
      { speaker: "FELIX", text: `"Three."`, confident: true },
    ];
    const merged = mergeAdjacentTurns(turns);
    expect(merged).toEqual([
      { speaker: "NARRATOR", text: "One. Two." },
      { speaker: "FELIX", text: `"Three."` },
    ]);
  });
});

describe("packBatches", () => {
  it("packs turns under the character limit without splitting a turn", () => {
    const turns = [
      { speaker: "NARRATOR", text: "a".repeat(1000) },
      { speaker: "NARRATOR", text: "b".repeat(1000) },
    ];
    const batches = packBatches(turns, 1800);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toEqual([turns[0]]);
    expect(batches[1]).toEqual([turns[1]]);
  });

  it("packs multiple small turns into one batch", () => {
    const turns = [
      { speaker: "NARRATOR", text: "short one" },
      { speaker: "FELIX", text: "short two" },
    ];
    const batches = packBatches(turns, 1800);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });
});
```

**Step 2: Run to verify it fails**

```bash
npx vitest run audio-pipeline/narrate.test.mjs
```

Expected: FAIL — `narrate.mjs` does not exist.

**Step 3: Write `audio-pipeline/narrate.mjs`**

```js
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SCENE_BREAK = /\n\s*•\s*•\s*•\s*\n/g;
const DIALOGUE_TAG = /\b(?:said|asked|whispered|shouted|replied|cut in|added)\s+([A-Z][a-zA-Z]*)|\b([A-Z][a-zA-Z]*)\s+(?:said|asked|whispered|shouted|replied)\b/;

export function parseScenes(markdown) {
  return markdown
    .split(SCENE_BREAK)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Splits one scene's text into narration/dialogue turns at the sentence
// level. A "turn" here is one sentence. A sentence containing a quoted span
// is a dialogue turn, attributed via the nearest dialogue tag in that same
// sentence; a sentence with a quote but no resolvable tag is flagged
// low-confidence rather than guessed.
export function splitIntoTurns(text) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  return sentences.map((raw) => {
    const sentence = raw.trim();
    if (!sentence) return null;
    const hasQuote = /"[^"]+"/.test(sentence);
    if (!hasQuote) {
      return { speaker: "NARRATOR", text: sentence, confident: true };
    }
    const match = sentence.match(DIALOGUE_TAG);
    const name = match ? (match[1] || match[2]) : null;
    if (!name) {
      return { speaker: null, text: sentence, confident: false };
    }
    return { speaker: name.toUpperCase(), text: sentence, confident: true };
  }).filter(Boolean);
}

// Adds line numbers (best-effort, based on position in the original scene
// text) and checks each turn against the voice map. Any turn that was
// low-confidence at parse time, OR whose resolved speaker has no entry in
// voiceMap, is returned for the caller to report and abort on.
export function flagLowConfidence(turns, voiceMap = null) {
  return turns
    .map((t, i) => ({ ...t, line: t.line ?? i + 1 }))
    .filter((t) => !t.confident || (voiceMap && t.speaker && !(t.speaker in voiceMap)));
}

export function mergeAdjacentTurns(turns) {
  const merged = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === turn.speaker) {
      last.text = `${last.text} ${turn.text}`;
    } else {
      merged.push({ speaker: turn.speaker, text: turn.text });
    }
  }
  return merged;
}

// Greedily packs turns into batches whose summed text length stays under
// maxChars, never splitting a single turn across two batches.
export function packBatches(turns, maxChars = 1800) {
  const batches = [];
  let current = [];
  let currentLen = 0;
  for (const turn of turns) {
    const len = turn.text.length;
    if (current.length > 0 && currentLen + len > maxChars) {
      batches.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(turn);
    currentLen += len;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function callElevenLabs(batch, voiceMap, apiKey, cacheDir) {
  const inputs = batch.map((t) => ({ text: t.text, voice_id: voiceMap[t.speaker] }));
  const key = crypto.createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
  const cachePath = path.join(cacheDir, `${key}.mp3`);
  if (fs.existsSync(cachePath)) return cachePath;

  const res = await fetch("https://api.elevenlabs.io/v1/text-to-dialogue", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs request failed (${res.status}): ${await res.text()}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, buffer);
  return cachePath;
}

function concatWithFfmpeg(mp3Paths, outPath) {
  const listPath = path.join(path.dirname(outPath), `.concat-list-${Date.now()}.txt`);
  const listContent = mp3Paths.map((p) => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listPath, listContent);
  try {
    execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);
  } finally {
    fs.unlinkSync(listPath);
  }
}

async function main() {
  const [, , storyPath, ...rest] = process.argv;
  if (!storyPath) {
    console.error("Usage: node audio-pipeline/narrate.mjs <story.md> --voice-map <voice_map.json> --out <out.mp3>");
    process.exit(1);
  }
  const voiceMapPath = rest[rest.indexOf("--voice-map") + 1] ?? "audio-pipeline/voice_map.json";
  const outPath = rest[rest.indexOf("--out") + 1];
  if (!outPath) {
    console.error("Missing --out <path.mp3>");
    process.exit(1);
  }

  const voiceMap = JSON.parse(fs.readFileSync(voiceMapPath, "utf8"));
  const markdown = fs.readFileSync(storyPath, "utf8").replace(/^---[\s\S]*?---\n/, "");

  const scenes = parseScenes(markdown);
  const allTurns = scenes.flatMap((scene) => splitIntoTurns(scene));

  const flagged = flagLowConfidence(allTurns, voiceMap);
  if (flagged.length > 0) {
    console.error(`✖ ${flagged.length} low-confidence attribution(s) found:`);
    for (const t of flagged) {
      console.error(`  line ${t.line}: "${t.text.slice(0, 60)}..." (speaker: ${t.speaker ?? "unresolved"})`);
    }
    console.error("Fix these in the source file and rerun. No audio generated.");
    process.exit(1);
  }

  const merged = mergeAdjacentTurns(allTurns);
  const batches = packBatches(merged, 1800);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Missing ELEVENLABS_API_KEY environment variable.");
    process.exit(1);
  }

  const cacheDir = path.join(path.dirname(outPath), ".narrate-cache");
  const batchPaths = [];
  for (const [i, batch] of batches.entries()) {
    console.log(`Generating batch ${i + 1}/${batches.length}...`);
    batchPaths.push(await callElevenLabs(batch, voiceMap, apiKey, cacheDir));
  }

  concatWithFfmpeg(batchPaths, outPath);

  const { parseFile } = await import("music-metadata");
  const metadata = await parseFile(outPath);
  console.log(`Done: ${outPath} (${Math.round(metadata.format.duration ?? 0)}s)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run audio-pipeline/narrate.test.mjs
```

Expected: PASS on all parser/batcher cases. `main()` is not exercised by tests (it needs a real API key and is gated by the `import.meta.url` check), which is correct — no live API calls in tests.

**Step 5: Write `audio-pipeline/voice_map.json`**

```json
{
  "NARRATOR": "REPLACE_WITH_VOICE_ID",
  "FELIX": "REPLACE_WITH_VOICE_ID",
  "ALEX": "REPLACE_WITH_VOICE_ID",
  "MARZIPAN": "REPLACE_WITH_VOICE_ID"
}
```

**Step 6: Commit**

```bash
git add audio-pipeline/narrate.mjs audio-pipeline/narrate.test.mjs audio-pipeline/voice_map.json
git commit -m "feat: add ElevenLabs narration pipeline (parser, batcher, client)"
```

**Note for whoever runs this for real:** set `ELEVENLABS_API_KEY` in the shell env, fill in real voice_ids in `voice_map.json`, ensure `ffmpeg` is on PATH (confirmed present on this machine, version 8.1), then run e.g. `npm run narrate -- stories/marzipans-well.md --voice-map audio-pipeline/voice_map.json --out audio/marzipans-well.mp3`. The dialogue-tag regex is a reasonable first pass but will need real-world tuning against actual story prose — expect some low-confidence flags on the first run against `marzipans-well.md` and treat fixing those (either the regex or the source prose's tag phrasing) as normal first-use iteration, not a bug.

---

### Task 8: `/write-isles-story` skill and CLAUDE.md

**Files:**
- Create: `d:\GitHub\isles-of-yum\.claude\commands\write-isles-story.md`
- Create: `d:\GitHub\isles-of-yum\CLAUDE.md`

**Step 1: Write the skill**

```markdown
---
description: Write, review, lock, and produce narration for a new Isles of Yum story from just a premise
---

Story premise: $ARGUMENTS

Produce this as a complete, locked, narration-ready Isles of Yum story, following this world's own established process. Do not invent a new process — read the docs below first.

## 1. Read first (in order)
1. `docs/process/README.md` — the index.
2. `reference/World_Guide.md` in full — premise, established islands, characters, craft rules (especially the no-true-villain toolkit and the cheeky-mischief-maker pattern), and the writing process.
3. `reference/Story_Archive.md` — check the latest few entries for recent craft notes and which islands are overdue for a revisit vs. recently used (the "Islands Featured" field tracks this).
4. `reference/Ideas_and_Arcs_Tracker.md` if the premise is vague — it's a parking lot of ready-to-use seeds.

## 2. Outline first
Pick location(s), the core problem (must fit the non-villain toolkit — craft rule 1), and one clear affirmation/theme. Sketch which named character gets which job (craft rule 3) before writing prose.

## 3. Quick two-persona check on the outline
Run in-character, before drafting: 🧒 Five-year-old listener (is it fun, clear, not scary in the wrong way?) and ✏️ Editor (structure, tension-type variety per craft rule 2, villain rules, character balance, jeopardy calibration per craft rule 2's detail list).

## 4. Draft
Write the full draft against all craft rules in `reference/World_Guide.md` (villain toolkit, tension variety, character jobs, scope-by-stakes, plant-then-payoff, concrete-not-abstract, exactly two postscripts, show-don't-state the affirmation). Give Felix and Alex both real agency. Word count is a target the story earns, not a ceiling.

## 5. Review pass(es)
Run at least one full review pass. For long/ambitious stories, draft in sections and review each as written, then do one final full read-through for flow, plants/payoffs, and character balance (per World Guide's process step 6). Apply only fixes that survive a second look — not everything flagged needs fixing.

## 6. Lock
Once review is applied, treat the prose as LOCKED. Create the story file:

`stories/<kebab-case-title>.md`, frontmatter matching `stories/marzipans-well.md`'s shape:
```yaml
---
title: "Story Title"
description: "One or two sentences."
tags: ["tag1", "tag2"]
islands: ["Island Name"]
publishDate: <today's date>
draft: true
---
```
(`draft: true` until narration exists — see step 7. `audio`/`audioDuration` fields get added once narration is produced.)

## 7. Produce the narration script
Follow `audio-pipeline/SPEC.md`'s input-format assumptions (scene breaks as `• • •`, standard-quote dialogue) — the locked story file in `stories/` already IS the narration input; no separate stripped version is needed unless the reading version has non-narratable elements (stage directions, etc.) to strip into a `narration/<slug>-narration.md` variant. If narration script differs from the reading version, save it there.

Do not run `audio-pipeline/narrate.mjs` automatically — that requires a human-supplied `ELEVENLABS_API_KEY` and real voice IDs; hand off to the user to run narration themselves once ready.

## 8. Update the archive
Add an entry to `reference/Story_Archive.md` following its established template (Cast / Length / Islands Featured / Summary / What worked / What to watch for next time). Check off any used seed in `reference/Ideas_and_Arcs_Tracker.md`.

## 9. Report back
Summarize: word count, which review notes were applied, file path(s) created, and any open decision that needs the user's call (a new recurring character, a new Fleet vehicle stage, a tone judgment only they can make).
```

**Step 2: Write CLAUDE.md**

```markdown
# Isles of Yum

A story world and writing project for Felix & Alex — bedtime stories set in a
magical food-themed archipelago. Static 11ty site, deployed to GitHub Pages.

**Read first, always:** `reference/World_Guide.md` — world premise, established
islands, characters, craft rules, and the writing process. Written so a new
session can pick up the whole project cold. Then `reference/Story_Archive.md`
for what's been written and what worked.

**Writing a new story:** use `/write-isles-story <premise>`, or follow
`docs/process/README.md` manually.

**Local development:**
```bash
npm install
npm run serve      # local dev server with live reload
npm run validate   # check story content (missing audio is a warning, not a failure)
npx vitest run     # run the test suite
```

**Narration:** `audio-pipeline/narrate.mjs` turns a locked story into a
multi-voice MP3 via ElevenLabs. Requires `ELEVENLABS_API_KEY` env var and real
voice IDs in `audio-pipeline/voice_map.json` (ships with placeholders). Never
runs in CI — local only. See `audio-pipeline/SPEC.md` for the design.

This repo is intentionally separate from the `Stories` repo (Felix & Alex's
Bramble Wall / Trio Force shared-canon world) — different canon, different
process, kept apart so neither pollutes the other's context.
```

**Step 3: Commit**

```bash
git add .claude/commands/write-isles-story.md CLAUDE.md
git commit -m "docs: add write-isles-story skill and CLAUDE.md"
```

---

### Task 9: Final verification and push

**Step 1: Run the full test suite**

```bash
cd "/d/GitHub/isles-of-yum"
npx vitest run
```

Expected: all tests pass (validate-content, narrate parser/batcher, accent-colors ported tests).

**Step 2: Run validate and build locally**

```bash
npm run validate
npx @11ty/eleventy
```

Expected: validate passes (with the expected audio warning for marzipans-well.md), eleventy builds `_site/` without error.

**Step 3: Spot-check the built site**

```bash
npx @11ty/eleventy --serve
```

Open the local dev URL, confirm the library page shows "Isles of Yum" branding and the Marzipan's Well card renders (it's `draft: true` so it may be excluded from the library listing — check `site/_data/stories.js`/`stories-lib.mjs`'s draft filter; if it's hidden, that's expected behavior carried over from Stories, not a bug).

**Step 4: Push everything**

```bash
git push origin main
```

**Step 5: Verify the deployed Action succeeds**

```bash
gh run list --repo RobertBeverton/isles-of-yum --limit 3
gh run view --repo RobertBeverton/isles-of-yum --log-failed  # only if the latest run failed
```

Expected: green run, Pages deployed. Get the live URL:

```bash
gh api repos/RobertBeverton/isles-of-yum/pages --jq .html_url
```

**Step 6: Report back to the user**

Summarize: repo URL, live Pages URL, what was ported vs. newly built, that content migration (remaining 6 archive-referenced stories + 3 PDFs) and real ElevenLabs testing (needs API key + voice IDs) are explicitly deferred per the design doc.
