# Homepage Rail Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the homepage's arc-card list + separate series page with one
interleaved, rail-and-row layout that shows every arc's stories directly on
the homepage, ordered by most recent activity, with compact hint lozenges
standing in for the arc description that's being dropped.

**Architecture:** A data-layer change in `scripts/stories-lib.mjs` merges
`seriesGroups`/`standalone` into one sorted list and flips the arc sort key
from earliest- to latest-published story. New front matter
(`keyIslands`/`characters`) feeds compact hint lozenges. A new
`arc-group.njk` template (rail icon + heading + lozenges + story rows)
replaces `arc-card.njk` + `story-card.njk` on the homepage; `story-card.njk`
itself is deleted since nothing else uses it. The now-redundant series page
and its generator are deleted. A new `checkBandContrast` script (mirroring
the existing `checkWaveContrast` pattern) gates the new 20% band-tint color
against the palette in CI-equivalent `npm run build`.

**Tech Stack:** 11ty (Nunjucks templates), vanilla JS, vitest, gray-matter
front matter.

---

### Task 1: Add a `groupForLibrary` unit test (baseline, before changing it)

**Files:**
- Modify: `scripts/stories-lib.test.mjs`

There is currently no test for `groupForLibrary` at all — write one against
its *current* (pre-redesign) behavior first, so Task 2's refactor has a
regression net from the start rather than being validated only by its own
new tests.

**Step 1: Write the failing-would-be test (it should currently pass — this documents existing behavior)**

Add to `scripts/stories-lib.test.mjs`:

```js
import { computeStories, seriesPageData, groupForLibrary } from "./stories-lib.mjs";

describe("groupForLibrary (current behavior, pre-redesign baseline)", () => {
  it("separates series stories from standalone stories into two lists", () => {
    const raw = [
      { file: "stories/a/one.md", data: { title: "One", series: "Arc A", seriesOrder: 1, publishDate: "2026-01-01" }, content: "hi" },
      { file: "stories/standalone.md", data: { title: "Solo", publishDate: "2026-01-05" }, content: "hi" },
    ];
    const stories = computeStories(raw);
    const { seriesGroups, standalone } = groupForLibrary(stories);
    expect(seriesGroups).toHaveLength(1);
    expect(seriesGroups[0].series).toBe("Arc A");
    expect(standalone).toHaveLength(1);
    expect(standalone[0].title).toBe("Solo");
  });
});
```

**Step 2: Run it**

Run: `npx vitest run scripts/stories-lib.test.mjs`
Expected: PASS (this documents current behavior; it is not a TDD red step)

**Step 3: Commit**

```bash
git add scripts/stories-lib.test.mjs
git commit -m "test: cover groupForLibrary's current series/standalone split before refactor"
```

---

### Task 2: Merge `groupForLibrary` into one ordered list, sorted by latest story

**Files:**
- Modify: `scripts/stories-lib.mjs:166-196`
- Modify: `scripts/stories-lib.test.mjs`

**Step 1: Write the failing test**

Replace the Task 1 test's `describe` block in `scripts/stories-lib.test.mjs`
with the new expected shape:

