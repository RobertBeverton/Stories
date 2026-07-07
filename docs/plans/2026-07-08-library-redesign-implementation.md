# Library Redesign & One-Tap Play Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the library/story pages with a Spotify-Kids-inspired visual language (color-blocked per-series card tiles, grouped sections) and fix the two-click-to-play problem with an always-visible per-card Play button that navigates-with-autoplay to the story page, backed by a localStorage-driven cross-page mini-player bar.

**Architecture:** All changes are within the existing 11ty + vanilla JS/CSS stack — no new build tooling, no framework. A new pure-function module computes per-series accent colors and groups stories into Continue/series/standalone sections (unit-tested, following the existing `stories-lib.mjs` pattern). `resume.js` is extended (not replaced) to add a `playing`/`updatedAt` staleness-guarded state and an autoplay-signal branch that's mutually exclusive with the existing resume banner. A new `mini-player.js` renders the fixed bottom bar on every page from that same localStorage state.

**Tech Stack:** Same as the existing project — 11ty v3, vanilla JS/CSS, vitest for pure-function tests, Playwright as a scratch (non-dependency) verification tool as used in prior tasks.

Reference docs: `docs/plans/2026-07-08-library-redesign-design.md` (design + premortem), `docs/plans/2026-07-07-stories-site-design.md` (original site design, for constraints like the no-JS content guarantee and 44px tap targets).

---

## Task 1: Accent color palette — pure function, unit-tested

**Files:**
- Create: `scripts/accent-colors.mjs`
- Create: `scripts/accent-colors.test.mjs`

Per the design's contrast guardrail: colors are NOT an unconstrained hash-to-HSL value. A series name hashes to an index into a small, fixed, pre-vetted palette.

**Step 1: Write the failing test** — `scripts/accent-colors.test.mjs`

```js
import { describe, it, expect } from "vitest";
import { accentColorFor, PALETTE } from "./accent-colors.mjs";

describe("accentColorFor", () => {
  it("returns the same color pair for the same series name every time", () => {
    const a = accentColorFor("The Bramble Wall");
    const b = accentColorFor("The Bramble Wall");
    expect(a).toEqual(b);
  });

  it("returns a {background, text} pair from the fixed palette", () => {
    const result = accentColorFor("The Bramble Wall");
    expect(PALETTE).toContainEqual(result);
  });

  it("returns the default neutral pair for standalone stories (no series)", () => {
    const result = accentColorFor(undefined);
    expect(result).toEqual(PALETTE[0]);
  });

  it("distributes different series names across the palette (not all to one entry)", () => {
    const names = ["The Bramble Wall", "Moonlit Cove", "Pepper the Fox", "Starlight Express"];
    const results = new Set(names.map((n) => JSON.stringify(accentColorFor(n))));
    expect(results.size).toBeGreaterThan(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/accent-colors.test.mjs`
Expected: FAIL — module doesn't exist yet.

**Step 3: Write minimal implementation** — `scripts/accent-colors.mjs`

```js
// Each pair is manually checked for WCAG AA (4.5:1) contrast in BOTH light
// and dark `color-scheme` rendering before being added here — colors are
// never generated on the fly, only selected from this fixed, pre-vetted set.
// PALETTE[0] is the default/neutral pair used for standalone stories.
export const PALETTE = [
  { background: "#6b7280", text: "#ffffff" }, // neutral slate (default)
  { background: "#2f6f4f", text: "#ffffff" }, // forest green
  { background: "#8a3b8f", text: "#ffffff" }, // plum
  { background: "#b5541a", text: "#ffffff" }, // burnt orange
  { background: "#1f5f8b", text: "#ffffff" }, // ocean blue
  { background: "#a8324a", text: "#ffffff" }, // berry red
  { background: "#5b6b1f", text: "#ffffff" }, // olive
  { background: "#6a4fa0", text: "#ffffff" }, // violet
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function accentColorFor(seriesName) {
  if (!seriesName) return PALETTE[0];
  const index = 1 + (hashString(seriesName) % (PALETTE.length - 1));
  return PALETTE[index];
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/accent-colors.test.mjs`
Expected: PASS (4/4).

**Step 5: Commit**

```bash
git add scripts/accent-colors.mjs scripts/accent-colors.test.mjs
git commit -m "Add pre-vetted accent color palette with deterministic per-series assignment"
```

---

## Task 2: Group stories into Continue/series/standalone sections — pure function, unit-tested

