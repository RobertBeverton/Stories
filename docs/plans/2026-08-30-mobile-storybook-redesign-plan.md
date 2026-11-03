# Mobile Storybook Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the existing Eleventy site with a mobile-first "storybook" visual language (adapted from the V0 mockup), make Listen the primary action, add real lock-screen/background audio support (Media Session API + PWA), and make the library scale to 10-15+ stories via horizontal series rows and dedicated series pages.

**Architecture:** Presentation-layer + audio-plumbing changes only. The existing content pipeline (`stories-lib.mjs`, `accent-colors.mjs`, frontmatter schema, `validate-content.mjs`, `narrate.mjs`) is untouched. New pure logic (icon lookup, series-page data shaping) is added to testable `.mjs` modules following the existing pattern (`stories-lib.mjs`/`accent-colors.mjs` + matching `.test.mjs`), then wired into Nunjucks templates and vanilla JS.

**Tech Stack:** Eleventy 3.x (Nunjucks templates + `.11ty.js` paginated templates), vanilla JS (no framework), Vitest for unit tests, `sharp` (new dependency) for build-time SVG→PNG icon rendering, Google Fonts (Fraunces) self-hosted subset or `<link>`.

**Design doc:** `docs/plans/2026-08-30-mobile-storybook-redesign-design.md` (read this first for the full rationale — this plan implements it).

---

## Decisions locked in during planning (don't re-litigate these)

- **Font:** Fraunces (variable, "soft" opsz) for display headings, loaded via Google Fonts `<link>` (self-hosting can be a later optimization, not blocking).
- **Icon source of truth:** new `icon:` frontmatter field on each story (e.g. `icon: boat`), validated against a fixed enum. Series icon = the icon of its first story by `seriesOrder`, also cross-checked.
- **Artwork PNGs for Media Session:** generated at build time by a new script (`scripts/generate-icon-art.mjs`) using `sharp` to rasterize each `{icon, accentColor}` combination actually used by a story/series to 192×192 and 512×512 PNGs, written to `site/assets/generated/icons/`. Re-runs automatically on every build, never manually maintained.
- **Only one story currently exists and it's `draft: true`.** Several tasks need at least 2-3 non-draft stories across at least one series with 3+ entries to verify horizontal-row/series-page behavior. Task 1 creates minimal fixture stories for this (see Task 1).

---

### Task 1: Fixture content for visual verification

**Files:**
- Create: `stories/felix-and-alex/the-pancake-isle.md`
- Create: `stories/felix-and-alex/the-berry-boat.md`
- Create: `stories/felix-and-alex/the-cloud-picnic.md`
- Create: `stories/the-singing-shell.md`

**Step 1: Create three short non-draft stories in one series**

These are throwaway placeholder stories (a paragraph or two, not real Isles of Yum canon) purely so the horizontal-row/series-page/Media Session work has real data to render against during this build. Mark clearly as placeholders so they're not mistaken for real content later.

`stories/felix-and-alex/the-pancake-isle.md`:
```markdown
---
title: "The Pancake Isle"
description: "Felix and Alex sail toward a stack that reaches the sky."
tags: ["placeholder"]
series: "Felix & Alex"
seriesOrder: 1
icon: "sun"
publishDate: 2026-01-01
draft: false
---

PLACEHOLDER CONTENT — for interface development only, not a real Isles of Yum story.

Felix and Alex rowed toward the tallest stack of pancakes either of them had ever seen.

• • •

They landed, ate a very large breakfast, and rowed home again.
```

`stories/felix-and-alex/the-berry-boat.md`:
```markdown
---
title: "The Berry Boat"
description: "A tiny boat, a berry-blue sea, and one important delivery."
tags: ["placeholder"]
series: "Felix & Alex"
seriesOrder: 2
icon: "boat"
publishDate: 2026-01-02
draft: false
---

PLACEHOLDER CONTENT — for interface development only, not a real Isles of Yum story.

The berry-blue sea rocked the little boat gently as Alex checked the delivery was still dry.

• • •

They delivered it, and everyone was pleased.
```

`stories/felix-and-alex/the-cloud-picnic.md`:
```markdown
---
title: "The Cloud Picnic"
description: "What happens when your picnic floats away? Follow it!"
tags: ["placeholder"]
series: "Felix & Alex"
seriesOrder: 3
icon: "cloud"
publishDate: 2026-01-03
draft: false
---

PLACEHOLDER CONTENT — for interface development only, not a real Isles of Yum story.

The picnic blanket lifted clean off the grass, sandwiches and all.

• • •

Felix and Alex chased it all the way to Candy Floss Clouds.
```

`stories/the-singing-shell.md` (standalone, no series):
```markdown
---
title: "The Singing Shell"
description: "A little shell learns that the sea has a song for everyone."
tags: ["placeholder"]
icon: "shell"
publishDate: 2026-01-04
draft: false
---

PLACEHOLDER CONTENT — for interface development only, not a real Isles of Yum story.

The shell had never sung before. Today, for no reason it could explain, it did.
```

**Step 2: Run content validation**

Run: `npm run validate`
Expected: `Content validation passed (5 stories checked).`

**Step 3: Commit**

```bash
git add stories/felix-and-alex stories/the-singing-shell.md
git commit -m "test: add placeholder fixture stories for interface dev"
```

---

### Task 2: Icon system — enum, lookup, and SVG line-art

**Files:**
- Create: `scripts/icons.mjs`
- Create: `scripts/icons.test.mjs`
- Modify: `scripts/stories-lib.mjs`

**Step 1: Write the failing test**

