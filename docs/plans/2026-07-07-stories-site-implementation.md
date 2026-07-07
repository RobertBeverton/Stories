# Stories Site Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an 11ty-based GitHub Pages site that lists, searches, and serves the Bramble Wall story (and future stories) as readable pages with playable ElevenLabs MP3 narration, resumable per-device via localStorage, with a build-time content validation guard.

**Architecture:** 11ty (Eleventy) static site generator reads markdown+frontmatter from `/stories/**`, a pre-build Node validation script checks content integrity and derives audio duration from actual MP3 files, GitHub Actions builds on PR (validate+build only) and on push to `main` (validate+build+deploy to GitHub Pages). Client-side vanilla JS (no framework) handles search filtering and localStorage-based resume state as progressive enhancement over server-rendered HTML.

**Tech Stack:** Node 20, Eleventy (11ty) v3, `music-metadata` (pure-JS MP3 duration reading, no native deps), vanilla JS/CSS for the client, GitHub Actions, GitHub Pages.

Reference design doc: `docs/plans/2026-07-07-stories-site-design.md`

---

## Task 1: Scaffold the repo layout and move existing content

**Files:**
- Create: `stories/bramble-wall/book-1.md` (moved + frontmatter added)
- Create: `reference/bramble-wall-bible.md` (moved)
- Delete: `bramble-wall-book-1.md`, `bramble-wall-bible.md` (repo root)
- Create: `.gitignore`

**Step 1: Create the target directories and move files**

```bash
mkdir -p stories/bramble-wall reference
git mv bramble-wall-bible.md reference/bramble-wall-bible.md
git mv bramble-wall-book-1.md stories/bramble-wall/book-1.md
```

**Step 2: Add frontmatter to `stories/bramble-wall/book-1.md`**

Prepend this block to the top of the file (above the existing `# The Bramble Wall` heading):

```yaml
---
title: "The Gap in the Bramble Wall"
series: "The Bramble Wall"
seriesOrder: 1
description: "Felix and Alex find a hidden gap in a bramble wall and race a summer storm to build a den before the rain arrives."
tags: ["adventure", "forest", "brothers", "den", "storm", "radio"]
audio: "book-1.mp3"
audioDuration: 0
publishDate: 2026-07-07
draft: true
---
```

Leave `audioDuration: 0` — Task 5's validation script will overwrite it once an MP3 exists. Leave `draft: true` until you're ready for this story to appear in the live library (Task 9 covers un-drafting).

**Step 3: Add a `.gitignore`**

```
node_modules/
_site/
.cache/
```

**Step 4: Commit**

```bash
git add stories/ reference/ .gitignore
git rm bramble-wall-book-1.md bramble-wall-bible.md 2>/dev/null || true
git commit -m "Scaffold stories/reference layout, add frontmatter to book 1"
```