**Files:**
- Modify: `scripts/stories-lib.mjs`
- Modify: `scripts/stories-data.test.mjs`

**Context:** `computeStories()` in `scripts/stories-lib.mjs` currently returns a flat array (with a `.bySlug` map attached) sorted by `publishDate`. The library page needs this grouped instead: a Continue list (needs runtime localStorage data, computed client-side — see Task 6), a list of series sections (each with its accent color and ordered stories), and a standalone list. This task adds a new pure function `groupForLibrary(stories)` that takes the already-computed flat story array and returns the series/standalone grouping (NOT the Continue section — that requires localStorage, which doesn't exist at build time, so it's a client-side concern handled in Task 6).

**Step 1: Write the failing tests** — append to `scripts/stories-data.test.mjs` (read the existing file first to match its fixture style, e.g. its `makeStory` helper)

```js
import { groupForLibrary } from "./stories-lib.mjs";

describe("groupForLibrary", () => {
  it("groups stories by series, ordered by seriesOrder", () => {
    const stories = [
      makeStory("stories/a/book-2.md", { series: "The Bramble Wall", seriesOrder: 2, title: "Book 2" }),
      makeStory("stories/a/book-1.md", { series: "The Bramble Wall", seriesOrder: 1, title: "Book 1" }),
    ];
    const result = groupForLibrary(stories);
    expect(result.seriesGroups).toHaveLength(1);
    expect(result.seriesGroups[0].series).toBe("The Bramble Wall");
    expect(result.seriesGroups[0].stories.map((s) => s.title)).toEqual(["Book 1", "Book 2"]);
  });

  it("includes an accentColor on each series group", () => {
    const stories = [makeStory("stories/a/book-1.md", { series: "The Bramble Wall", seriesOrder: 1 })];
    const result = groupForLibrary(stories);
    expect(result.seriesGroups[0].accentColor).toHaveProperty("background");
    expect(result.seriesGroups[0].accentColor).toHaveProperty("text");
  });

  it("puts stories with no series into standalone, not a series group", () => {
    const stories = [makeStory("stories/standalone-tale.md", { title: "Lonely Tale" })];
    const result = groupForLibrary(stories);
    expect(result.seriesGroups).toHaveLength(0);
    expect(result.standalone.map((s) => s.title)).toEqual(["Lonely Tale"]);
  });

  it("returns an empty standalone array (not omitted) when there are none", () => {
    const stories = [makeStory("stories/a/book-1.md", { series: "The Bramble Wall", seriesOrder: 1 })];
    const result = groupForLibrary(stories);
    expect(result.standalone).toEqual([]);
  });

  it("sorts multiple series groups by each group's earliest publishDate, most recent first", () => {
    const stories = [
      makeStory("stories/old/book-1.md", { series: "Old Series", seriesOrder: 1, publishDate: "2025-01-01" }),
      makeStory("stories/new/book-1.md", { series: "New Series", seriesOrder: 1, publishDate: "2026-01-01" }),
    ];
    const result = groupForLibrary(stories);
    expect(result.seriesGroups.map((g) => g.series)).toEqual(["New Series", "Old Series"]);
  });
});
```

Check the existing test file's `makeStory` helper signature before writing these — adapt field names/shape to match exactly rather than assuming.

**Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/stories-data.test.mjs`
Expected: FAIL — `groupForLibrary` not exported.

**Step 3: Write minimal implementation** — add to `scripts/stories-lib.mjs` (below `computeStories`)

```js
import { accentColorFor } from "./accent-colors.mjs";