`scripts/icons.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import { ICON_NAMES, isValidIcon, iconSvgPath } from "./icons.mjs";

describe("icons", () => {
  it("exposes a fixed, non-empty list of valid icon names", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
    expect(ICON_NAMES).toContain("sun");
    expect(ICON_NAMES).toContain("boat");
  });

  it("validates known icon names", () => {
    expect(isValidIcon("sun")).toBe(true);
    expect(isValidIcon("boat")).toBe(true);
  });

  it("rejects unknown icon names", () => {
    expect(isValidIcon("spaceship")).toBe(false);
    expect(isValidIcon(undefined)).toBe(false);
  });

  it("returns an SVG path string for every valid icon", () => {
    for (const name of ICON_NAMES) {
      expect(typeof iconSvgPath(name)).toBe("string");
      expect(iconSvgPath(name).length).toBeGreaterThan(0);
    }
  });

  it("throws for an invalid icon name", () => {
    expect(() => iconSvgPath("spaceship")).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/icons.test.mjs`
Expected: FAIL — `Cannot find module './icons.mjs'`

**Step 3: Write the implementation**

`scripts/icons.mjs` — path data adapted from the V0 mockup's `StoryIcon` component (`isles-of-yum-Interfacev1/app/page.tsx`), extracted into a standalone, data-only module:

```javascript
// Fixed set of simple line-art icons used on story/series cards and as
// Media Session artwork. Adapted from the V0 mockup's inline StoryIcon
// component. Each entry is a viewBox="0 0 120 82" two-path icon: `main`
// (the bold shape) and `detail` (thinner accent lines).
const ICONS = {
  sun: {
    main: "M18 59c15-20 24-35 42-35s27 15 42 35Z",
    detail: "M60 18v-8M40 23l-5-7M80 23l5-7M29 39h-9M91 39h9",
  },
  boat: {
    main: "M25 55h70l-10 14H37Z",
    detail: "M60 55V20l18 16Z",
  },
  berry: {
    main: "M48 52c3-19 9-29 12-29s9 10 12 29",
    detail: "M60 23c0-6 4-10 4-10",
  },
  shell: {
    main: "M33 61c0-28 16-42 28-42s28 14 28 42",
    detail: "M46 61c0-16 8-24 14-24s14 8 14 24",
  },
  cloud: {
    main: "M35 49c-5-13 12-24 23-14 9-18 36-8 30 9 14 0 16 17 3 21H34c-14-1-13-17 1-16Z",
    detail: "M40 56h40",
  },
};

export const ICON_NAMES = Object.keys(ICONS);

export function isValidIcon(name) {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(ICONS, name);
}

function requireIcon(name) {
  if (!isValidIcon(name)) {
    throw new Error(`Unknown icon name: ${name}. Valid names: ${ICON_NAMES.join(", ")}`);
  }
  return ICONS[name];
}

export function iconSvgPath(name) {
  return requireIcon(name).main;
}

export function iconDetailSvgPath(name) {
  return requireIcon(name).detail;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/icons.test.mjs`
Expected: PASS (5 tests)

**Step 5: Wire icon into `computeStories()`**

Modify `scripts/stories-lib.mjs` — in the `allStories.map(...)` block, add icon resolution with a safe fallback so a missing/invalid `icon` field doesn't break the build (falls back to a default rather than throwing, since this runs across all content):

Add import at top:
```javascript
import { isValidIcon } from "./icons.mjs";
```

In the returned object inside `computeStories`'s `allStories.map`, add:
```javascript
      icon: isValidIcon(data.icon) ? data.icon : "sun",
```

**Step 6: Add a test for the fallback behavior**

In `scripts/stories-lib.test.mjs` (check if this file exists first — if not, this task creates it):

Run: `ls scripts/*.test.mjs` to confirm which test files already exist before adding to or creating this one.

Add a test case (adapt to existing file structure/fixtures if `stories-lib.test.mjs` already exists):
```javascript
it("falls back to the default icon when a story's icon field is missing or invalid", () => {
  const raw = [
    { file: "stories/no-icon.md", data: { title: "No Icon", publishDate: "2026-01-01" }, content: "text" },
    { file: "stories/bad-icon.md", data: { title: "Bad Icon", publishDate: "2026-01-01", icon: "spaceship" }, content: "text" },
  ];
  const result = computeStories(raw);
  expect(result[0].icon).toBe("sun");
  expect(result[1].icon).toBe("sun");
});
```

**Step 7: Run full test suite**

Run: `npx vitest run`
Expected: PASS, all tests including the new ones

**Step 8: Commit**

```bash
git add scripts/icons.mjs scripts/icons.test.mjs scripts/stories-lib.mjs scripts/stories-lib.test.mjs
git commit -m "feat: add story icon system with safe fallback"
```

---

### Task 3: Add `icon` to fixture stories and content validation

**Files:**
- Modify: `scripts/validate-content.mjs`
- Modify: `scripts/validate-content.test.mjs`

**Step 1: Write the failing test**

Add to `scripts/validate-content.test.mjs` (read the existing file first to match its structure/imports before adding):

```javascript
it("flags a story with an invalid icon field", () => {
  const stories = [
    { file: "stories/bad.md", data: { title: "Bad", description: "d", publishDate: "2026-01-01", icon: "spaceship" }, slug: "bad" },
  ];
  const errors = checkValidIcons(stories);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("spaceship");
});

it("allows a story with no icon field (fallback applies later)", () => {
  const stories = [
    { file: "stories/fine.md", data: { title: "Fine", description: "d", publishDate: "2026-01-01" }, slug: "fine" },
  ];
  expect(checkValidIcons(stories)).toHaveLength(0);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/validate-content.test.mjs`
Expected: FAIL — `checkValidIcons is not defined`

**Step 3: Implement `checkValidIcons` and wire into `main()`**

In `scripts/validate-content.mjs`, add near the other `checkX` functions:

```javascript
import { isValidIcon, ICON_NAMES } from "./icons.mjs";

export function checkValidIcons(stories) {
  const errors = [];
  for (const story of stories) {
    if (story.data.icon !== undefined && !isValidIcon(story.data.icon)) {
      errors.push(
        `${story.file}: invalid icon '${story.data.icon}' (must be one of: ${ICON_NAMES.join(", ")})`
      );
    }
  }
  return errors;
}
```

In `main()`, add `...checkValidIcons(refreshed),` to the `errors` array alongside the existing checks.

**Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/validate-content.test.mjs`
Expected: PASS

**Step 5: Run full validation against real content**

Run: `npm run validate`
Expected: `Content validation passed (5 stories checked).`

**Step 6: Commit**

```bash
git add scripts/validate-content.mjs scripts/validate-content.test.mjs
git commit -m "feat: validate story icon field against known icon set"
```

---

### Task 4: Build-time icon artwork generator (PNG for Media Session)

**Files:**
- Create: `scripts/generate-icon-art.mjs`
- Create: `scripts/generate-icon-art.test.mjs`
- Modify: `package.json`

**Step 1: Add `sharp` dependency**

Run: `npm install --save-dev sharp`

**Step 2: Write the failing test (pure function, no filesystem)**

`scripts/generate-icon-art.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import { buildIconSvg, iconArtCombosFor } from "./generate-icon-art.mjs";

describe("buildIconSvg", () => {
  it("produces an SVG string containing the icon's main path and the given background color", () => {
    const svg = buildIconSvg({ icon: "boat", background: "#1f5f8b" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("#1f5f8b");
    expect(svg).toContain("M25 55h70l-10 14H37Z"); // boat main path
  });

  it("throws for an invalid icon name", () => {
    expect(() => buildIconSvg({ icon: "spaceship", background: "#000" })).toThrow();
  });
});

describe("iconArtCombosFor", () => {
  it("returns one combo per distinct {icon, background} pair across stories, de-duplicated", () => {
    const stories = [
      { icon: "boat", accentColorBackground: "#1f5f8b" },
      { icon: "boat", accentColorBackground: "#1f5f8b" }, // duplicate
      { icon: "sun", accentColorBackground: "#b5541a" },
    ];
    const combos = iconArtCombosFor(stories);
    expect(combos).toHaveLength(2);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run scripts/generate-icon-art.test.mjs`
Expected: FAIL — module doesn't exist

**Step 4: Implement**

`scripts/generate-icon-art.mjs`:
```javascript
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { iconSvgPath, iconDetailSvgPath } from "./icons.mjs";

export function buildIconSvg({ icon, background }) {
  const main = iconSvgPath(icon); // throws on invalid icon, same as validate-content's check
  const detail = iconDetailSvgPath(icon);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 82" width="512" height="512">
    <rect width="120" height="82" fill="${background}" />
    <path d="${main}" fill="none" stroke="#ffffff" stroke-width="4" />
    <path d="${detail}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.85" />
  </svg>`;
}

export function iconArtCombosFor(stories) {
  const seen = new Map();
  for (const s of stories) {
    const key = `${s.icon}__${s.accentColorBackground}`;
    if (!seen.has(key)) seen.set(key, { icon: s.icon, background: s.accentColorBackground });
  }
  return Array.from(seen.values());
}

function comboFilename({ icon, background }) {
  return `${icon}-${background.replace("#", "")}`;
}

export async function generateAll(combos, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const combo of combos) {
    const svg = buildIconSvg(combo);
    const base = comboFilename(combo);
    for (const size of [192, 512]) {
      const outPath = path.join(outDir, `${base}-${size}.png`);
      await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
      written.push(outPath);
    }
  }
  return written;
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run scripts/generate-icon-art.test.mjs`
Expected: PASS

**Step 6: Add a CLI entrypoint and npm script**

Append to `scripts/generate-icon-art.mjs`:
```javascript
import { pathToFileURL } from "node:url";
import { loadStories, computeStories } from "./stories-lib.mjs";
import { accentColorFor } from "./accent-colors.mjs";

async function main() {
  const raw = await loadStories();
  const stories = computeStories(raw).map((s) => ({
    icon: s.icon,
    accentColorBackground: accentColorFor(s.series).background,
  }));
  const combos = iconArtCombosFor(stories);
  const outDir = "site/assets/generated/icons";
  const written = await generateAll(combos, outDir);
  console.log(`Generated ${written.length} icon PNGs from ${combos.length} icon/color combos into ${outDir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

In `package.json`, add a script and wire it into `build`:
```json
"generate-icons": "node scripts/generate-icon-art.mjs",
"build": "npm run validate && npm run generate-icons && npx @11ty/eleventy",
```

**Step 7: Run it for real and verify output**

Run: `npm run generate-icons`
Expected: `Generated N icon PNGs from M icon/color combos into site/assets/generated/icons` — then verify files exist:
Run: `ls site/assets/generated/icons`
Expected: PNG files present (e.g. `boat-1f5f8b-192.png`, `boat-1f5f8b-512.png`, ...)

**Step 8: Gitignore the generated directory**

Modify `.gitignore`, add:
```
site/assets/generated/
```

**Step 9: Run full build to confirm the new step doesn't break it**

Run: `npm run build`
Expected: succeeds, ends with Eleventy's "Wrote N files" line

**Step 10: Commit**

```bash
git add scripts/generate-icon-art.mjs scripts/generate-icon-art.test.mjs package.json package-lock.json .gitignore
git commit -m "feat: generate icon artwork PNGs at build time for Media Session"
```

---

### Task 5: CSS foundations — tokens, font, color-scheme

**Files:**
- Modify: `site/_includes/base.njk`
- Modify: `site/assets/style.css`

**Step 1: Add Fraunces font link and PWA meta placeholders to base.njk**

In `site/_includes/base.njk`, inside `<head>`, before the existing stylesheet link:
```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap" rel="stylesheet">
```

(PWA manifest link added in Task 9, not here — keep this task CSS-only.)

**Step 2: Add design tokens to the top of style.css**

In `site/assets/style.css`, before the existing `:root { color-scheme: light dark; }` line, replace it with:
```css
:root {
  color-scheme: light dark;
  --paper: #faf3e7;
  --paper-dark: #1c1a17;
  --ink: #2c2a26;
  --ink-dark: #f2ede2;
  --coral: #e8735c;
  --font-display: "Fraunces", Georgia, serif;
  --font-body: system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: var(--paper-dark); --fg: var(--ink-dark); }
}
@media (prefers-color-scheme: light) {
  :root { --bg: var(--paper); --fg: var(--ink); }
}
body { background: var(--bg); color: var(--fg); font-family: var(--font-body); }
h1, h2, .story-card h3, .display { font-family: var(--font-display); }
```

Note: existing rules below this (`body { font-family: ... }` etc. at the current line 2) will conflict/duplicate — merge rather than leaving two `body` rules. Read the current full file before editing to merge cleanly (existing `font-size: 18px; line-height: 1.5; margin: 0;` properties should be preserved, just merged into the new `body` rule).

**Step 3: Verify visually**

Run: `npm run build` then serve:
Run: `npx @11ty/eleventy --serve` (leave running)
Open `http://localhost:8080/isles-of-yum/` in a browser, confirm: cream background, serif headings, no console errors.

**Step 4: Commit**

```bash
git add site/_includes/base.njk site/assets/style.css
git commit -m "feat: add storybook color tokens and Fraunces display font"
```

---

### Task 6: Story card redesign — icon swatch, play-first button

**Files:**
- Modify: `site/_includes/story-card.njk`
- Modify: `site/assets/style.css`

**Step 1: Update the card template**

Replace `site/_includes/story-card.njk` with a version that renders the icon swatch and makes Listen the primary control. The play button needs a `data-*` payload so a later task (Task 10, Media Session wiring) can start playback directly from the card without navigating:

```njk
<div class="story-card" data-title="{{ story.title }}" data-tags="{{ story.tags | join(' ') }}" data-description="{{ story.description }}" data-slug="{{ story.slug }}">
  <div class="story-card-art" style="--accent-bg: {{ story.accentColor.background if story.accentColor else '#6b7280' }};">
    <svg viewBox="0 0 120 82" aria-hidden="true" class="story-icon">
      <path class="icon-main" d="{{ icons.path(story.icon) }}" />
    </svg>
  </div>
  <a class="story-card-link" href="{{ story.url }}">
    <h3>{{ story.title }}</h3>
    <p class="card-meta">~{{ story.readMinutes }} min read{% if story.audioMinutes %} · ~{{ story.audioMinutes }} min listen{% endif %}</p>
  </a>
  <div class="story-card-actions">
    {% if story.audio %}
    <button type="button" class="play-button-primary" data-play-slug="{{ story.slug }}" data-play-url="{{ story.audioUrl }}" data-play-title="{{ story.title }}" data-play-story-url="{{ story.url }}" aria-label="Listen to {{ story.title }}">▶︎ Listen</button>
    <a class="read-link" href="{{ story.url }}">Read →</a>
    {% else %}
    <a class="read-link read-link-primary" href="{{ story.url }}">Read story →</a>
    <span class="no-audio-badge" aria-label="Text only, no audio">🚫🔊</span>
    {% endif %}
  </div>
</div>
```

This introduces an `icons.path()` template helper — add it as a Nunjucks global in `eleventy.config.js`:
```javascript
import { iconSvgPath } from "./scripts/icons.mjs";
// ...inside the exported function, alongside eleventyConfig.addFilter("slugify", slugify):
eleventyConfig.addNunjucksGlobal("icons", { path: iconSvgPath });
```

**Step 2: Add CSS for the new card structure**

In `site/assets/style.css`, replace the existing `.story-card`, `.story-card-link`, `.play-button`, `.no-audio-badge` rules with:

```css
.story-card {
  border-radius: 20px;
  overflow: hidden;
  background: var(--bg);
  border: 1px solid color-mix(in srgb, var(--fg) 12%, transparent);
  display: flex;
  flex-direction: column;
}
.story-card-art {
  background: var(--accent-bg, #6b7280);
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.story-icon { width: 60%; max-width: 100px; }
.story-icon .icon-main { fill: none; stroke: #fff; stroke-width: 4; }
.story-card-link { display: block; padding: 0.85rem 1rem 0.5rem; text-decoration: none; color: inherit; }
.story-card h3 { margin: 0; font-size: 1.15rem; line-height: 1.3; }
.story-card .card-meta { opacity: 0.75; margin: 0.4rem 0 0; font-size: 0.9rem; }
.story-card-actions { display: flex; align-items: center; gap: 0.75rem; padding: 0 1rem 1rem; margin-top: auto; }
.play-button-primary {
  min-height: 44px;
  padding: 0.5rem 1.25rem;
  border-radius: 999px;
  border: none;
  background: var(--coral);
  color: #fff;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}
.read-link { min-height: 44px; display: inline-flex; align-items: center; text-decoration: none; color: inherit; opacity: 0.75; }
.read-link-primary { font-weight: 600; opacity: 1; }
.no-audio-badge { opacity: 0.5; font-size: 0.9rem; }
```

**Step 3: Verify visually**

Run the dev server (from Task 5) and check a card renders: icon swatch, title, meta line, coral "▶︎ Listen" pill + "Read →" link, all with 44px+ tap targets.

**Step 4: Run existing test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS (icon/story-lib logic untouched by template changes)

**Step 5: Commit**

```bash
git add site/_includes/story-card.njk site/assets/style.css eleventy.config.js
git commit -m "feat: redesign story card with icon art and play-first action"
```

---

### Task 7: Homepage restructure — hero, continue row, horizontal series rows

**Files:**
- Modify: `site/index.njk`
- Modify: `site/assets/style.css`
- Modify: `site/assets/library.js`

**Step 1: Restructure index.njk**

Replace `site/index.njk` with:

```njk
---
layout: base.njk
title: Library
---
<section class="hero">
  <p class="eyebrow">A storybook archipelago</p>
  <h1 class="display">Stories with a <span class="accent">sprinkle of wonder</span>.</h1>
  <p class="hero-lede">Welcome to the Isles of Yum — a cozy corner of the internet for curious kids, kind grown-ups, and stories worth reading twice.</p>
  <a class="primary-cta" href="#stories">Find a story →</a>
</section>

<input type="search" id="search-box" placeholder="Search Isles of Yum..." aria-label="Search stories">

<section id="continue-section" aria-labelledby="continue-heading" hidden>
  <h2 id="continue-heading">Continue</h2>
  <div class="card-row" id="continue-row"></div>
</section>

<div id="stories">
{% for group in stories.seriesGroups %}
<section aria-labelledby="series-heading-{{ loop.index }}" class="series-row-section" style="--accent-bg: {{ group.accentColor.background }}; --accent-text: {{ group.accentColor.text }};">
  <div class="series-row-heading">
    <h2 id="series-heading-{{ loop.index }}">{{ group.series }}</h2>
    <a class="see-all" href="{{ '/series/' | url }}{{ group.series | slugify }}/">See all →</a>
  </div>
  <div class="card-row">
    {% for story in group.stories | slice(0, 4) %}
      {% include "story-card.njk" %}
    {% endfor %}
  </div>
</section>
{% endfor %}

{% if stories.standalone.length > 0 %}
<section aria-labelledby="standalone-heading">
  <h2 id="standalone-heading">More Stories</h2>
  <div class="card-row">
    {% for story in stories.standalone %}
      {% include "story-card.njk" %}
    {% endfor %}
  </div>
</section>
{% endif %}
</div>

<script src="{{ '/assets/search.js' | url }}"></script>
<script src="{{ '/assets/mini-player.js' | url }}"></script>
<script src="{{ '/assets/library.js' | url }}"></script>
```

Note: `story` in `story-card.njk` currently expects a plain story object (used directly as `story.title`, etc.) — confirm this matches by reading the current include usage (`{% include "story-card.njk" %}` relies on ambient `story` from the loop variable, same pattern as before, unchanged).

Note: Nunjucks needs the `slice` filter — confirm it's built in (it is, as of Nunjucks' array slice filter) by testing in step 3.

**Step 2: Add CSS for hero + horizontal scroll rows**

In `site/assets/style.css`, add:
```css
.hero { padding: 2rem 1rem 1.5rem; }
.hero .eyebrow { text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.06em; opacity: 0.7; margin: 0; }
.hero h1 { font-size: 2.2rem; line-height: 1.15; margin: 0.5rem 0 1rem; }
.hero h1 .accent { color: var(--coral); }
.hero-lede { opacity: 0.85; max-width: 32rem; }
.primary-cta {
  display: inline-flex; min-height: 44px; align-items: center;
  padding: 0.6rem 1.4rem; border-radius: 999px;
  background: var(--ink); color: var(--paper); text-decoration: none; font-weight: 600;
}
@media (prefers-color-scheme: dark) { .primary-cta { background: var(--ink-dark); color: var(--paper-dark); } }

.series-row-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
.see-all { text-decoration: none; color: inherit; opacity: 0.8; white-space: nowrap; min-height: 44px; display: inline-flex; align-items: center; }

.card-row {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}
.card-row .story-card { flex: 0 0 78vw; max-width: 320px; scroll-snap-align: start; }
```

**Step 3: Verify visually**

Restart dev server, check homepage: hero stacks correctly on a narrow viewport (use browser devtools mobile emulation at ~375px width), series row scrolls horizontally with peeking next card, "See all →" link visible (will 404 until Task 8 — that's expected at this point).

**Step 4: Confirm library.js's card injection still matches the new markup**

Read `site/assets/library.js` — its `card.innerHTML` for the Continue row builds a minimal `.story-card` (title + meta only, no art/actions), which is intentionally simpler than the full card. Confirm this doesn't visually break next to the new card style — if it looks too bare against the new card art panel, extend it to reuse the same icon-swatch markup. Decide via visual check, not assumption:

Run dev server, save a fake progress entry via browser console: `localStorage.setItem('story-progress:felix-and-alex/the-pancake-isle', JSON.stringify({title:'The Pancake Isle', url:'/isles-of-yum/stories/felix-and-alex/the-pancake-isle/', savedAt: Date.now(), audioTime: 30}))`, reload, confirm Continue row appears and looks acceptable (minor visual gap vs. full cards is fine for this pass; note as a follow-up if not).

**Step 5: Run test suite**

Run: `npx vitest run`
Expected: PASS

**Step 6: Commit**

```bash
git add site/index.njk site/assets/style.css
git commit -m "feat: restructure homepage into hero + horizontal series rows"
```

---

### Task 8: Series detail pages (`/series/<slug>/`)

**Files:**
- Modify: `scripts/stories-lib.mjs`
- Modify: `scripts/stories-lib.test.mjs`
- Create: `site/_includes/series.njk`
- Create: `site/series-pages.11ty.js`

**Step 1: Write the failing test for a new pure function**

Add to `scripts/stories-lib.test.mjs`:
```javascript
import { seriesPageData } from "./stories-lib.mjs";

describe("seriesPageData", () => {
  it("groups computed stories by series into page-ready records with slug, accent color, and ordered stories", () => {
    const raw = [
      { file: "stories/a/one.md", data: { title: "One", series: "Felix & Alex", seriesOrder: 2, publishDate: "2026-01-02" }, content: "hi" },
      { file: "stories/a/two.md", data: { title: "Two", series: "Felix & Alex", seriesOrder: 1, publishDate: "2026-01-01" }, content: "hi" },
      { file: "stories/standalone.md", data: { title: "Solo", publishDate: "2026-01-03" }, content: "hi" },
    ];
    const stories = computeStories(raw);
    const pages = seriesPageData(stories);
    expect(pages).toHaveLength(1);
    expect(pages[0].seriesSlug).toBe("felix-alex");
    expect(pages[0].stories.map((s) => s.title)).toEqual(["Two", "One"]); // ordered by seriesOrder
    expect(pages[0].accentColor).toBeDefined();
  });
});
```

Import `computeStories` already present at top of test file; add `seriesPageData` to the import line from `./stories-lib.mjs`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/stories-lib.test.mjs`
Expected: FAIL — `seriesPageData is not a function` (or similar)

**Step 3: Implement `seriesPageData`**

Add to `scripts/stories-lib.mjs` (below `groupForLibrary`), reusing the `slugify` import already present:
```javascript
export function seriesPageData(stories) {
  const bySeries = new Map();
  for (const story of stories) {
    if (!story.series) continue;
    if (!bySeries.has(story.series)) bySeries.set(story.series, []);
    bySeries.get(story.series).push(story);
  }
  return Array.from(bySeries.entries()).map(([series, seriesStories]) => {
    seriesStories.sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
    return {
      series,
      seriesSlug: slugify(series),
      accentColor: accentColorFor(series),
      stories: seriesStories,
    };
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/stories-lib.test.mjs`
Expected: PASS

**Step 5: Wire `seriesPageData` into the global stories data**

Modify `site/_data/stories.js` to also attach `seriesPages`:
```javascript
import { loadStories, computeStories, groupForLibrary, seriesPageData } from "../../scripts/stories-lib.mjs";

export default async function () {
  const rawStories = await loadStories();
  const stories = computeStories(rawStories);
  const { seriesGroups, standalone } = groupForLibrary(stories);
  stories.seriesGroups = seriesGroups;
  stories.standalone = standalone;
  stories.seriesPages = seriesPageData(stories);
  return stories;
}
```

**Step 6: Create the series page template**

`site/_includes/series.njk`:
```njk
---
layout: base.njk
---
<div class="story-header" style="--accent-bg: {{ accentColor.background }}; --accent-text: {{ accentColor.text }};">
  <nav class="breadcrumb"><a href="{{ '/' | url }}">← Library</a></nav>
  <h1>{{ series }}</h1>
</div>

<div class="card-list">
  {% for story in seriesStories %}
    {% include "story-card.njk" %}
  {% endfor %}
</div>
```

Note: `story-card.njk` reads from a `story` loop variable — same binding pattern as `index.njk`'s usage, so no template changes needed to story-card.njk itself.

**Step 7: Create the paginated page generator**

`site/series-pages.11ty.js`, mirroring `site/story-pages.11ty.js`'s pagination approach:
```javascript
export const data = {
  pagination: {
    data: "stories.seriesPages",
    size: 1,
    alias: "seriesPage",
  },
  layout: "series.njk",
  eleventyComputed: {
    permalink: (data) => `/series/${data.seriesPage.seriesSlug}/index.html`,
    series: (data) => data.seriesPage.series,
    accentColor: (data) => data.seriesPage.accentColor,
    seriesStories: (data) => data.seriesPage.stories,
  },
};

export function render() {
  return "";
}
```

**Step 8: Add CSS for the stacked card list**

In `site/assets/style.css`:
```css
.card-list { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 0; }
.card-list .story-card { flex-direction: row; }
.card-list .story-card-art { flex: 0 0 100px; }
```

**Step 9: Build and verify**

Run: `npm run build`
Expected: succeeds; check output: `ls _site/series/` should show a directory per series (e.g. `felix-alex/index.html`)

Run dev server, navigate to a series's "See all →" link from the homepage, confirm it lands on the series page with all stories stacked full-width.

**Step 10: Run full test suite**

Run: `npx vitest run`
Expected: PASS

**Step 11: Commit**

```bash
git add scripts/stories-lib.mjs scripts/stories-lib.test.mjs site/_data/stories.js site/_includes/series.njk site/series-pages.11ty.js site/assets/style.css
git commit -m "feat: add series detail pages for library scaling"
```

---

### Task 9: Bottom tab bar + PWA manifest

**Files:**
- Modify: `site/_includes/base.njk`
- Modify: `site/assets/style.css`
- Create: `site/manifest.webmanifest`
- Create: `public icons` (two PNGs — see step 2)

**Step 1: Generate app icons**

Reuse the icon system from Task 2/4 for a simple app icon (e.g. the "sun" icon on the coral background) rather than commissioning new art for this pass. Add a small script step or manually invoke:

Run a one-off Node script (or extend `generate-icon-art.mjs` with an `--app-icon` mode if preferred) to produce `site/assets/app-icon-192.png` and `site/assets/app-icon-512.png` using `buildIconSvg({ icon: "sun", background: "#e8735c" })` at 192/512. Simplest approach: add to `scripts/generate-icon-art.mjs`'s `main()`:
```javascript
  const appIconSvg = buildIconSvg({ icon: "sun", background: "#e8735c" });
  for (const size of [192, 512]) {
    await sharp(Buffer.from(appIconSvg)).resize(size, size).png().toFile(`site/assets/app-icon-${size}.png`);
  }
```
These are committed (not gitignored, unlike the per-story generated icons) since they're stable app-level assets — but since they're now build-generated, either commit them once and add a step-8-style regeneration note, or gitignore them and ensure CI always runs `generate-icons` before the Eleventy build (already true per Task 4 Step 6's `package.json` change). Prefer gitignoring for consistency with the other generated icons — CI already regenerates on every build.

**Step 2: Create the manifest**

`site/manifest.webmanifest`:
```json
{
  "name": "The Isles of Yum",
  "short_name": "Isles of Yum",
  "start_url": "/isles-of-yum/",
  "scope": "/isles-of-yum/",
  "display": "standalone",
  "background_color": "#faf3e7",
  "theme_color": "#e8735c",
  "icons": [
    { "src": "/isles-of-yum/assets/app-icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/isles-of-yum/assets/app-icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Note the hardcoded `/isles-of-yum/` prefix matches `PATH_PREFIX` in `scripts/stories-lib.mjs` — this file isn't run through Eleventy's templating (it's a static passthrough), so the prefix can't be injected via the `url` filter; hardcode it same as other places that already do this (see `eleventy.config.js` comments re: `PATH_PREFIX`).

**Step 3: Passthrough-copy the manifest and add meta tags**

In `eleventy.config.js`, add:
```javascript
eleventyConfig.addPassthroughCopy("site/manifest.webmanifest");
```

In `site/_includes/base.njk`'s `<head>`, add:
```html
  <link rel="manifest" href="{{ '/manifest.webmanifest' | url }}">
  <meta name="theme-color" content="#e8735c">
  <link rel="apple-touch-icon" href="{{ '/assets/app-icon-192.png' | url }}">
```

**Step 4: Add the bottom tab bar markup**

In `site/_includes/base.njk`, replace the existing `<header class="site-header">...</header>` with a header (kept, simplified) plus a new bottom nav:
```html
  <header class="site-header"><a href="{{ '/' | url }}">📚 Isles of Yum</a></header>
  <main>{{ content | safe }}</main>
  <nav class="tab-bar" aria-label="Main navigation">
    <a href="{{ '/' | url }}" class="tab-bar-item">🏠<span>Home</span></a>
    <a href="{{ '/' | url }}#stories" class="tab-bar-item">📖<span>Library</span></a>
  </nav>
```

Note: "Now Playing" as a third tab is deferred to Task 10, since it needs the mini-player JS to exist first (linking to a route with no content yet would be a dead tab).

**Step 5: Add tab bar CSS**

In `site/assets/style.css`:
```css
.tab-bar {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: flex; justify-content: space-around;
  background: var(--bg); border-top: 1px solid color-mix(in srgb, var(--fg) 12%, transparent);
  padding: 0.4rem 0 max(0.4rem, env(safe-area-inset-bottom));
  z-index: 20;
}
.tab-bar-item { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; text-decoration: none; color: inherit; font-size: 0.7rem; min-height: 44px; min-width: 44px; justify-content: center; }
main { padding-bottom: 4.5rem; } /* clears both tab bar and mini-player if both present */
```

**Step 6: Verify**

Run dev server, check on mobile emulation: tab bar fixed at bottom, thumb-reachable, doesn't overlap content or the existing mini-player.

**Step 7: Run test suite and build**

Run: `npx vitest run && npm run build`
Expected: both pass

**Step 8: Commit**

```bash
git add site/_includes/base.njk site/assets/style.css site/manifest.webmanifest eleventy.config.js scripts/generate-icon-art.mjs .gitignore
git commit -m "feat: add bottom tab bar and PWA manifest"
```

---

### Task 10: Media Session API wiring

**Files:**
- Modify: `site/assets/mini-player.js`
- Create: `site/assets/mini-player.test.mjs` (if a DOM-testable extraction is feasible — see step 1 decision)

**Step 1: Decide test approach**

`mini-player.js` currently runs top-level DOM/localStorage code on load (no exported functions) — same pattern as `resume.js`, `library.js`. Rather than restructure the whole file's execution model (risk, out of scope), extract only the new Media Session logic into a small pure/testable function (`buildMediaMetadata`), and leave the DOM-wiring glue untested-by-unit-test but manually verified in step 5. This matches the project's existing convention: `stories-lib.mjs`/`accent-colors.mjs` are pure and tested; `mini-player.js`/`resume.js`/`library.js` are DOM glue and are not.

**Step 2: Write the failing test for the pure part**

`site/assets/mini-player.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import { buildMediaMetadata } from "./mini-player.js";

describe("buildMediaMetadata", () => {
  it("builds MediaMetadata-shaped data from a playing entry", () => {
    const meta = buildMediaMetadata({ title: "The Pancake Isle", artworkUrl: "/isles-of-yum/assets/generated/icons/sun-e8735c-512.png" });
    expect(meta.title).toBe("The Pancake Isle");
    expect(meta.artist).toBe("The Isles of Yum");
    expect(meta.artwork[0].src).toContain("sun-e8735c-512.png");
  });

  it("falls back to a generic title when none is given", () => {
    const meta = buildMediaMetadata({ artworkUrl: "/x.png" });
    expect(meta.title).toBe("The Isles of Yum");
  });
});
```

This requires `mini-player.js` to export `buildMediaMetadata` without triggering its top-level DOM code when imported under Vitest (which runs in a DOM-less or jsdom-less default environment per the existing `vitest` config — check `vitest.config` / `package.json` for environment setting first).

**Step 2a: Check existing Vitest environment config**

Run: `cat vitest.config.* 2>/dev/null; grep -A3 '"vitest"' package.json`
If no DOM environment is configured, top-level `document.getElementById(...)` calls in `mini-player.js` will throw under Vitest. Guard the file's existing top-level DOM code so it only runs when `document` exists AND this isn't a bare import-for-testing — the cleanest fix: wrap the existing top-level execution (the `renderBar(currentlyPlaying())` call and the `window.addEventListener` line at the bottom) in `if (typeof document !== "undefined" && document.getElementById("mini-player") !== null || typeof window !== "undefined") { ... }` is overly complex — simplest real fix: move ALL existing top-level side-effecting calls into a guarded block:
```javascript
if (typeof window !== "undefined") {
  renderBar(currentlyPlaying());
  window.addEventListener("storage", () => renderBar(currentlyPlaying()));
}
```
Vitest's default `node` environment has no `window`, so this guard makes the file import-safe for unit testing without changing browser behavior at all (`window` always exists in a real browser).

**Step 3: Run test to verify it fails**

Run: `npx vitest run site/assets/mini-player.test.mjs`
Expected: FAIL — `buildMediaMetadata is not exported` (or the file throws on import before the guard is added — apply Step 2a's guard first if so)

**Step 4: Implement `buildMediaMetadata` and Media Session wiring**

Add to `site/assets/mini-player.js` (as an exported function, plus wiring into the existing `renderBar` flow):

```javascript
export function buildMediaMetadata({ title, artworkUrl }) {
  return {
    title: title || "The Isles of Yum",
    artist: "The Isles of Yum",
    artwork: artworkUrl ? [
      { src: artworkUrl, sizes: "512x512", type: "image/png" },
    ] : [],
  };
}

function setupMediaSession(playing, audio) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata(buildMediaMetadata({
    title: playing.title,
    artworkUrl: playing.artworkUrl,
  }));
  if (audio) {
    navigator.mediaSession.setActionHandler("play", () => audio.play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 10));
    });
    if (playing.prevUrl) {
      navigator.mediaSession.setActionHandler("previoustrack", () => { window.location.href = playing.prevUrl + "?autoplay=1"; });
    }
    if (playing.nextUrl) {
      navigator.mediaSession.setActionHandler("nexttrack", () => { window.location.href = playing.nextUrl + "?autoplay=1"; });
    }
  }
}
```

Call `setupMediaSession(playing, localAudio)` inside the existing `renderBar(playing)` function, in the `isLocalStory` branch (where `localAudio` is defined), right after the existing `sync()` call.

This requires `playing.artworkUrl`, `playing.prevUrl`, `playing.nextUrl` to be present in the localStorage progress object — extend `resume.js`'s `saveProgress` call. That means Task 10 also touches `resume.js`:

**Step 5: Extend resume.js to save artwork/prev/next URLs**

This needs data not currently available client-side (icon name, accent color, prev/next URLs) to be embedded in the story page for `resume.js` to read. Add data attributes to the `<audio>` element in `site/_includes/story.njk`:
```njk
<audio controls preload="none" id="story-audio" src="{{ audioUrl }}"
  data-artwork-url="{{ '/assets/generated/icons/' | url }}{{ icon }}-{{ accentColor.background | replace('#', '') }}-512.png"
  data-prev-url="{{ prevStory.url if prevStory else '' }}"
  data-next-url="{{ nextStory.url if nextStory else '' }}"
></audio>
```

This needs `icon` available on the story page's computed data — add it to `site/story-pages.11ty.js`'s `eleventyComputed`:
```javascript
    icon: (data) => data.stories.bySlug[data.storyPage.data.storySlug]?.icon,
```

In `site/assets/resume.js`, extend the initial `saveProgress` call to include these:
```javascript
saveProgress({
  title: document.title.replace(" — Isles of Yum", ""),
  url: window.location.pathname,
  artworkUrl: audio?.dataset.artworkUrl,
  prevUrl: audio?.dataset.prevUrl || null,
  nextUrl: audio?.dataset.nextUrl || null,
});
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run site/assets/mini-player.test.mjs`
Expected: PASS

**Step 7: Manual verification (this is the part unit tests can't cover)**

Run dev server, open a story with audio on a real phone (or desktop Chrome with device emulation + a Bluetooth/system media widget check), tap Listen, lock the screen or check the OS media notification: title and artwork should appear, play/pause should work from the lock screen.

Since this environment may not have a physical phone handy, at minimum verify in desktop Chrome: open the story page, play audio, check the browser tab's media indicator and OS-level "Now Playing" widget (Windows: Win+G or the volume flyout media controls) shows the story title.

**Step 8: Run full test suite and build**

Run: `npx vitest run && npm run build`
Expected: both pass

**Step 9: Commit**

```bash
git add site/assets/mini-player.js site/assets/resume.js site/_includes/story.njk site/story-pages.11ty.js
git commit -m "feat: wire Media Session API for lock-screen playback controls"
```

---

### Task 11: Story detail page restyle (listen-first)

**Files:**
- Modify: `site/_includes/story.njk`
- Modify: `site/assets/style.css`

**Step 1: Reorder story.njk so the audio player appears before the body text**

The audio card already appears before `<article class="story-body">` in the current file (confirmed in earlier read) — verify this is still true after Task 10's edits, and if any reordering happened, restore audio-before-text ordering. If already correct, this task is CSS-only.

**Step 2: Style the header as a "cover" and the audio card as prominent**

In `site/assets/style.css`, adjust `.story-header` and `.audio-card`:
```css
.story-header { font-family: var(--font-display); }
.story-header h1 { font-size: 1.8rem; }
.audio-card { text-align: center; }
.audio-card audio { max-width: 100%; }
```

**Step 3: Verify visually**

Dev server, open the placeholder story with audio (none of the Task 1 fixtures have real `audio` files — note this limits full visual verification of the audio card to layout/CSS only, not actual playback, unless a real MP3 is added). Confirm header/cover styling reads well, Listen control is visually prominent above the story text.

**Step 4: Commit**

```bash
git add site/_includes/story.njk site/assets/style.css
git commit -m "style: emphasize listen-first layout on story detail page"
```

---

### Task 12: Full regression pass

**Files:** none (verification only)

**Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (original 31 + new tests from Tasks 2-3, 4, 8, 10)

**Step 2: Run a full clean build**

Run: `rm -rf _site && npm run build`
Expected: succeeds, no errors, `_site/` contains homepage, story pages, and series pages

**Step 3: Check for broken internal links**

Manually click through in the dev server: homepage → series "See all" → a story card in the series page → back to homepage → a standalone story card → story detail page → prev/next nav (if present with the 3-story fixture series).

**Step 4: Verify mobile viewport (375px and 390px widths) has no horizontal overflow**

Use browser devtools device toolbar at both widths; check no element causes the page body to scroll horizontally (the `card-row` should be the only horizontally-scrollable element, intentionally).

**Step 5: Report status**

Summarize: tests passing count, build clean, manual click-through results, anything deferred (e.g. lock-screen behavior on a real device, replacing placeholder stories with real content, replacing app icons with commissioned art).

---

## Explicitly deferred (not in this plan)

- Character glossary/lookup page.
- Offline story caching via service worker (a service worker is NOT added in this plan at all — re-read the design doc's PWA note: this plan implements the manifest/installability half but the minimal `sw.js` mentioned there is deferred to a follow-up, since a manifest + Media Session already satisfies the "real lock-screen controls" requirement without needing a service worker; add one later only if install-prompt/offline behavior is specifically requested).
- Self-hosting the Fraunces font (currently Google Fonts `<link>`).
- Removing/replacing the placeholder fixture stories with real Isles of Yum content — flag clearly to the user that Task 1's stories are placeholders and should be deleted or replaced before this branch is considered done, per `story-writing-process` skill (real story content should go through that pipeline, not be authored inline in a UI implementation plan).
