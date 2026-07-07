# Library Redesign & One-Tap Play Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the library/story pages with a Spotify-Kids-inspired visual language (color-blocked per-series card tiles, grouped sections) and fix the two-click-to-play problem with an always-visible per-card Play button that navigates-with-autoplay to the story page, backed by a localStorage-driven cross-page mini-player bar.

**Architecture:** All changes are within the existing 11ty + vanilla JS/CSS stack — no new build tooling, no framework. A new pure-function module computes per-series accent colors and groups stories into Continue/series/standalone sections (unit-tested, following the existing `stories-lib.mjs` pattern). `resume.js` is extended (not replaced) to add a `playing`/`updatedAt` staleness-guarded state and an autoplay-signal branch that's mutually exclusive with the existing resume banner. A new `mini-player.js` renders the fixed bottom bar on every page from that same localStorage state.

**Tech Stack:** Same as the existing project — 11ty v3, vanilla JS/CSS, vitest for pure-function tests, Playwright as a scratch (non-dependency) verification tool as used in prior tasks.

**Task sizing:** each task below is scoped to roughly 10 minutes of focused agent work — one file, one concern, one clear verification step. Don't combine tasks even if they touch the same file; do them in order so later tasks can rely on earlier ones being committed.

Reference docs: `docs/plans/2026-07-08-library-redesign-design.md` (design + premortem), `docs/plans/2026-07-07-stories-site-design.md` (original site design, for constraints like the no-JS content guarantee and 44px tap targets).

---

## Task 1: Accent color palette module

**Files:**
- Create: `scripts/accent-colors.mjs`

**Step 1: Write `scripts/accent-colors.mjs`**

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

**Step 2: Commit**

```bash
git add scripts/accent-colors.mjs
git commit -m "Add pre-vetted accent color palette module"
```

---

## Task 2: Test the accent color palette

**Files:**
- Create: `scripts/accent-colors.test.mjs`

**Step 1: Write `scripts/accent-colors.test.mjs`**

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

**Step 2: Run and confirm pass**