// Groups the already-computed, non-draft story list (as returned by
// computeStories()) into series sections and a standalone list, for the
// library page. Pure function — no localStorage/DOM access, since the
// "Continue" section (which DOES need localStorage) can only be computed
// client-side; see site/assets/library.js.
export function groupForLibrary(stories) {
  const bySeries = new Map();
  const standalone = [];
  for (const story of stories) {
    if (!story.series) {
      standalone.push(story);
      continue;
    }
    if (!bySeries.has(story.series)) bySeries.set(story.series, []);
    bySeries.get(story.series).push(story);
  }

  const seriesGroups = Array.from(bySeries.entries()).map(([series, seriesStories]) => {
    seriesStories.sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
    const earliestPublish = seriesStories.reduce(
      (min, s) => Math.min(min, new Date(s.publishDate).getTime()),
      Infinity
    );
    return {
      series,
      accentColor: accentColorFor(series),
      stories: seriesStories,
      _earliestPublish: earliestPublish,
    };
  });

  seriesGroups.sort((a, b) => b._earliestPublish - a._earliestPublish);
  for (const group of seriesGroups) delete group._earliestPublish;

  return { seriesGroups, standalone };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/stories-data.test.mjs`
Expected: PASS (all previous tests plus the 5 new ones).

**Step 5: Commit**

```bash
git add scripts/stories-lib.mjs scripts/stories-data.test.mjs
git commit -m "Add groupForLibrary: series/standalone grouping with accent colors"
```

---

## Task 3: Wire grouped data into the library page's 11ty data layer

**Files:**
- Modify: `site/_data/stories.js`

**Context:** `site/_data/stories.js` must stay a default-export-only module (see the existing comment in that file — Eleventy silently breaks otherwise). Rather than adding a second named export, expose the grouping as a property on the returned array (matching the existing `.bySlug` pattern already used for prev/next).

**Step 1: Modify `site/_data/stories.js`**

```js
import { loadStories, computeStories, groupForLibrary } from "../../scripts/stories-lib.mjs";

// IMPORTANT: keep this file's ONLY export as `export default`. Eleventy's
// global data loader only auto-invokes a data module's default export when
// `default` is the sole export of the module (see the comment in
// scripts/stories-lib.mjs for why) — adding named exports here would
// silently break `data.stories` across the whole site.
export default async function () {
  const rawStories = await loadStories();
  const stories = computeStories(rawStories);
  const { seriesGroups, standalone } = groupForLibrary(stories);
  stories.seriesGroups = seriesGroups;
  stories.standalone = standalone;
  return stories;
}
```

**Step 2: Verify**

Run: `npx @11ty/eleventy` (full build). This won't show grouped output yet since `index.njk` isn't updated until Task 4 — just confirm the build still succeeds with no errors (the `stories` array gaining two extra non-numeric properties, `seriesGroups`/`standalone`, doesn't break Nunjucks's `{% for story in stories %}` iteration, since Nunjucks iterates array indices only).

Run: `npx vitest run` — confirm all existing tests still pass (this change doesn't touch tested logic, just wiring).

**Step 3: Commit**

```bash
git add site/_data/stories.js
git commit -m "Expose seriesGroups/standalone grouping on the stories data object"
```

---

## Task 4: Redesign the library page template and styles — sectioned layout, color-blocked cards, Play button

**Files:**
- Modify: `site/index.njk`
- Modify: `site/assets/style.css`

**Step 1: Rewrite `site/index.njk`**

```njk
---
layout: base.njk
title: Library
---
<h1>Stories</h1>
<input type="search" id="search-box" placeholder="Search stories..." aria-label="Search stories">

<section id="continue-section" aria-labelledby="continue-heading" hidden>
  <h2 id="continue-heading">Continue</h2>
  <div class="card-row" id="continue-row"></div>
</section>

{% for group in stories.seriesGroups %}
<section aria-labelledby="series-heading-{{ loop.index }}" class="series-section" style="--accent-bg: {{ group.accentColor.background }}; --accent-text: {{ group.accentColor.text }};">
  <h2 id="series-heading-{{ loop.index }}">{{ group.series }}</h2>
  <div class="card-grid">
    {% for story in group.stories %}
      {% include "story-card.njk" %}
    {% endfor %}
  </div>
</section>
{% endfor %}

{% if stories.standalone.length > 0 %}
<section aria-labelledby="standalone-heading">
  <h2 id="standalone-heading">More Stories</h2>
  <div class="card-grid">
    {% for story in stories.standalone %}
      {% include "story-card.njk" %}
    {% endfor %}
  </div>
</section>
{% endif %}

<script src="{{ '/assets/search.js' | url }}"></script>
<script src="{{ '/assets/mini-player.js' | url }}"></script>
<script src="{{ '/assets/library.js' | url }}"></script>
```

Note: `story-card.njk` (a new partial, Step 2), `library.js` (new, Task 6), `mini-player.js` (new, Task 7) don't exist yet at this point in the plan — that's fine, script 404s are harmless during incremental development (same pattern used throughout the original implementation plan). Focus this task on the template/CSS; the JS files land in later tasks.

**Step 2: Create the card partial** — `site/_includes/story-card.njk` (extracted so it can be reused across series/standalone loops and, later, the Continue row is rendered client-side using the same visual class names)

```njk
<a class="story-card" href="{{ story.url }}" data-title="{{ story.title }}" data-tags="{{ story.tags | join(' ') }}" data-description="{{ story.description }}" data-slug="{{ story.slug }}" style="{% if group %}--accent-bg: {{ group.accentColor.background }}; --accent-text: {{ group.accentColor.text }};{% endif %}">
  <h3>{{ story.title }}</h3>
  {% if story.series %}<p class="card-series">{{ story.series }} — Book {{ story.seriesOrder }}</p>{% endif %}
  <p>{{ story.description }}</p>
  <p class="card-meta">~{{ story.readMinutes }} min read{% if story.audioMinutes %} · ~{{ story.audioMinutes }} min listen{% endif %}</p>
  {% if story.audio %}
  <a class="play-button" href="{{ story.url }}?autoplay=1" aria-label="Play {{ story.title }}" onclick="event.stopPropagation()">▶</a>
  {% else %}
  <span class="no-audio-badge" aria-label="Text only, no audio">🚫🔊</span>
  {% endif %}
</a>
```

**Note for the implementer:** a nested `<a>` inside another `<a>` (the play button inside the card link) is invalid HTML and will be auto-corrected/flattened by browsers in ways that break click targeting (per the original persona review's designer finding) — verify this concretely when you build it (inspect the actual rendered DOM in a browser, don't just trust the template renders "logically"). If it causes problems, restructure `story-card.njk` so the outer element is a `<div class="story-card">` wrapping two sibling elements: the `<a>` covering title/description/meta (for "open"), and a separate `<a class="play-button">` (for "play") — both direct children of the div, not nested. This is very likely the correct fix; treat the snippet above as a first draft to verify against real rendered/inspected HTML, not as final.

**Step 3: Add CSS** — append to `site/assets/style.css`

```css
h1 { font-size: 1.75rem; font-weight: 800; }
section h2 { font-size: 1.3rem; font-weight: 700; margin: 1.5rem 0 0.75rem; }
.series-section { background: color-mix(in srgb, var(--accent-bg) 12%, transparent); border-radius: 16px; padding: 1rem; margin: 1rem 0; }
.card-row { display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 0.5rem; }
.card-row .story-card { flex: 0 0 220px; }
.story-card {
  position: relative;
  display: block;
  padding: 1rem;
  padding-bottom: 4rem;
  border-radius: 16px;
  text-decoration: none;
  color: inherit;
  min-height: 44px;
  background: var(--accent-bg, #6b7280);
  color: var(--accent-text, #fff);
}
.story-card .card-series,
.story-card .card-meta { opacity: 0.85; }
.play-button {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  color: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  text-decoration: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.no-audio-badge {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  opacity: 0.6;
}
```

Keep the existing `.card-grid`, `.card-meta`, `.resume-badge`, `.resume-banner button`, `.visually-hidden`, `audio`, and `prefers-reduced-motion` rules already in the file — this task only adds to the stylesheet, it doesn't remove the existing accessibility-related rules from Task 10.

**Step 4: Verify in browser**

Since `stories/bramble-wall/book-1.md` has real content and is currently un-drafted (`draft: false`, per the end of the original implementation plan), running `npx @11ty/eleventy` and viewing the library page should show: one series section ("The Bramble Wall") with its accent-colored background and one card, a visible Play button on that card, no "More Stories" section (since `standalone.length` is 0), and no "Continue" section (hidden by default — Task 6 wires up its actual visibility logic). Confirm via browser inspection (Playwright, as used in prior tasks) that the Play button and card-open link are two genuinely separate DOM elements with distinct click targets, not a broken nested-anchor situation.

**Step 5: Commit**

```bash
git add site/index.njk site/_includes/story-card.njk site/assets/style.css
git commit -m "Redesign library page: color-blocked series sections and per-card Play button"
```

---

## Task 5: Story page redesign — accent-colored header, restyled audio card, autoplay handling with fallback

**Files:**
- Modify: `site/_includes/story.njk`
- Modify: `site/story-pages.11ty.js` (pass `accentColor` through to the template)
- Modify: `site/assets/style.css`

**Step 1: Modify `site/story-pages.11ty.js`** to compute and pass through the story's accent color

Add `import { accentColorFor } from "../scripts/accent-colors.mjs";` at the top, and add an `accentColor` entry to the `eleventyComputed` object:

```js
accentColor: (data) => accentColorFor(data.stories.bySlug[data.storyPage.data.storySlug]?.series),
```

**Step 2: Modify `site/_includes/story.njk`**

```njk
---
layout: base.njk
---
<div class="story-header" style="--accent-bg: {{ accentColor.background }}; --accent-text: {{ accentColor.text }};">
  <nav class="breadcrumb">
    <a href="{{ '/' | url }}">← Library</a>
    {% if series %} · {{ series }}{% endif %}
  </nav>

  <h1>{{ title }}</h1>
  <p class="card-meta">~{{ readMinutes }} min read{% if audioMinutes %} · ~{{ audioMinutes }} min listen{% endif %}</p>
</div>

{% if audio %}
<div class="audio-card" style="--accent-bg: {{ accentColor.background }};">
  <audio controls preload="none" id="story-audio" src="{{ audioUrl }}"></audio>
  <p id="autoplay-fallback" class="autoplay-fallback" hidden>▶ Tap play above to start listening</p>
</div>
<p id="resume-banner" class="resume-banner" hidden></p>
{% endif %}

<article class="story-body">
  {{ content | safe }}
</article>

<nav class="series-nav">
  {% if prevStory %}<a href="{{ prevStory.url }}">← {{ prevStory.title }}</a>{% endif %}
  {% if nextStory %}<a href="{{ nextStory.url }}">Next: {{ nextStory.title }} →</a>{% endif %}
</nav>

<script src="{{ '/assets/resume.js' | url }}" data-slug="{{ slug }}"></script>
<script src="{{ '/assets/mini-player.js' | url }}"></script>
```

**Step 3: Add CSS** — append to `site/assets/style.css`

```css
.story-header { background: var(--accent-bg); color: var(--accent-text); padding: 1.5rem 1rem; margin: 0 -1rem 1rem; border-radius: 0 0 16px 16px; }
.story-header .breadcrumb a { color: var(--accent-text); }
.audio-card { background: color-mix(in srgb, var(--accent-bg) 15%, transparent); border-radius: 16px; padding: 1rem; margin-bottom: 1rem; }
.autoplay-fallback { font-weight: 600; margin-top: 0.5rem; }
```

**Step 4: Verify in browser**

Build and view the story page — confirm the accent-colored header band renders, the audio player sits inside a tinted card, and (with `autoplay-fallback` still `hidden` since Task 6 wires up the actual autoplay-attempt logic) nothing looks broken. Run `npx vitest run` to confirm no regressions.

**Step 5: Commit**

```bash
git add site/_includes/story.njk site/story-pages.11ty.js site/assets/style.css
git commit -m "Restyle story page with accent-colored header and audio card"
```

---

## Task 6: Autoplay-on-arrival with fallback, mutually exclusive with the resume banner

**Files:**
- Modify: `site/assets/resume.js`

**Context:** Per the design doc and premortem finding #5, when a story page loads with `?autoplay=1` in the URL, the page should attempt to seek+play immediately using saved progress (if any) — and the existing resume-banner-and-focus logic must be SKIPPED in that case, not run alongside it. Per premortem finding #1, the `.play()` call's promise must always be handled; on rejection, show the fallback message added in Task 5.

**Step 1: Modify `site/assets/resume.js`**

Read the current file first (shown in context above) — this task wraps the existing `if (saved && ...)` banner block in an additional condition and adds a new autoplay branch above it.

```js
const script = document.currentScript;
const slug = script.dataset.slug;
const storageKey = `story-progress:${slug}`;
const audio = document.getElementById("story-audio");
const banner = document.getElementById("resume-banner");
const autoplayFallback = document.getElementById("autoplay-fallback");
const autoplaySignal = new URLSearchParams(window.location.search).get("autoplay") === "1";
if (banner) banner.setAttribute("role", "status");

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
}

function saveProgress(partial) {
  const existing = readProgress() || {};
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...existing, ...partial, savedAt: Date.now() }));
  } catch {
    // Ignore write failures (e.g. Safari private browsing, quota exceeded).
  }
}