```js
describe("groupForLibrary", () => {
  it("returns one merged, ordered list of arc and standalone groups", () => {
    const raw = [
      { file: "stories/a/one.md", data: { title: "One", series: "Arc A", seriesOrder: 1, publishDate: "2026-01-01" }, content: "hi" },
      { file: "stories/standalone.md", data: { title: "Solo", publishDate: "2026-01-05" }, content: "hi" },
    ];
    const stories = computeStories(raw);
    const { groups } = groupForLibrary(stories);
    expect(groups).toHaveLength(2);
    // Solo (2026-01-05) is more recent than Arc A's only story (2026-01-01),
    // so it sorts first.
    expect(groups[0].series).toBeNull();
    expect(groups[0].stories[0].title).toBe("Solo");
    expect(groups[1].series).toBe("Arc A");
  });

  it("sorts an arc by its MOST RECENT story, not its earliest — adding a new story to an old arc pushes it back to the top", () => {
    const raw = [
      { file: "stories/a/one.md", data: { title: "One", series: "Arc A", seriesOrder: 1, publishDate: "2026-01-01" }, content: "hi" },
      { file: "stories/a/two.md", data: { title: "Two", series: "Arc A", seriesOrder: 2, publishDate: "2026-06-01" }, content: "hi" },
      { file: "stories/b/one.md", data: { title: "B One", series: "Arc B", seriesOrder: 1, publishDate: "2026-03-01" }, content: "hi" },
    ];
    const stories = computeStories(raw);
    const { groups } = groupForLibrary(stories);
    // Arc A's newest story (2026-06-01) beats Arc B's only story (2026-03-01).
    expect(groups[0].series).toBe("Arc A");
    expect(groups[1].series).toBe("Arc B");
  });

  it("wraps every standalone story as its own group with a neutral accent color and null series", () => {
    const raw = [
      { file: "stories/standalone.md", data: { title: "Solo", publishDate: "2026-01-05" }, content: "hi" },
    ];
    const stories = computeStories(raw);
    const { groups } = groupForLibrary(stories);
    expect(groups[0].series).toBeNull();
    expect(groups[0].accentColor).toEqual(accentColorFor(undefined));
    expect(groups[0].stories).toHaveLength(1);
  });

  it("takes keyIslands/characters from the arc's first story only (by seriesOrder)", () => {
    const raw = [
      { file: "stories/a/one.md", data: { title: "One", series: "Arc A", seriesOrder: 1, publishDate: "2026-01-01", keyIslands: ["Isle A"], characters: ["Nib"] }, content: "hi" },
      { file: "stories/a/two.md", data: { title: "Two", series: "Arc A", seriesOrder: 2, publishDate: "2026-06-01", keyIslands: ["Isle B"], characters: ["Someone Else"] }, content: "hi" },
    ];
    const stories = computeStories(raw);
    const { groups } = groupForLibrary(stories);
    expect(groups[0].keyIslands).toEqual(["Isle A"]);
    expect(groups[0].characters).toEqual(["Nib"]);
  });
});
```

Also update the Task 1 baseline test's imports if needed (the new test
supersedes it — remove the old `describe("groupForLibrary (current
behavior...")` block entirely since Task 2 changes the behavior it was
documenting).

**Step 2: Run to verify it fails**

Run: `npx vitest run scripts/stories-lib.test.mjs`
Expected: FAIL — `groups` is undefined (current code returns `{ seriesGroups, standalone }`)

**Step 3: Implement**

Replace `scripts/stories-lib.mjs:166-196` (`groupForLibrary`) with:

```js
// Groups the already-computed, non-draft story list (as returned by
// computeStories()) into one merged list of groups — one per arc, one per
// standalone story — ordered by each group's MOST RECENT story's
// publishDate (so adding a new story to an old arc pushes that whole arc
// back toward the top of the homepage). Pure function — no localStorage/DOM
// access, since the "Continue" section (which DOES need localStorage) can
// only be computed client-side; see site/assets/library.js.
export function groupForLibrary(stories) {
  const bySeries = new Map();
  const groups = [];
  for (const story of stories) {
    if (!story.series) {
      groups.push({
        series: null,
        accentColor: accentColorFor(undefined),
        stories: [story],
        keyIslands: story.keyIslands ?? [],
        characters: story.characters ?? [],
        _latestPublish: new Date(story.publishDate).getTime(),
      });
      continue;
    }
    if (!bySeries.has(story.series)) bySeries.set(story.series, []);
    bySeries.get(story.series).push(story);
  }

  for (const [series, seriesStories] of bySeries.entries()) {
    seriesStories.sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
    const latestPublish = seriesStories.reduce(
      (max, s) => Math.max(max, new Date(s.publishDate).getTime()),
      -Infinity
    );
    const firstStory = seriesStories[0];
    groups.push({
      series,
      accentColor: accentColorFor(series),
      stories: seriesStories,
      keyIslands: firstStory.keyIslands ?? [],
      characters: firstStory.characters ?? [],
      _latestPublish: latestPublish,
    });
  }

  groups.sort((a, b) => b._latestPublish - a._latestPublish);
  for (const group of groups) delete group._latestPublish;

  return { groups };
}
```