(If `git mv` already staged the deletes, the `git rm` is a no-op — that's fine.)

---

## Task 2: Initialize the 11ty project

**Files:**
- Create: `package.json`
- Create: `eleventy.config.js`
- Create: `site/_includes/base.njk`
- Create: `site/index.njk`

**Step 1: Initialize npm and install Eleventy**

```bash
npm init -y
npm install --save-dev @11ty/eleventy@^3
```

**Step 2: Write `eleventy.config.js`**

```js
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("stories/**/*.mp3");
  eleventyConfig.addPassthroughCopy("site/assets");

  eleventyConfig.addCollection("stories", (collectionApi) => {
    return collectionApi.getFilteredByGlob("stories/**/*.md");
  });

  return {
    dir: {
      input: "site",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
}
```

**Step 3: Update `package.json`** — add `"type": "module"` and scripts:

```json
{
  "type": "module",
  "scripts": {
    "validate": "node scripts/validate-content.mjs",
    "build": "npm run validate && npx @11ty/eleventy",
    "serve": "npx @11ty/eleventy --serve"
  }
}
```

**Step 4: Write a minimal `site/_includes/base.njk` layout**

```njk
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ title }} — Stories</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <header class="site-header"><a href="/">📚 Stories</a></header>
  <main>{{ content | safe }}</main>
</body>
</html>
```

**Step 5: Write a placeholder `site/index.njk`**

```njk
---
layout: base.njk
title: Library
---
<h1>Stories</h1>
<p>Library grid coming in a later task.</p>
```

**Step 6: Verify the build runs**

Run: `npm run build`
Expected: Eleventy builds successfully (validate script doesn't exist yet — see Task 3, so temporarily comment out `npm run validate &&` in the build script, or proceed to Task 3 first since it's next anyway). Confirm `_site/index.html` exists and contains "Stories".

**Step 7: Commit**

```bash
git add package.json package-lock.json eleventy.config.js site/
git commit -m "Initialize Eleventy project with base layout"
```

---

## Task 3: Content validation script — schema and slug/order checks

**Files:**
- Create: `scripts/validate-content.mjs`
- Create: `scripts/validate-content.test.mjs`
- Install: `vitest` (test runner), `gray-matter` (frontmatter parsing)

This is the one piece of real logic in the project, so it gets TDD treatment per @superpowers:test-driven-development.

**Step 1: Install dependencies**

```bash
npm install --save-dev vitest gray-matter fast-glob
```

**Step 2: Write the failing test** — `scripts/validate-content.test.mjs`

```js
import { describe, it, expect } from "vitest";
import { checkDuplicateSeriesOrder, checkDuplicateSlugs, checkRequiredFields } from "./validate-content.mjs";

describe("checkRequiredFields", () => {
  it("returns an error for a story missing title", () => {
    const stories = [{ file: "a.md", data: { description: "x", publishDate: "2026-01-01" } }];
    const errors = checkRequiredFields(stories);
    expect(errors).toEqual(["a.md: missing required field 'title'"]);
  });

  it("returns no errors when all required fields present", () => {
    const stories = [{ file: "a.md", data: { title: "T", description: "D", publishDate: "2026-01-01" } }];
    expect(checkRequiredFields(stories)).toEqual([]);
  });
});

describe("checkDuplicateSeriesOrder", () => {
  it("flags two stories in the same series with the same seriesOrder", () => {
    const stories = [
      { file: "a.md", data: { series: "X", seriesOrder: 1 } },
      { file: "b.md", data: { series: "X", seriesOrder: 1 } },
    ];
    expect(checkDuplicateSeriesOrder(stories)).toEqual([
      "Series 'X' has duplicate seriesOrder 1: a.md, b.md",
    ]);
  });

  it("allows same seriesOrder across different series", () => {
    const stories = [
      { file: "a.md", data: { series: "X", seriesOrder: 1 } },
      { file: "b.md", data: { series: "Y", seriesOrder: 1 } },
    ];
    expect(checkDuplicateSeriesOrder(stories)).toEqual([]);
  });
});

describe("checkDuplicateSlugs", () => {
  it("flags two files producing the same slug", () => {
    const stories = [
      { file: "stories/a/book-1.md", data: {}, slug: "book-1" },
      { file: "stories/b/book-1.md", data: {}, slug: "book-1" },
    ];
    expect(checkDuplicateSlugs(stories)).toEqual([
      "Duplicate slug 'book-1': stories/a/book-1.md, stories/b/book-1.md",
    ]);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run scripts/validate-content.test.mjs`
Expected: FAIL — `validate-content.mjs` doesn't export these functions yet (module not found or undefined export errors).

**Step 4: Write minimal implementation** — `scripts/validate-content.mjs`

```js
import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";

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

export function checkDuplicateSeriesOrder(stories) {
  const seen = new Map();
  for (const story of stories) {
    if (!story.data.series) continue;
    const key = `${story.data.series}::${story.data.seriesOrder}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(story.file);
  }
  const errors = [];
  for (const [key, files] of seen) {
    if (files.length > 1) {
      const [series, order] = key.split("::");
      errors.push(`Series '${series}' has duplicate seriesOrder ${order}: ${files.join(", ")}`);
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
  return path.basename(filePath, ".md");
}

export async function loadStories(globPattern = "stories/**/*.md") {
  const files = await fg(globPattern);
  return files.map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    const { data } = matter(raw);
    return { file, data, slug: slugify(file) };
  });
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run scripts/validate-content.test.mjs`
Expected: PASS (all tests green).

**Step 6: Commit**

```bash
git add scripts/validate-content.mjs scripts/validate-content.test.mjs package.json package-lock.json
git commit -m "Add content validation: required fields, duplicate slugs/seriesOrder"
```

---

## Task 4: Content validation script — audio file existence and repo size guard

**Files:**
- Modify: `scripts/validate-content.mjs`
- Modify: `scripts/validate-content.test.mjs`

**Step 1: Write the failing tests** — append to `scripts/validate-content.test.mjs`

```js
import { checkAudioFilesExist, checkRepoSize } from "./validate-content.mjs";