const saved = readProgress();

if (autoplaySignal && audio) {
  // Explicit user intent (they tapped Play on the library card) — attempt
  // immediate playback, resuming from saved position if present. This
  // branch is mutually exclusive with the resume banner below: showing
  // both would offer a redundant/contradictory choice for a decision the
  // user already made by tapping Play.
  if (saved && saved.audioTime) audio.currentTime = saved.audioTime;
  audio.play().catch(() => {
    // Browser autoplay policy does not treat a user gesture on the PREVIOUS
    // page as authorization for play() on this freshly-loaded page — this
    // is expected to be blocked on some browsers (notably first-visit
    // mobile Safari/Chrome), not a bug. Show a highly visible fallback
    // instead of leaving the user with silent, unexplained nothing.
    if (autoplayFallback) autoplayFallback.hidden = false;
  });
} else if (saved && (saved.audioTime > 5 || saved.scrollY > 200) && banner) {
  banner.hidden = false;
  banner.innerHTML = `
    <button id="resume-btn" type="button">⏪ Resume where you left off</button>
    <button id="restart-btn" type="button">🔄 Start over</button>
  `;
  document.getElementById("resume-btn").focus();
  document.getElementById("resume-btn").addEventListener("click", () => {
    if (audio && saved.audioTime) audio.currentTime = saved.audioTime;
    if (saved.scrollY) window.scrollTo({ top: saved.scrollY, behavior: "smooth" });
    banner.hidden = true;
  });
  document.getElementById("restart-btn").addEventListener("click", () => {
    localStorage.removeItem(storageKey);
    banner.hidden = true;
    if (audio) audio.currentTime = 0;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

if (audio) {
  let lastSaved = 0;
  audio.addEventListener("timeupdate", () => {
    if (audio.currentTime - lastSaved > 5) {
      saveProgress({ audioTime: audio.currentTime, playing: true });
      lastSaved = audio.currentTime;
    }
  });
  audio.addEventListener("pause", () => saveProgress({ playing: false }));
  audio.addEventListener("play", () => saveProgress({ playing: true }));
}

window.addEventListener("beforeunload", () => {
  saveProgress({ scrollY: window.scrollY });
});
```

Note the two additions beyond the autoplay branch: `playing: true/false` is now written on the `timeupdate`/`pause`/`play` events (feeding the mini-player's staleness-guarded state in Task 7), and `saved.audioTime` is checked before the autoplay branch's seek so a fresh story (no prior progress) just plays from the start.

**Step 2: Verify manually**

Build, serve, and using a headless browser tool (Playwright, scratch, not a dependency): navigate directly to a story URL with `?autoplay=1` appended and confirm `audio.play()` is attempted (check `audio.paused === false` after a tick, or that `.catch()` fires and reveals the fallback message — both are valid depending on the environment's autoplay policy, per the premortem's own finding that this is inherently environment-dependent). Navigate to the same story URL WITHOUT `?autoplay=1` after seeding saved progress and confirm the resume banner still appears exactly as before (no regression to Task 10's behavior). Confirm that with BOTH `?autoplay=1` present AND saved progress present, only the autoplay branch runs (seeks and attempts play) — the banner does not also appear.

Run `npx vitest run` — no test changes expected in this task (resume.js has no direct unit tests, consistent with the original plan's treatment of it as browser-verified glue code), just confirm nothing else broke.

**Step 3: Commit**

```bash
git add site/assets/resume.js
git commit -m "Add autoplay-on-arrival with fallback, mutually exclusive with resume banner"
```

---

## Task 7: Mini-player bar — staleness-guarded, event-bound to real audio state

**Files:**
- Create: `site/assets/mini-player.js`
- Modify: `site/assets/style.css`

**Context:** Per premortem findings #2 and #4: the "is something playing" state must expire if stale (tab closed/killed without a fresh write), and on a page where the real `<audio>` element for the currently-playing story exists, the mini-player's controls must reflect that real element's actual state, not a separately-tracked boolean.

**Step 1: Write `site/assets/mini-player.js`**

```js
const STALE_AFTER_MS = 20_000; // a bit more than resume.js's ~5s timeupdate write cadence

function readAllProgress() {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("story-progress:")) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key));
      if (value) entries.push({ slug: key.slice("story-progress:".length), ...value });
    } catch {
      // Ignore malformed entries.
    }
  }
  return entries;
}