**Step 4: Run to verify it passes**

Run: `npx vitest run scripts/stories-lib.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/stories-lib.mjs scripts/stories-lib.test.mjs
git commit -m "feat: merge groupForLibrary into one list sorted by latest story"
```

---

### Task 3: Update `site/_data/stories.js` for the new `groups` shape

**Files:**
- Modify: `site/_data/stories.js:17-19`

**Step 1: Implement**

```js
const { groups } = groupForLibrary(stories);
stories.groups = groups;
```

(Replaces the two lines assigning `stories.seriesGroups` and
`stories.standalone`. Leave `stories.seriesPages = seriesPageData(stories);`
in place for now — it's removed in Task 7 alongside the series page itself,
kept working until then so the site doesn't break mid-refactor.)

**Step 2: Verify nothing else references the old fields yet**

Run: `grep -rn "seriesGroups\|stories\.standalone" site/ scripts/`
Expected: no matches outside `site/index.njk` and `site/_includes/arc-card.njk` (updated in Task 5) — confirms this task's scope is isolated to the data assignment.

**Step 3: Commit**

```bash
git add site/_data/stories.js
git commit -m "feat: wire merged groups into site data"
```

Note: `npm run serve`/build will be visibly broken between this commit and
Task 5 (index.njk still reads the old field names) — that's expected for a
mid-refactor commit in this plan; Task 5 fixes it. If you'd rather keep every
commit deployable, squash Tasks 3-5 before pushing; do not skip committing
between them during development, since each is still a reviewable, bite-sized
step.

---

### Task 4: Add a `checkBandContrast` script for the new 20% band tint (gated, like `checkWaveContrast`)

**Files:**
- Create: `scripts/check-band-contrast.mjs`
- Create: `scripts/check-band-contrast.test.mjs`
- Modify: `package.json` (`scripts.build`)

This mirrors the existing `scripts/check-wave-contrast.mjs` pattern exactly
— a checked-in, enforced contrast gate, not just a comment or an ad hoc
calculation. The 20% mix percentage was already verified manually during
design (worst case 9.53:1 light, 11.96:1 dark), but per this project's own
established convention, it needs a real gate so a future palette edit can't
silently break it.

**Step 1: Write the failing test**

Create `scripts/check-band-contrast.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { checkBandContrast, BAND_MIX_PERCENT } from "./check-band-contrast.mjs";
import { PALETTE } from "./accent-colors.mjs";

describe("checkBandContrast", () => {
  it("passes for every current palette color at the current mix percentage", () => {
    expect(checkBandContrast(PALETTE)).toEqual([]);
  });

  it("flags a color that fails contrast at a given mix percentage", () => {
    const paleColor = [{ background: "#fdf6ec", text: "#ffffff" }]; // near-white, should fail against paper
    expect(checkBandContrast(paleColor, BAND_MIX_PERCENT).length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest run scripts/check-band-contrast.test.mjs`
Expected: FAIL — module doesn't exist yet

**Step 3: Implement**

Create `scripts/check-band-contrast.mjs` (adapted directly from
`scripts/check-wave-contrast.mjs`, same math, different mix percentage and
purpose comment):

```js
import { pathToFileURL } from "node:url";
import { PALETTE } from "./accent-colors.mjs";

// The homepage arc/standalone group band background (site/assets/style.css's
// .rail-group rule) mixes each accent color at BAND_MIX_PERCENT into the
// page background behind the group's heading, lozenges, and story rows —
// this script is the enforced version of that contrast claim, mirroring
// check-wave-contrast.mjs's pattern, so a future palette/token edit that
// breaks contrast fails a check instead of silently shipping unreadable
// text.
export const BAND_MIX_PERCENT = 0.2;
const CONTRAST_FLOOR = 4.5; // WCAG AA for normal-size text

const PAPER = { light: "#faf3e7", dark: "#1c1a17" };
const INK = { light: "#2c2a26", dark: "#f2ede2" };

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function mix(c1, c2, pct) {
  return c1.map((v, i) => Math.round(v * pct + c2[i] * (1 - pct)));
}

function relativeLuminance([r, g, b]) {
  const srgb = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function contrastRatio(c1, c2) {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function checkBandContrast(palette, mixPercent = BAND_MIX_PERCENT) {
  const violations = [];
  for (const { background } of palette) {
    for (const scheme of ["light", "dark"]) {
      const bg = mix(hexToRgb(background), hexToRgb(PAPER[scheme]), mixPercent);
      const ratio = contrastRatio(hexToRgb(INK[scheme]), bg);
      if (ratio < CONTRAST_FLOOR) {
        violations.push(
          `${background} at ${Math.round(mixPercent * 100)}% mix fails contrast in ${scheme} mode: ${ratio.toFixed(2)}:1 (needs ${CONTRAST_FLOOR}:1)`
        );
      }
    }
  }
  return violations;
}

function main() {
  const violations = checkBandContrast(PALETTE);
  if (violations.length > 0) {
    console.error("Band background contrast check failed:\n" + violations.map((v) => `  - ${v}`).join("\n"));
    process.exit(1);
  }
  console.log(`Band background contrast OK for all ${PALETTE.length} palette colors at ${Math.round(BAND_MIX_PERCENT * 100)}% mix (light + dark mode).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

**Step 4: Run to verify it passes**

Run: `npx vitest run scripts/check-band-contrast.test.mjs`
Expected: PASS

**Step 5: Wire into the build gate**

In `package.json`, update the `build` script to match how `check-wave-contrast` is already wired:

```json
"check-band-contrast": "node scripts/check-band-contrast.mjs",
"build": "npm run validate && npm run check-wave-contrast && npm run check-band-contrast && npm run generate-icons && npx @11ty/eleventy",
```

**Step 6: Run the script directly to confirm the CLI path works**

Run: `npm run check-band-contrast`
Expected: `Band background contrast OK for all 8 palette colors at 20% mix (light + dark mode).`

**Step 7: Commit**

```bash
git add scripts/check-band-contrast.mjs scripts/check-band-contrast.test.mjs package.json
git commit -m "feat: gate the new 20% band-tint color against the palette"
```

---

### Task 5: New `arc-group.njk` template + CSS, replacing `arc-card.njk`/`story-card.njk` on the homepage

**Files:**
- Create: `site/_includes/arc-group.njk`
- Modify: `site/index.njk`
- Modify: `site/assets/style.css`
- Delete: `site/_includes/arc-card.njk`
- Delete: `site/_includes/story-card.njk` (confirm nothing else uses it first — see Step 0)

**Step 0: Confirm `story-card.njk` has no other callers before deleting it**

Run: `grep -rn "story-card.njk" site/`
Expected (before this task's edits): `site/index.njk` and `site/_includes/series.njk`. Since Task 7 deletes `series.njk` and this task removes `index.njk`'s usage, after both tasks nothing includes it — safe to delete here since Task 7 comes after.

Actually — to keep this task self-contained and not depend on Task 7 running afterward, **do not delete `story-card.njk` in this task**. Leave it in place (still referenced by `series.njk` until Task 7 deletes both together). Only stop using it in `index.njk`.

**Step 1: Write the new template**

Create `site/_includes/arc-group.njk`:

```njk
<div class="rail-group" style="--accent-bg: {{ group.accentColor.background }};">
  <div class="rail-group-rail">
    <svg class="rail-group-icon" viewBox="0 0 120 82" aria-hidden="true">
      <path class="icon-main" d="{{ icons.path(group.stories[0].icon) }}" />
    </svg>
  </div>
  <div class="rail-group-content">
    {% if group.series %}
    <h3 class="rail-group-heading">{{ group.series }}</h3>
    {% endif %}
    {% if group.keyIslands.length > 0 or group.characters.length > 0 %}
    <div class="rail-group-lozenges">
      {% for character in group.characters %}
      <span class="lozenge">{{ character }}</span>
      {% endfor %}
      {% for island in group.keyIslands %}
      <span class="lozenge">{{ island }}</span>
      {% endfor %}
    </div>
    {% endif %}
    <div class="rail-group-rows">
      {% for story in group.stories %}
      <div class="story-row" data-title="{{ story.title }}" data-tags="{{ story.tags | join(' ') }}" data-description="{{ story.description }}">
        <a class="story-row-link" href="{{ story.url }}">{{ story.title }}</a>
        <div class="story-row-actions">
          {% if story.audioUrl %}
          <button type="button" class="play-button-primary" data-play-slug="{{ story.slug }}" data-play-url="{{ story.audioUrl }}" data-play-title="{{ story.title }}" data-play-story-url="{{ story.url }}" aria-label="Listen to {{ story.title }}"><span aria-hidden="true">▶︎</span> Listen</button>
          <a class="read-link" href="{{ story.url }}">Read →</a>
          {% else %}
          <a class="read-link read-link-primary" href="{{ story.url }}">Read story →</a>
          <span class="no-audio-badge" role="img" aria-label="Text only, no audio">🚫🔊</span>
          {% endif %}
        </div>
      </div>
      {% endfor %}
    </div>
  </div>
</div>
```

Note: `story-row`'s `data-title`/`data-tags`/`data-description` attributes
are required for `search.js` to keep working (see Task 6 — search currently
targets `.story-card`, which no longer exists on the homepage after this
task; Task 6 retargets it to `.story-row`).

**Step 2: Update `site/index.njk`**

Replace lines 16-40 (the whole `#stories` block: arc-card-list section +
standalone "More Stories" section) with:

```njk
<div id="stories">
{% if stories.groups.length > 0 %}
<section aria-labelledby="arcs-heading">
  <h2 id="arcs-heading" class="visually-hidden">Stories</h2>
  <div class="rail-group-list">
    {% for group in stories.groups %}
      {% include "arc-group.njk" %}
    {% endfor %}
  </div>
</section>
{% endif %}
</div>
```

(Drops the separate `series` global lookup that `arc-card.njk` used for
`meta.description` — that data no longer renders anywhere; the lozenges
replace its role. If `site/_data/series.js` or similar exists solely to
feed that description, leave it in place for now unless it errors — check
with `grep -rn "series\[" site/_includes/*.njk` after this edit; expect no
matches.)

**Step 3: Add CSS**

In `site/assets/style.css`, replace the `.arc-card*` rules
(`style.css:220-254`) with:

```css
.rail-group-list { display: flex; flex-direction: column; gap: 1rem; margin: 0.5rem 0 1.5rem; }

.rail-group {
  display: flex;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border-radius: 16px;
  background: color-mix(in srgb, var(--accent-bg) 20%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--fg) 12%, transparent);
}
.rail-group-rail { flex: 0 0 auto; width: 44px; }
.rail-group-icon {
  width: 44px;
  height: 44px;
  padding: 8px;
  border-radius: 12px;
  background: var(--accent-bg);
  box-sizing: border-box;
}
.rail-group-icon .icon-main { fill: none; stroke: #fff; stroke-width: 6; }
.rail-group-content { flex: 1 1 auto; min-width: 0; }
.rail-group-heading { margin: 0 0 0.3rem; font-size: 1.05rem; line-height: 1.3; }

.rail-group-lozenges { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0 0 0.6rem; }
.lozenge {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--fg) 10%, transparent);
  color: var(--fg);
  opacity: 0.85;
}

.rail-group-rows { display: flex; flex-direction: column; }
.story-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0;
  min-height: 44px;
}
.rail-group-rows .story-row + .story-row { border-top: 1px solid color-mix(in srgb, var(--fg) 10%, transparent); }
.story-row-link { flex: 1 1 auto; min-width: 0; font-weight: 600; text-decoration: none; color: inherit; }
.story-row-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 0.5rem; }
```

Reuses the existing `.play-button-primary`, `.read-link`,
`.read-link-primary`, `.no-audio-badge` rules unchanged (already defined
elsewhere in `style.css` for `story-card.njk`; both templates share them
until Task 7 removes the old one).

**Step 4: Run the dev server and check visually**

Run: `npm run validate && npx @11ty/eleventy` (plain build, not `--serve` —
see this session's earlier note that `--serve`'s file-watch copy step hit an
`EPERM` in this environment; a plain build plus a static file server on the
output worked instead)
Expected: builds cleanly, `_site/index.html` contains `rail-group` markup

**Step 5: Commit**

```bash
git add site/_includes/arc-group.njk site/index.njk site/assets/style.css
git commit -m "feat: replace homepage arc-card list with rail-group layout"
```

---

### Task 6: Retarget `search.js` from `.story-card` to `.story-row`

**Files:**
- Modify: `site/assets/search.js`

The homepage no longer renders `.story-card` elements (Task 5 replaced them
with `.story-row`), so search silently stops matching anything if this isn't
updated. `site/_includes/story.njk`'s own page has no search box, so this
only affects the homepage.

**Step 1: Write a test if one doesn't exist, else verify manually**

`search.js` has no existing unit test (it's a plain DOM script with no
exports) — verify via the browser check in Task 8 instead of adding one
here; don't invent test infrastructure for a script this small when the
project has no precedent for testing this file.

**Step 2: Implement**

```js
const searchBox = document.getElementById("search-box");
const rows = Array.from(document.querySelectorAll(".story-row"));

searchBox?.addEventListener("input", () => {
  const query = searchBox.value.trim().toLowerCase();
  for (const row of rows) {
    const haystack = (
      row.dataset.title + " " + row.dataset.tags + " " + row.dataset.description
    ).toLowerCase();
    const match = query === "" || haystack.includes(query);
    row.style.display = match ? "" : "none";
  }
});
```

(Renames `cards`→`rows` and `.story-card`→`.story-row`; attribute names
unchanged since `arc-group.njk` already emits `data-title`/`data-tags`/
`data-description` on each `.story-row`, matching Task 5 Step 1.)

**Step 3: Commit**

```bash
git add site/assets/search.js
git commit -m "fix: retarget homepage search to the new story-row markup"
```

---

### Task 7: Delete the now-redundant series page

**Files:**
- Delete: `site/series-pages.11ty.js`
- Delete: `site/_includes/series.njk`
- Delete: `site/_includes/story-card.njk`
- Modify: `scripts/stories-lib.mjs` (remove `seriesPageData`)
- Modify: `scripts/stories-lib.test.mjs` (remove its test)
- Modify: `site/_data/stories.js` (remove `seriesPageData` import/usage)

**Step 1: Remove `seriesPageData` and its test**

In `scripts/stories-lib.mjs`, delete the `seriesPageData` function
(`scripts/stories-lib.mjs:198-218` as of before this plan's edits).

In `scripts/stories-lib.test.mjs`, delete the
`describe("seriesPageData", ...)` block and its now-unused `seriesPageData`
import.

**Step 2: Update `site/_data/stories.js`**

```js
import fs from "node:fs";
import {
  loadStories,
  computeStories,
  groupForLibrary,
} from "../../scripts/stories-lib.mjs";

export default async function () {
  const rawStories = await loadStories();
  const stories = computeStories(rawStories, fs.existsSync);
  const { groups } = groupForLibrary(stories);
  stories.groups = groups;
  return stories;
}
```

**Step 3: Delete the page files**

```bash
git rm site/series-pages.11ty.js site/_includes/series.njk site/_includes/story-card.njk
```

**Step 4: Confirm nothing else references the deleted exports/files**

Run: `grep -rn "seriesPageData\|series-pages\|series.njk\|story-card.njk" scripts/ site/ --include="*.js" --include="*.mjs" --include="*.njk"`
Expected: no matches (aside from this plan document itself, which isn't part of the source tree checked by this grep pattern)

**Step 5: Run tests**

Run: `npx vitest run`
Expected: all pass, no reference errors

**Step 6: Run the build**

Run: `npm run build`
Expected: succeeds, no `/series/*` output pages in `_site/`

Run: `ls _site/series 2>&1 || echo "confirmed: no series directory"`
Expected: `confirmed: no series directory` (or equivalent "not found")

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: remove the now-redundant series page and its generator"
```

---

### Task 8: Add `keyIslands`/`characters` front matter to existing stories

**Files:**
- Modify: `stories/the-map-makers-map-part-one.md`
- Modify: `stories/the-great-kitchen-part-two.md`
- Modify: `stories/the-isles-of-yum.md`
- Modify: `stories/marzipans-well.md` (currently `draft: true` — not live, but add the fields anyway so it's ready whenever it's un-drafted)

Per the design doc, `characters` values are already decided:
- `the-map-makers-map-part-one.md` and `the-great-kitchen-part-two.md`: `characters: ["Nib"]`
- `marzipans-well.md`: `characters: ["Marzipan"]`
- `the-isles-of-yum.md`: no `characters` field (no non-family lead)

`keyIslands` values are **the user's editorial call** (per the design doc:
"which islands are actually key to the story" needs human judgment, not a
derived rule). This step cannot be completed unattended — stop here and ask
the user for the `keyIslands` values for each of the 4 stories before
writing this front matter. Do not guess or default to `islands[0]` silently;
the design doc explicitly rejected that as an approach.

Suggested prompt back to the user at this point in execution: "Ready for the
`keyIslands` front matter — for each story, which 1-2 islands from its
existing `islands` list actually matter to the plot (not just visited in
passing)?" Show each story's current `islands` array as a reference.

**Step 1 (once values are provided): Edit front matter**

Example shape for `the-map-makers-map-part-one.md` (values illustrative —
replace with the user's actual answer):

```yaml
keyIslands: ["Nib's sandwich island"]
characters: ["Nib"]
```

Insert both fields near the existing `islands:` line in each file's front
matter block.

**Step 2: Validate**

Run: `npm run validate`
Expected: passes (no new required-field checks added — these are optional
fields, `checkRequiredFields` in `scripts/validate-content.mjs` only checks
`title`/`description`/`publishDate`, unaffected)

**Step 3: Commit**

```bash
git add stories/*.md
git commit -m "content: add keyIslands/characters front matter for hint lozenges"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

**Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (including the new `stories-lib.test.mjs` and
`check-band-contrast.test.mjs` cases)

**Step 2: Run validate + build**

Run: `npm run build`
Expected: succeeds end-to-end (validate → check-wave-contrast →
check-band-contrast → generate-icons → eleventy build), no errors

**Step 3: Manual browser verification**

Follow the same pattern used earlier this session for the continue-banner
change (see `run` skill): build once with plain `npx @11ty/eleventy` (not
`--serve`, which hit an `EPERM` in this environment), serve `_site/`
statically under its `/isles-of-yum/` path prefix (symlink `_site` to
`servedir/isles-of-yum` and run `http-server` from `servedir`, or reuse
whatever server setup is already in the scratchpad from the earlier
session), then drive it with a small Playwright script:

- Load the homepage. Confirm arc groups render with: rail icon,
  arc heading (arcs only), lozenges (if `keyIslands`/`characters` were
  filled in during Task 8), and one row per story with a working Listen/Read
  action.
- Confirm the standalone story ("The Isles of Yum") renders as its own
  group with a neutral rail icon, no heading, its own lozenges line, and one
  row.
- Confirm ordering: the arc with the most recent story should appear first.
- Type into the search box and confirm rows filter correctly (validates
  Task 6's search.js retarget).
- Click a story's Listen button and confirm it navigates to the story page
  with `?autoplay=1` (existing `play-button.js` behavior, unchanged).
- Check the browser console for errors on both homepage and story-page
  loads.
- Screenshot the homepage for a final visual check — arcs should show
  clearly bolder color banding than before, given the 15%→20% shift, without
  breaking `--fg` contrast (already gated by Task 4's check).

**Step 4: Confirm no dead references remain**

Run: `grep -rln "seriesGroups\|stories\.standalone\|arc-card\|story-card" site/ scripts/ --include="*.js" --include="*.mjs" --include="*.njk"`
Expected: no matches

**Step 5: Report**

Summarize: tests passing, build clean, browser walkthrough result, and any
deviations from the plan encountered during execution.