Run: `npx vitest run scripts/accent-colors.test.mjs`
Expected: PASS (4/4). If any fail, fix `accent-colors.mjs` from Task 1 (already committed — amend with a new commit, don't rewrite history).

**Step 3: Commit**

```bash
git add scripts/accent-colors.test.mjs
git commit -m "Add tests for accent color palette"
```

---

## Task 3: Add groupForLibrary to stories-lib.mjs

**Files:**
- Modify: `scripts/stories-lib.mjs`

**Context:** `computeStories()` in this file currently returns a flat array (with a `.bySlug` map attached) sorted by `publishDate`. This task adds a new pure function that groups an already-computed story array into series sections (each with an accent color) and a standalone list. It does NOT touch the "Continue" section — that needs localStorage, a client-side-only concern (Task 12/13).

**Step 1: Read the current file** at `scripts/stories-lib.mjs` to confirm exact current shape before editing (shown in the design/premortem discussion above, but re-read it live — don't assume).

**Step 2: Add this import and function** (append the function after `computeStories`, add the import at the top alongside the existing imports)

```js
import { accentColorFor } from "./accent-colors.mjs";
```

```js
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

**Step 3: Sanity check**

Run: `npx vitest run` — confirm the pre-existing tests in this file still pass unchanged (this task only adds a new export, doesn't touch `computeStories`/`loadStories`/`parseStoryFile`).

**Step 4: Commit**

```bash
git add scripts/stories-lib.mjs
git commit -m "Add groupForLibrary function to stories-lib.mjs"
```

---

## Task 4: Test groupForLibrary

**Files:**
- Modify: `scripts/stories-data.test.mjs`

**Step 1: Read the current file** to find its existing `makeStory` fixture helper (or equivalent) — match its exact signature/shape rather than assuming.

**Step 2: Append these tests**, adapting field names to match the file's existing helper:

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

**Step 3: Run and confirm pass**

Run: `npx vitest run scripts/stories-data.test.mjs`
Expected: PASS, all tests including the 5 new ones. If failing, fix `groupForLibrary` from Task 3 with a new commit.

**Step 4: Commit**

```bash
git add scripts/stories-data.test.mjs
git commit -m "Add tests for groupForLibrary"
```

---

## Task 5: Wire grouped data into the 11ty data layer

**Files:**
- Modify: `site/_data/stories.js`

**Context:** Must stay a default-export-only module (Eleventy silently breaks otherwise — see the existing comment in the file). Expose the grouping as properties on the returned array, matching the existing `.bySlug` pattern.

**Step 1: Read the current file** to confirm its exact shape.

**Step 2: Modify it to**

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

**Step 3: Verify**

Run: `npx @11ty/eleventy` (full build) — confirm it succeeds with no errors. The library page won't visually change yet (Task 6+ updates the template) — this step just confirms the extra non-numeric properties on the `stories` array don't break Nunjucks's existing `{% for story in stories %}` iteration (Nunjucks iterates array indices only, so this should be safe, but confirm empirically).

Run: `npx vitest run` — confirm all tests still pass.

**Step 4: Commit**

```bash
git add site/_data/stories.js
git commit -m "Expose seriesGroups/standalone grouping on the stories data object"
```

---

## Task 6: Extract the story card into its own partial (no visual change yet)

**Files:**
- Create: `site/_includes/story-card.njk`
- Modify: `site/index.njk`

**Context:** Before redesigning the card's look, first extract the EXISTING card markup into a reusable partial with no behavior/appearance change — isolates the "extract" step from the "redesign" step so each is independently verifiable.

**Step 1: Read the current `site/index.njk`** to confirm its exact current card markup (shown earlier in this session, but re-read live).

**Step 2: Create `site/_includes/story-card.njk`** containing exactly the current card markup, unchanged:

```njk
<a class="story-card" href="{{ story.url }}" data-title="{{ story.title }}" data-tags="{{ story.tags | join(' ') }}" data-description="{{ story.description }}">
  <h3>{{ story.title }}</h3>
  {% if story.series %}<p class="card-series">{{ story.series }} — Book {{ story.seriesOrder }}</p>{% endif %}
  <p>{{ story.description }}</p>
  <p class="card-meta">~{{ story.readMinutes }} min read{% if story.audioMinutes %} · ~{{ story.audioMinutes }} min listen{% endif %}</p>
</a>
```

**Step 3: Modify `site/index.njk`** to use the include instead of the inline markup — replace only the card's inner content inside the existing `{% for story in stories %}` loop with `{% include "story-card.njk" %}`, keeping everything else (search box, section wrapper, scripts) exactly as-is.

**Step 4: Verify no visual/behavioral change**

Build and view the library page — confirm it looks and behaves identically to before (same card content, same search filtering, same resume badge script still works since it's untouched). This is a pure refactor step.

**Step 5: Commit**

```bash
git add site/_includes/story-card.njk site/index.njk
git commit -m "Extract story card markup into a reusable partial (no visual change)"
```

---

## Task 7: Redesign the library page template — sectioned layout

**Files:**
- Modify: `site/index.njk`

**Context:** Now that the card is a partial (Task 6), restructure the page around it into Continue/series/standalone sections. This task is template structure only — the Play button and color-blocking come in Tasks 8-9.

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
```

Note: this drops the old flat `{% for story in stories %}` loop entirely in favor of the three sections above. The Continue section's actual population happens client-side in a later task — for now it stays `hidden` always (no JS wired up yet). The resume-badge inline script and `mini-player.js`/`library.js` references are intentionally NOT added yet — those come in later tasks.

**Step 2: Verify**

Build and view the library page — confirm: one series section ("The Bramble Wall") renders with its accent-color CSS variables set (even though no CSS rule uses them yet, so visually it'll look unstyled/plain — that's expected, Task 9 adds the CSS), the card content itself is unchanged (still the Task 6 partial), no "More Stories" section appears (since `standalone.length` is 0 today), Continue section stays hidden. Search should still work (`search.js` is untouched and the card markup/data-attributes are unchanged).

**Step 3: Commit**

```bash
git add site/index.njk
git commit -m "Restructure library page into Continue/series/standalone sections"
```

---

## Task 8: Add Play button and no-audio badge to the story card partial

**Files:**
- Modify: `site/_includes/story-card.njk`

**Context:** This is the actual fix for the original two-click-to-play complaint. Per the design/premortem, a nested `<a>` inside another `<a>` is invalid HTML and can break click targeting — this task must verify the real rendered DOM, not just trust the template.

**Step 1: Modify `site/_includes/story-card.njk`**

```njk
<a class="story-card" href="{{ story.url }}" data-title="{{ story.title }}" data-tags="{{ story.tags | join(' ') }}" data-description="{{ story.description }}" data-slug="{{ story.slug }}">
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

**Step 2: Verify the DOM structure is actually sound — this is the critical check**

Build and view the library page using a headless browser tool (Playwright, scratch, not a dependency). Inspect the ACTUAL rendered/parsed DOM (not the template source) for the card containing a Play button: confirm whether the browser has flattened/broken the nested `<a>` structure. Click specifically on the Play button's coordinates and confirm it navigates to `?autoplay=1` (not the plain card URL); click elsewhere on the card (e.g. the title) and confirm it navigates to the plain URL without `?autoplay=1`.

**If the nested-anchor structure is broken** (very likely, per the design doc's own warning): restructure the partial so the outer element is a `<div class="story-card">` wrapping two sibling elements — the `<a>` covering title/description/meta, and a separate sibling `<a class="play-button">` — both direct children of the div, neither nested inside the other. Re-verify with the same click-target test until it passes cleanly.

**Step 3: Commit**

```bash
git add site/_includes/story-card.njk
git commit -m "Add Play button and no-audio badge to story card, verified as non-nested DOM"
```

---

## Task 9: Color-block the cards and sections — CSS only

**Files:**
- Modify: `site/assets/style.css`

**Step 1: Read the current file** to confirm exact existing rules (shown earlier — re-read live) so this task only appends, never accidentally duplicates or removes Task 10's existing accessibility-related rules (`.resume-badge`, `.resume-banner button`, `.visually-hidden`, `prefers-reduced-motion`, the 44px `min-height` rules).

**Step 2: Append this CSS**

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

**Step 3: Verify visually**

Build and view the library page (real browser or screenshot) — confirm the series section has a tinted background matching its accent color, the card itself is solid-colored with readable text, the Play button is a visible white circle in the bottom-right corner, and (if you temporarily test a no-audio fixture) the no-audio badge shows distinctly instead. Check both light and dark OS color-scheme rendering for contrast (the accent pairs were pre-vetted for both — confirm that check holds up visually, not just in theory).

**Step 4: Commit**

```bash
git add site/assets/style.css
git commit -m "Add color-blocked card and section styling"
```

---

## Task 10: Compute and pass accent color to the story page

**Files:**
- Modify: `site/story-pages.11ty.js`

**Step 1: Read the current file** to confirm its exact `eleventyComputed` shape.

**Step 2: Add the import and one new computed field**

Add near the top: `import { accentColorFor } from "../scripts/accent-colors.mjs";`

Add to the `eleventyComputed` object:

```js
accentColor: (data) => accentColorFor(data.stories.bySlug[data.storyPage.data.storySlug]?.series),
```

**Step 3: Verify**

Run: `npx @11ty/eleventy` — confirm the build succeeds (the story page template doesn't reference `accentColor` yet, so this step just confirms the computed field itself doesn't error). Run `npx vitest run` — confirm no regressions.

**Step 4: Commit**

```bash
git add site/story-pages.11ty.js
git commit -m "Compute accentColor for the story page from its series"
```

---

## Task 11: Restyle the story page — accent header and audio card

**Files:**
- Modify: `site/_includes/story.njk`
- Modify: `site/assets/style.css`

**Step 1: Read the current `site/_includes/story.njk`** to confirm its exact current markup.

**Step 2: Modify it to**

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
```

Note: this only moves/wraps existing elements and adds the (currently inert) `#autoplay-fallback` placeholder — no JS behavior changes yet, that's Task 13.

**Step 3: Add CSS** — append to `site/assets/style.css`

```css
.story-header { background: var(--accent-bg); color: var(--accent-text); padding: 1.5rem 1rem; margin: 0 -1rem 1rem; border-radius: 0 0 16px 16px; }
.story-header .breadcrumb a { color: var(--accent-text); }
.audio-card { background: color-mix(in srgb, var(--accent-bg) 15%, transparent); border-radius: 16px; padding: 1rem; margin-bottom: 1rem; }
.autoplay-fallback { font-weight: 600; margin-top: 0.5rem; }
```

**Step 4: Verify**

Build and view the story page — confirm the accent-colored header band renders correctly, the audio player sits inside a tinted card, resume banner still works exactly as before (Task 10 of the original plan's behavior — unseeded/seeded localStorage should behave identically to before this change). Run `npx vitest run` — no regressions expected.

**Step 5: Commit**

```bash
git add site/_includes/story.njk site/assets/style.css
git commit -m "Restyle story page with accent-colored header and audio card"
```

---

## Task 12: Add the title/url fields resume.js needs for the mini-player

**Files:**
- Modify: `site/assets/resume.js`

**Context:** Small, isolated prep step before the bigger autoplay-branch change (Task 13). The mini-player (Task 15) needs to know each story's title/URL from localStorage — `resume.js` currently never writes those fields.

**Step 1: Read the current `site/assets/resume.js`** to confirm its exact current content.

**Step 2: Add one line** near the top of the script (after the existing `const saved = readProgress();` line, or immediately before it — whichever reads more naturally given the current file, your judgment), unconditionally (not inside any `if` branch):

```js
saveProgress({ title: document.title.replace(" — Stories", ""), url: window.location.pathname });
```

**Step 3: Verify**

Build, serve, open a story page, check via browser devtools (or a quick script) that `localStorage.getItem("story-progress:book-1")` now includes `title` and `url` fields matching the page. Confirm existing resume-banner behavior is unaffected (this is an additive write, not a change to the read/branch logic).

**Step 4: Commit**

```bash
git add site/assets/resume.js
git commit -m "Write title/url into progress storage for the mini-player to use"
```

---

## Task 13: Autoplay-on-arrival branch in resume.js

**Files:**
- Modify: `site/assets/resume.js`

**Context:** Per premortem findings #1 and #5: the autoplay branch must be mutually exclusive with the existing resume banner (not run alongside it), and the `.play()` promise must always be handled with a visible fallback on rejection — this is the single most important behavior in the whole redesign per the premortem, and browser autoplay policy make it inherently not-always-verifiable in this environment (real mobile Safari testing is a followup for the user, per Task 16).

**Step 1: Read the current `site/assets/resume.js`** (post-Task-12) to confirm its exact shape before editing.

**Step 2: Modify the file to add the autoplay signal check and branch**, restructuring the existing `if (saved && (saved.audioTime > 5 || saved.scrollY > 200))` block into an `else if`:

```js
const autoplayFallback = document.getElementById("autoplay-fallback");
const autoplaySignal = new URLSearchParams(window.location.search).get("autoplay") === "1";

// ... (existing readProgress/saveProgress functions and the title/url write from Task 12 stay above this point) ...

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
  // ... existing banner logic, unchanged ...
}
```

Keep the existing banner logic's body completely unchanged — only the `if` became an `else if` with an added `&& banner` guard (defensive, since `banner` only exists when the page has audio) and the new autoplay branch was added above it.

**Step 3: Verify manually** using a headless browser tool (Playwright, scratch, not a dependency):
- Navigate to a story URL WITHOUT `?autoplay=1`, with seeded saved progress — confirm the resume banner appears exactly as before (no regression).
- Navigate to the SAME story URL WITH `?autoplay=1` appended, with the same seeded progress — confirm the banner does NOT appear, and instead either audio actually plays (`audio.paused === false`) or the fallback message becomes visible (`.catch()` fired). Either outcome is acceptable and expected to be environment-dependent per the premortem — what must NOT happen is both the banner appearing AND the autoplay attempt running simultaneously.
- Navigate to a story URL WITH `?autoplay=1` and NO saved progress — confirm it attempts to play from the start (no seek), same pass/fallback logic applies.

**Step 4: Commit**

```bash
git add site/assets/resume.js
git commit -m "Add autoplay-on-arrival branch, mutually exclusive with resume banner"
```

---

## Task 14: Write playing/pause state for the mini-player to read

**Files:**
- Modify: `site/assets/resume.js`

**Context:** Small, separate from Task 13's autoplay logic — this task only adds the `playing` boolean writes the mini-player (Task 15) will read, tied to the audio element's own real events (per premortem finding #4 — the source of truth is the DOM, not a separately-tracked flag).

**Step 1: Read the current file** (post-Task-13) to confirm its exact current shape, specifically the existing `if (audio) { ... audio.addEventListener("timeupdate", ...) ... }` block.

**Step 2: Modify that block** to also write `playing: true` on each `timeupdate` save, and add two new listeners:

```js
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
```

**Step 3: Verify**

Build, serve, open a story page, play the audio, check `localStorage.getItem("story-progress:book-1")` shows `playing: true` shortly after pressing play, and `playing: false` immediately after pressing pause (the `pause`/`play` event listeners should update this instantly, not wait for the 5-second `timeupdate` threshold).

**Step 4: Commit**

```bash
git add site/assets/resume.js
git commit -m "Write playing state on audio play/pause events"
```

---

## Task 15: Mini-player bar script

**Files:**
- Create: `site/assets/mini-player.js`

**Context:** Per premortem finding #2, the "is something playing" state must expire if stale. Per finding #4, on the page where the real `<audio>` element for the currently-playing story exists, controls must bind to that element's real events, not a shadow boolean.

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
  const currentSlug = document.querySelector("script[data-slug]")?.dataset.slug;
  const isLocalStory = localAudio && currentSlug === playing.slug;

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
    const sync = () => { toggle.textContent = localAudio.paused ? "▶" : "⏸"; };
    localAudio.addEventListener("play", sync);
    localAudio.addEventListener("pause", sync);
    sync();
    toggle.addEventListener("click", () => {
      if (localAudio.paused) localAudio.play().catch(() => {});
      else localAudio.pause();
    });
  } else {
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

Note: `currentSlug` is read from `document.querySelector("script[data-slug]")` rather than `document.currentScript`, since this script (unlike `resume.js`) doesn't itself carry a `data-slug` attribute — it reads the one already present on `resume.js`'s script tag, if any (present on story pages, absent on the library page). Verify this lookup actually finds the right element when you test it — it's a reasonable approach but confirm empirically rather than trusting it blind, since a wrong selector here would silently make `isLocalStory` always false.

**Step 2: No test/build step yet** — this file isn't referenced by any template until Task 17. Just confirm it has no syntax errors: `node --check site/assets/mini-player.js`.

**Step 3: Commit**

```bash
git add site/assets/mini-player.js
git commit -m "Add mini-player bar script"
```

---

## Task 16: Mini-player CSS

**Files:**
- Modify: `site/assets/style.css`

**Step 1: Append to `site/assets/style.css`**

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

**Step 2: No visual verification yet** — the mini-player script isn't wired into any page until Task 17, so there's nothing to see yet. Just confirm the CSS file still parses (build succeeds): `npx @11ty/eleventy`.

**Step 3: Commit**

```bash
git add site/assets/style.css
git commit -m "Add mini-player bar CSS"
```

---

## Task 17: Wire mini-player.js into both pages

**Files:**
- Modify: `site/index.njk`
- Modify: `site/_includes/story.njk`

**Step 1: Add one script tag to each file.**

In `site/index.njk`, after the existing `<script src="{{ '/assets/search.js' | url }}"></script>` line, add:

```njk
<script src="{{ '/assets/mini-player.js' | url }}"></script>
```

In `site/_includes/story.njk`, after the existing `<script src="{{ '/assets/resume.js' | url }}" data-slug="{{ slug }}"></script>` line, add:

```njk
<script src="{{ '/assets/mini-player.js' | url }}"></script>
```

**Step 2: Verify manually** using a headless browser tool:
- Seed a fake `story-progress:book-1` entry with `playing: true`, a fresh `savedAt`, a `title`, and a `url` (matching what Tasks 12/14 now actually write). Load the library page — confirm the mini-player bar renders with the right title and a pause icon.
- Manually set `savedAt` to something older than 20 seconds ago and reload — confirm the bar does NOT render (staleness guard).
- Load the story page itself with the same fresh `playing: true` state — confirm the mini-player's toggle reflects the real `<audio>` element's state, and pressing the NATIVE audio control's play/pause directly (not the mini-player's own button) also updates the mini-player's icon via the bound events.

**Step 3: Commit**

```bash
git add site/index.njk site/_includes/story.njk
git commit -m "Wire mini-player script into library and story pages"
```

---

## Task 18: Client-side Continue section script

**Files:**
- Create: `site/assets/library.js`

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

**Step 2: No wiring/verification yet** — added to the page in Task 19. Just confirm no syntax errors: `node --check site/assets/library.js`.

**Step 3: Commit**

```bash
git add site/assets/library.js
git commit -m "Add client-side Continue section script"
```

---

## Task 19: Wire library.js into the library page and verify Continue section

**Files:**
- Modify: `site/index.njk`

**Step 1: Add the script tag** to `site/index.njk`, after the `mini-player.js` tag added in Task 17:

```njk
<script src="{{ '/assets/library.js' | url }}"></script>
```

**Step 2: Verify manually** using a headless browser tool:
- With no localStorage progress at all, load the library page — confirm the Continue section stays `hidden` (no bare heading over nothing).
- Seed a fake progress entry with a recent `savedAt`, a `title`, and a `url` — reload — confirm the Continue section becomes visible with a card linking to that story.
- Seed an entry with a `savedAt` older than 30 days — confirm it's excluded (Continue section stays hidden if that's the only entry).

**Step 3: Commit**

```bash
git add site/index.njk
git commit -m "Wire Continue section script into library page"
```

---

## Task 20: Full manual QA pass

**Files:** none (verification only)

**Context:** Same rigor as the original plan's final task — this redesign touches accessibility-sensitive code (autoplay, focus management, the mini-player) on top of already-shipped, reviewed behavior. Re-verify the whole thing end to end, not just the new pieces in isolation.

**Step 1: Checklist** (verify each via headless browser automation where possible, being honest about anything genuinely unverifiable in this environment — e.g. real iOS Safari autoplay behavior):

- [ ] Library page: series section renders with correct accent color and contrast; Play button and card-open link are two independently clickable/tappable elements (confirmed via real DOM inspection, from Task 8).
- [ ] Tapping a card's Play button navigates to the story page and either (a) audio audibly starts, or (b) the "Tap to play" fallback is visibly shown — never silent nothing.
- [ ] Tapping a card's title/description (not the Play button) opens the story page WITHOUT autoplay.
- [ ] Story page: resume banner still works exactly as before (original Task 10's behavior) when visited without `?autoplay=1`.
- [ ] Mini-player: appears when a story is playing, correctly disappears if the underlying progress entry goes stale, toggle reflects real `<audio>` state on the story's own page.
- [ ] Keyboard-only navigation: Play button is reachable and activatable via Tab+Enter; mini-player toggle meets the 44px target and is keyboard-operable.
- [ ] JS disabled: library page and story page content (text, not audio controls' interactivity) still fully readable, per the site's original no-JS content guarantee.
- [ ] Phone viewport: sections/cards/mini-player don't overflow or overlap; mini-player bar doesn't obscure content behind it (confirm the `main { padding-bottom }` CSS addition from Task 16 is sufficient).
- [ ] Search still filters cards correctly with the new section structure.
- [ ] Full `npx vitest run` passes; `npm run validate` passes.
- [ ] Real iPhone/Safari test of the autoplay-after-navigation behavior — flag explicitly as needing the user's own device if unavailable in this environment, per the premortem's finding #1.

**Step 2: Fix anything that fails** before considering this task/plan complete — do not proceed to merge with a known-broken checklist item.

**Step 3: Commit** any final fixes discovered during this pass as their own small commits (not a single squashed "fix everything" commit), following the same task-by-task discipline as the rest of this plan.

---

## What's next (not in this plan)

Further visual polish (custom mascot/illustration, animated transitions beyond `prefers-reduced-motion`-respecting basics) and true cross-tab coordination are explicitly out of scope per the design doc — revisit only if they become an actual pain point, not preemptively.