describe("checkAudioFilesExist", () => {
  it("flags a story whose audio file does not exist on disk", () => {
    const stories = [{ file: "stories/a/book-1.md", data: { audio: "missing.mp3" } }];
    const exists = (p) => false;
    expect(checkAudioFilesExist(stories, exists)).toEqual([
      "stories/a/book-1.md: audio file 'missing.mp3' not found",
    ]);
  });

  it("passes when audio file exists", () => {
    const stories = [{ file: "stories/a/book-1.md", data: { audio: "book-1.mp3" } }];
    const exists = (p) => true;
    expect(checkAudioFilesExist(stories, exists)).toEqual([]);
  });

  it("skips stories with no audio field", () => {
    const stories = [{ file: "stories/a/book-1.md", data: {} }];
    expect(checkAudioFilesExist(stories, () => false)).toEqual([]);
  });
});

describe("checkRepoSize", () => {
  it("flags when total size exceeds the max", () => {
    const sizes = [800 * 1024 * 1024];
    expect(checkRepoSize(sizes, 700 * 1024 * 1024, 90 * 1024 * 1024)).toEqual([
      "Total /stories size 800.0MB exceeds guard threshold 700MB",
    ]);
  });

  it("flags when a single file exceeds the max", () => {
    const sizes = [10 * 1024 * 1024, 95 * 1024 * 1024];
    const errors = checkRepoSize(sizes, 700 * 1024 * 1024, 90 * 1024 * 1024);
    expect(errors).toEqual(["A file in /stories exceeds 90MB (95.0MB)"]);
  });

  it("passes when under both thresholds", () => {
    expect(checkRepoSize([10 * 1024 * 1024], 700 * 1024 * 1024, 90 * 1024 * 1024)).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/validate-content.test.mjs`
Expected: FAIL — `checkAudioFilesExist` and `checkRepoSize` not exported.

**Step 3: Write minimal implementation** — append to `scripts/validate-content.mjs`

```js
export function checkAudioFilesExist(stories, exists) {
  const errors = [];
  for (const story of stories) {
    if (!story.data.audio) continue;
    const audioPath = path.join(path.dirname(story.file), story.data.audio);
    if (!exists(audioPath)) {
      errors.push(`${story.file}: audio file '${story.data.audio}' not found`);
    }
  }
  return errors;
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/validate-content.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/validate-content.mjs scripts/validate-content.test.mjs
git commit -m "Add audio-file-exists and repo-size checks to content validation"
```

---

## Task 5: Wire validation into a runnable CLI with audio duration derivation

**Files:**
- Modify: `scripts/validate-content.mjs` (add `main()` / CLI entry point)
- Install: `music-metadata`

**Step 1: Install `music-metadata`**

```bash
npm install --save-dev music-metadata
```

**Step 2: Add a `main()` function to `scripts/validate-content.mjs`** (below the existing exports, no test needed for this orchestration layer — it's glue code covered by manual verification in Step 3):

```js
import { parseFile } from "music-metadata";

async function deriveAudioDurations(stories) {
  for (const story of stories) {
    if (!story.data.audio) continue;
    const audioPath = path.join(path.dirname(story.file), story.data.audio);
    if (!fs.existsSync(audioPath)) continue;
    const metadata = await parseFile(audioPath);
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
}

async function main() {
  const stories = await loadStories();
  await deriveAudioDurations(stories);
  const refreshed = await loadStories(); // reload in case durations changed

  const fileSizes = refreshed
    .filter((s) => s.data.audio)
    .map((s) => {
      const p = path.join(path.dirname(s.file), s.data.audio);
      return fs.existsSync(p) ? fs.statSync(p).size : 0;
    });

  const errors = [
    ...checkRequiredFields(refreshed),
    ...checkDuplicateSeriesOrder(refreshed),
    ...checkDuplicateSlugs(refreshed),
    ...checkAudioFilesExist(refreshed, (p) => fs.existsSync(p)),
    ...checkRepoSize(fileSizes, 700 * 1024 * 1024, 90 * 1024 * 1024),
  ];

  if (errors.length > 0) {
    console.error("Content validation failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`Content validation passed (${refreshed.length} stories checked).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

**Step 3: Manually verify against the real content**

Run: `npm run validate`
Expected: Since `stories/bramble-wall/book-1.md` has no MP3 yet, `checkAudioFilesExist` should fail with `audio file 'book-1.mp3' not found`. This confirms the guard works end-to-end. (This is expected to fail until Task 8 adds real audio — that's fine, it proves the check is live.)

To confirm the rest of the pipeline works before audio exists, temporarily remove the `audio:` line from the frontmatter, rerun `npm run validate`, confirm it passes, then restore the `audio:` line.

**Step 4: Commit**

```bash
git add scripts/validate-content.mjs package.json package-lock.json
git commit -m "Wire validation into CLI entry point with automatic audio duration derivation"
```

---

## Task 6: Library (home) page — story cards, grouped by series

**Files:**
- Create: `site/_data/stories.js` (11ty global data file)
- Modify: `site/index.njk`
- Create: `site/assets/style.css`

**Step 1: Write `site/_data/stories.js`** — exposes parsed story metadata to templates

```js
import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";

export default async function () {
  const files = await fg("stories/**/*.md");
  const stories = files.map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    const { data, content } = matter(raw);
    const slug = path.basename(file, ".md");
    const wordCount = content.trim().split(/\s+/).length;
    const readMinutes = Math.max(1, Math.round(wordCount / 215));
    return {
      ...data,
      slug,
      url: `/stories/${data.series ? path.basename(path.dirname(file)) + "/" : ""}${slug}/`,
      readMinutes,
      audioMinutes: data.audioDuration ? Math.round(data.audioDuration / 60) : null,
    };
  });

  return stories
    .filter((s) => !s.draft)
    .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
}
```

**Step 2: Rewrite `site/index.njk`**

```njk
---
layout: base.njk
title: Library
---
<h1>Stories</h1>
<input type="search" id="search-box" placeholder="Search stories..." aria-label="Search stories">

<section aria-labelledby="all-stories-heading">
  <h2 id="all-stories-heading" class="visually-hidden">All stories</h2>
  <div class="card-grid" id="card-grid">
    {% for story in stories %}
    <a class="story-card" href="{{ story.url }}" data-title="{{ story.title }}" data-tags="{{ story.tags | join(' ') }}" data-description="{{ story.description }}">
      <h3>{{ story.title }}</h3>
      {% if story.series %}<p class="card-series">{{ story.series }} — Book {{ story.seriesOrder }}</p>{% endif %}
      <p>{{ story.description }}</p>
      <p class="card-meta">~{{ story.readMinutes }} min read{% if story.audioMinutes %} · ~{{ story.audioMinutes }} min listen{% endif %}</p>
    </a>
    {% endfor %}
  </div>
</section>

<script src="/assets/search.js"></script>
```

**Step 3: Write a minimal `site/assets/style.css`**

```css
:root { color-scheme: light dark; }
body { font-family: system-ui, sans-serif; font-size: 18px; line-height: 1.5; margin: 0; }
.site-header { padding: 1rem; font-size: 1.25rem; }
.site-header a { text-decoration: none; color: inherit; }
main { max-width: 700px; margin: 0 auto; padding: 0 1rem 2rem; }
#search-box { width: 100%; font-size: 1.1rem; padding: 0.75rem; margin-bottom: 1rem; box-sizing: border-box; min-height: 44px; }
.card-grid { display: grid; gap: 1rem; }
.story-card { display: block; padding: 1rem; border: 1px solid #8884; border-radius: 8px; text-decoration: none; color: inherit; min-height: 44px; }
.card-series { font-size: 0.9rem; opacity: 0.75; }
.card-meta { font-size: 0.9rem; opacity: 0.75; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
audio { width: 100%; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
```

**Step 4: Verify in browser**

Run: `npm run build && npx @11ty/eleventy --serve`
Open `http://localhost:8080` — expected: a card for "The Gap in the Bramble Wall" is visible (temporarily set `draft: false` in its frontmatter to see it, then set back to `true` if not ready to publish — Task 9 handles the real un-drafting decision).

**Step 5: Commit**

```bash
git add site/_data/stories.js site/index.njk site/assets/style.css
git commit -m "Add library home page with story cards"
```

---

## Task 7: Story page template with series navigation and audio player

**Files:**
- Create: `site/stories.11tydata.js` (directory data file to generate story pages)
- Create: `site/_includes/story.njk`

Eleventy needs a template that iterates `/stories/**/*.md` files directly (not just the summarized `stories` data) to render each one as its own page with full content. The cleanest approach: configure the collection in `eleventy.config.js` (already done in Task 2) and add a template that paginates over it.

**Step 1: Create `site/_includes/story.njk`**

```njk
---
layout: base.njk
---
<nav class="breadcrumb">
  <a href="/">← Library</a>
  {% if series %} · {{ series }}{% endif %}
</nav>

<h1>{{ title }}</h1>
<p class="card-meta">~{{ readMinutes }} min read{% if audioMinutes %} · ~{{ audioMinutes }} min listen{% endif %}</p>

{% if audio %}
<audio controls preload="none" id="story-audio" src="{{ audioUrl }}"></audio>
<p id="resume-banner" class="resume-banner" hidden></p>
{% endif %}

<article class="story-body">
  {{ content | safe }}
</article>

<nav class="series-nav">
  {% if prevStory %}<a href="{{ prevStory.url }}">← {{ prevStory.title }}</a>{% endif %}
  {% if nextStory %}<a href="{{ nextStory.url }}">Next: {{ nextStory.title }} →</a>{% endif %}
</nav>

<script src="/assets/resume.js" data-slug="{{ slug }}"></script>
```

**Step 2: Create a pagination template `site/story-pages.njk`** that generates one page per story using 11ty pagination over the `stories` collection (the raw markdown collection from `eleventy.config.js`, not the summarized `_data/stories.js`):

```njk
---
pagination:
  data: collections.stories
  size: 1
  alias: storyPage
permalink: "{{ storyPage.data.series and (storyPage.data.series | slugify) + '/' or '' }}{{ storyPage.fileSlug }}/index.html"
eleventyComputed:
  title: "{{ storyPage.data.title }}"
  series: "{{ storyPage.data.series }}"
  seriesOrder: "{{ storyPage.data.seriesOrder }}"
  audio: "{{ storyPage.data.audio }}"
  audioUrl: "/{{ storyPage.data.series and (storyPage.data.series | slugify) + '/' or '' }}{{ storyPage.data.audio }}"
  audioMinutes: "{{ storyPage.data.audioDuration }}"
  slug: "{{ storyPage.fileSlug }}"
layout: story.njk
---
{{ storyPage.templateContent | safe }}
```

**Note for the implementer:** 11ty pagination-over-collection-with-full-page-output is one of the fiddlier parts of Eleventy's API and the exact syntax above may need adjustment once you run it — treat the numbers/filters as a starting point. If this proves awkward, the simpler fallback (equally valid, less "clever") is to let each markdown file's own frontmatter specify `layout: story.njk` directly and rely on 11ty's default "one output file per input file" behavior instead of explicit pagination — try that first, since it's simpler, and only reach for the pagination template above if you need computed permalinks that pagination handles more easily. Prev/next (`prevStory`/`nextStory`) can be computed in `site/_data/stories.js` by grouping stories by `series` and sorting by `seriesOrder`, then attaching `prevStory`/`nextStory` references before returning — pass that through as global data keyed by slug rather than computing it in the template.

**Step 3: Verify in browser**

Run: `npm run build && npx @11ty/eleventy --serve`
Navigate to the story's URL from the library card — expected: title, read time, rendered story body, and (once Task 8 adds an MP3) a native audio player.

**Step 4: Commit**

```bash
git add site/_includes/story.njk site/story-pages.njk site/_data/stories.js
git commit -m "Add story page template with series prev/next navigation"
```

---

## Task 8: Generate and add narration audio for book 1

**Files:**
- Create: `stories/bramble-wall/book-1.mp3`

**Step 1:** Generate narration for `stories/bramble-wall/book-1.md`'s body text using ElevenLabs (outside this repo/tooling — export as MP3).

**Step 2:** Save the exported file as `stories/bramble-wall/book-1.mp3`.

**Step 3: Run validation to auto-derive duration**

Run: `npm run validate`
Expected: PASS, and `stories/bramble-wall/book-1.md`'s `audioDuration` field is automatically updated to match the real file (confirms Task 5's derivation logic against real content, not just tests).

**Step 4: Verify playback in browser**

Run: `npm run build && npx @11ty/eleventy --serve`, open the story page, press play.
Expected: audio plays, native controls (play/pause/scrub/volume) all function via mouse and keyboard (Tab to the player, Space to play/pause — confirms the native-`<audio>` accessibility decision from the design doc actually holds).

**Step 5: Commit**

```bash
git add stories/bramble-wall/book-1.mp3 stories/bramble-wall/book-1.md
git commit -m "Add narration audio for book 1"
```

---

## Task 9: Client-side search

**Files:**
- Create: `site/assets/search.js`

**Step 1: Write `site/assets/search.js`** (progressive enhancement — cards are already server-rendered and fully browsable without this script, per the design doc's no-JS guarantee)

```js
const searchBox = document.getElementById("search-box");
const cards = Array.from(document.querySelectorAll(".story-card"));

searchBox?.addEventListener("input", () => {
  const query = searchBox.value.trim().toLowerCase();
  for (const card of cards) {
    const haystack = (
      card.dataset.title + " " + card.dataset.tags + " " + card.dataset.description
    ).toLowerCase();
    const match = query === "" || haystack.includes(query);
    card.style.display = match ? "" : "none";
  }
});
```

**Step 2: Verify in browser**

Run: `npm run build && npx @11ty/eleventy --serve`
Type "fox" or another tag word into the search box (if book 1's tags/description don't contain a distinctive test word, temporarily type "storm" — it's in the description) — expected: matching cards remain, non-matching cards hide; clearing the box shows all cards again. Confirm the grid is still fully visible/browsable with JS disabled (browser dev tools → disable JavaScript → reload) per the design's no-JS content guarantee.

**Step 3: Commit**

```bash
git add site/assets/search.js
git commit -m "Add client-side search over title/tags/description"
```

---

## Task 10: Resume (localStorage progress) with accessible resume/start-over choice

**Files:**
- Create: `site/assets/resume.js`
- Modify: `site/_includes/story.njk` (already has the script tag and `#resume-banner` placeholder from Task 7)

**Step 1: Write `site/assets/resume.js`**

```js
const script = document.currentScript;
const slug = script.dataset.slug;
const storageKey = `story-progress:${slug}`;
const audio = document.getElementById("story-audio");
const banner = document.getElementById("resume-banner");

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
}

function saveProgress(partial) {
  const existing = readProgress() || {};
  localStorage.setItem(storageKey, JSON.stringify({ ...existing, ...partial, savedAt: Date.now() }));
}

const saved = readProgress();
if (saved && (saved.audioTime > 5 || saved.scrollY > 200)) {
  banner.hidden = false;
  banner.innerHTML = `
    <button id="resume-btn" type="button">⏪ Resume where you left off</button>
    <button id="restart-btn" type="button">🔄 Start over</button>
  `;
  document.getElementById("resume-btn").addEventListener("click", () => {
    if (audio && saved.audioTime) audio.currentTime = saved.audioTime;
    if (saved.scrollY) window.scrollTo({ top: saved.scrollY, behavior: "smooth" });
    banner.hidden = true;
  });
  document.getElementById("restart-btn").addEventListener("click", () => {
    // Per design: don't discard the old save immediately — only overwrite once
    // the new session actually progresses past the start, so an accidental
    // tap here is still recoverable.
    banner.hidden = true;
  });
}

if (audio) {
  let lastSaved = 0;
  audio.addEventListener("timeupdate", () => {
    if (audio.currentTime - lastSaved > 5) {
      saveProgress({ audioTime: audio.currentTime });
      lastSaved = audio.currentTime;
    }
  });
}

window.addEventListener("beforeunload", () => {
  saveProgress({ scrollY: window.scrollY });
});
```

**Step 2: Add the resume badge to library cards** — modify `site/index.njk`'s card loop to check localStorage client-side. Since 11ty renders at build time and localStorage is a runtime/client concept, add a small inline script at the bottom of `site/index.njk` instead of doing this server-side:

```njk
<script>
  document.querySelectorAll(".story-card").forEach((card) => {
    const slug = card.getAttribute("href").split("/").filter(Boolean).pop();
    if (localStorage.getItem(`story-progress:${slug}`)) {
      const badge = document.createElement("span");
      badge.textContent = "▶ Resume";
      badge.className = "resume-badge";
      card.querySelector("h3").appendChild(badge);
    }
  });
</script>
```

**Step 3: Add `.resume-badge` and `.resume-banner` styles to `site/assets/style.css`**

```css
.resume-badge { font-size: 0.8rem; margin-left: 0.5rem; opacity: 0.8; }
.resume-banner button { min-height: 44px; min-width: 44px; font-size: 1rem; margin-right: 0.5rem; }
```

**Step 4: Verify in browser**

Run: `npm run build && npx @11ty/eleventy --serve`
Open a story, play audio for >5 seconds, scroll down, navigate away, return to the story — expected: resume banner appears with both buttons; clicking "Resume" jumps audio/scroll to the saved point; going back to the library shows a "▶ Resume" badge on that story's card.

**Step 5: Commit**

```bash
git add site/assets/resume.js site/index.njk site/assets/style.css
git commit -m "Add localStorage-based resume with accessible resume/start-over choice"
```

---

## Task 11: GitHub Actions — validate on PR, build+deploy on main

**Files:**
- Create: `.github/workflows/build.yml`

**Step 1: Write `.github/workflows/build.yml`**

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

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
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

**Step 2: Enable GitHub Pages with "GitHub Actions" as the source**

In the repo's Settings → Pages, set Source to "GitHub Actions" (one-time manual step in the GitHub UI — not scriptable from here).

**Step 3: Verify**

Push a branch and open a PR — expected: the `build` job runs and validates/builds but does not deploy (job step gated by `github.ref == 'refs/heads/main'`). Merge to `main` — expected: `build` then `deploy` both run, and the GitHub Pages URL serves the site.

**Step 4: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "Add GitHub Actions workflow: validate on PR, build and deploy on main"
```

---

## Task 12: Un-draft book 1 and do final manual QA pass

**Files:**
- Modify: `stories/bramble-wall/book-1.md` (flip `draft: true` → `draft: false`, per the design's content-curation gate)

**Step 1:** Read through the rendered story page once more as a final content check, then set `draft: false`.

**Step 2: Manual QA checklist** (per the design doc's accepted-limitations and a11y commitments — verify these actually hold, don't just assume):
- [ ] Tab through the library page with keyboard only — search box, then cards, all reachable and activatable with Enter.
- [ ] Tab through a story page — audio player is keyboard-operable (Space toggles play/pause when focused).
- [ ] Disable JS in browser dev tools, reload the story page — full story text is still present and readable.
- [ ] Resize to a phone viewport (or test on an actual phone) — tap targets don't feel cramped, text is readable without zooming.
- [ ] If possible, do a real test on an iPhone/iPad Safari: confirm audio requires a tap to start (expected/accepted per design) and note whether resume still works after a few days.
- [ ] Search for a tag word ("storm") and confirm it filters correctly; clear it and confirm all cards return.

**Step 3: Commit**

```bash
git add stories/bramble-wall/book-1.md
git commit -m "Publish book 1 (un-draft) after final QA pass"
```

---

## What's next (not in this plan)

Adding stories 2-5 is now just: write markdown with frontmatter into `stories/<series-or-standalone>/`, generate/add the MP3, run `npm run validate`, open a PR. No further code changes needed for that — this plan's scope ends at a working, deployed v1 for book 1.