function currentlyPlaying() {
  const now = Date.now();
  return readAllProgress()
    .filter((e) => e.playing && e.savedAt && now - e.savedAt < STALE_AFTER_MS)
    .sort((a, b) => b.savedAt - a.savedAt)[0];
}

function renderBar(playing) {
  let bar = document.getElementById("mini-player");
  if (!playing) {
    if (bar) bar.remove();
    return;
  }
  const localAudio = document.getElementById("story-audio");
  const isLocalStory = localAudio && document.currentScript?.dataset.slug === playing.slug;

  if (!bar) {
    bar = document.createElement("div");
    bar.id = "mini-player";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Now playing");
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <a href="${playing.url ?? "#"}" class="mini-player-title">${playing.title ?? playing.slug}</a>
    <button id="mini-player-toggle" type="button" aria-label="Play or pause">${playing.playing ? "⏸" : "▶"}</button>
  `;

  const toggle = document.getElementById("mini-player-toggle");
  if (isLocalStory) {
    // Real audio element for this story exists on this page — bind directly
    // to its actual events rather than a shadow boolean, so the control
    // can never desync from what's actually playing (premortem finding #4).
    const sync = () => { toggle.textContent = localAudio.paused ? "▶" : "⏸"; };
    localAudio.addEventListener("play", sync);
    localAudio.addEventListener("pause", sync);
    sync();
    toggle.addEventListener("click", () => {
      if (localAudio.paused) localAudio.play().catch(() => {});
      else localAudio.pause();
    });
  } else {
    // No local audio element for this story (e.g. we're on the library
    // page) — this is necessarily an optimistic reflection of last-known
    // state; clicking can only record intent for the story's own page to
    // pick up if/when it's next opened, it cannot pause audio elsewhere.
    toggle.addEventListener("click", () => {
      const key = `story-progress:${playing.slug}`;
      try {
        const existing = JSON.parse(localStorage.getItem(key) || "{}");
        localStorage.setItem(key, JSON.stringify({ ...existing, playing: !playing.playing, savedAt: Date.now() }));
      } catch {
        // Ignore write failures.
      }
      renderBar(currentlyPlaying());
    });
  }
}

renderBar(currentlyPlaying());
window.addEventListener("storage", () => renderBar(currentlyPlaying()));
```

**Note for the implementer:** `playing.url`/`playing.title` are referenced but `resume.js` currently only ever writes `audioTime`/`scrollY`/`playing`/`savedAt` into the per-slug localStorage record — it does NOT currently write `url` or `title`. Add those two fields to `resume.js`'s `saveProgress` calls (or a one-time write on script load) so the mini-player has something to render; check the current file's shape before wiring this up, since the exact mechanism (writing title/url once vs. every save) is an implementation judgment call, not fully specified here. The simplest fix: in `resume.js`, add a single `saveProgress({ title: document.title.replace(" — Stories", ""), url: window.location.pathname })` call once near the top of the script (outside any conditional), so every page visit refreshes these fields regardless of which branch (autoplay/banner/neither) runs below it.

**Step 2: Add CSS** — append to `site/assets/style.css`

```css
#mini-player {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #111;
  color: #fff;
  z-index: 10;
}
.mini-player-title { color: #fff; text-decoration: none; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#mini-player-toggle { min-width: 44px; min-height: 44px; font-size: 1.25rem; background: none; border: none; color: #fff; }
main { padding-bottom: 4.5rem; } /* room for the fixed mini-player bar */
```

**Step 3: Verify manually**

Using a headless browser tool: seed a fake `story-progress:book-1` entry with `playing: true` and a fresh `savedAt`, load the library page, confirm the mini-player bar renders. Wait/mock time past `STALE_AFTER_MS` (or seed an old `savedAt` directly) and reload — confirm the bar does NOT render (staleness guard working). Load the story page itself while `playing: true` is fresh, confirm the mini-player's toggle reflects and controls the real `<audio>` element's actual paused/playing state (press play/pause on the native controls directly and confirm the mini-player's icon updates via the bound events, not just via its own click handler).

Run `npx vitest run` — no new unit tests for this task (it's DOM/localStorage-interaction glue code, consistent with how `resume.js` itself has no direct unit tests), just confirm the suite is unaffected.

**Step 4: Modify `site/assets/resume.js`** to add the title/url write described in the implementer note above, and to `site/index.njk`/`site/_includes/story.njk`'s existing `<script>` tags — confirm `mini-player.js` is loaded on both pages (already added in Tasks 4 and 5's template snippets above).

**Step 5: Commit**

```bash
git add site/assets/mini-player.js site/assets/resume.js site/assets/style.css
git commit -m "Add staleness-guarded mini-player bar bound to real audio state"
```

---

## Task 8: Client-side Continue section

**Files:**
- Create: `site/assets/library.js`

**Context:** The "Continue" section (Task 4's template already has the `hidden` placeholder markup) can only be populated client-side, since it depends on localStorage data that doesn't exist at 11ty build time.

**Step 1: Write `site/assets/library.js`**

```js
const STALE_CONTINUE_DAYS = 30; // don't show a "continue" card for a story not touched in a month+

function readAllProgress() {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("story-progress:")) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key));
      if (value) entries.push({ slug: key.slice("story-progress:".length), ...value });
    } catch {
      // Ignore malformed entries.
    }
  }
  return entries;
}

const cutoff = Date.now() - STALE_CONTINUE_DAYS * 24 * 60 * 60 * 1000;
const entries = readAllProgress().filter((e) => e.savedAt && e.savedAt > cutoff && e.url);

if (entries.length > 0) {
  const section = document.getElementById("continue-section");
  const row = document.getElementById("continue-row");
  entries.sort((a, b) => b.savedAt - a.savedAt);
  for (const entry of entries) {
    const card = document.createElement("a");
    card.className = "story-card";
    card.href = entry.url;
    card.innerHTML = `<h3>${entry.title ?? entry.slug}</h3><p class="card-meta">Continue</p>`;
    row.appendChild(card);
  }
  section.hidden = false;
}
```

Note: this reuses the same `title`/`url` localStorage fields Task 7 added to `resume.js`'s writes.

**Step 2: Verify manually**

Seed a fake progress entry with a recent `savedAt` and a `url`/`title`, load the library page, confirm the Continue section appears with a card linking to that story. Clear localStorage and reload — confirm the Continue section stays `hidden` (no bare heading over nothing, per premortem finding #7's guard principle applied here too).

**Step 3: Commit**

```bash
git add site/assets/library.js
git commit -m "Add client-side Continue section for the library page"
```

---

## Task 9: Full manual QA pass

**Files:** none (verification only)

**Context:** Same rigor as the original plan's final task — this redesign touches accessibility-sensitive code (autoplay, focus management, the mini-player) on top of already-shipped, reviewed behavior. Re-verify the whole thing end to end, not just the new pieces in isolation.

**Step 1: Checklist** (verify each via headless browser automation where possible, being honest about anything genuinely unverifiable in this environment — e.g. real iOS Safari autoplay behavior):

- [ ] Library page: series section renders with correct accent color and contrast; Play button and card-open link are two independently clickable/tappable elements (inspect actual DOM, not just template source).
- [ ] Tapping a card's Play button navigates to the story page and either (a) audio audibly starts, or (b) the "Tap to play" fallback is visibly shown — never silent nothing.
- [ ] Tapping a card's title/description (not the Play button) opens the story page WITHOUT autoplay.
- [ ] Story page: resume banner still works exactly as before (Task 10's original behavior) when visited without `?autoplay=1`.
- [ ] Mini-player: appears when a story is playing, correctly disappears if the underlying progress entry goes stale, toggle reflects real `<audio>` state on the story's own page.
- [ ] Keyboard-only navigation: Play button is reachable and activatable via Tab+Enter; mini-player toggle meets the 44px target and is keyboard-operable.
- [ ] JS disabled: library page and story page content (text, not audio controls' interactivity) still fully readable, per the site's original no-JS content guarantee.
- [ ] Phone viewport: sections/cards/mini-player don't overflow or overlap; mini-player bar doesn't obscure content behind it (confirm the `main { padding-bottom }` CSS addition is sufficient).
- [ ] Search still filters cards correctly with the new section structure.
- [ ] Full `npx vitest run` passes; `npm run validate` passes.
- [ ] Real iPhone/Safari test of the autoplay-after-navigation behavior — flag explicitly as needing the user's own device if unavailable in this environment, per the premortem's finding #1.

**Step 2: Fix anything that fails** before considering this task/plan complete — do not proceed to merge with a known-broken checklist item.

**Step 3: Commit** any final fixes discovered during this pass as their own small commits (not a single squashed "fix everything" commit), following the same task-by-task discipline as the rest of this plan.

---

## What's next (not in this plan)

Further visual polish (custom mascot/illustration, animated transitions beyond `prefers-reduced-motion`-respecting basics) and true cross-tab coordination are explicitly out of scope per the design doc — revisit only if they become an actual pain point, not preemptively.
