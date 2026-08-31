# Homepage Mobile Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify the mobile homepage — remove the site header, shrink the hero to one line, cap "Continue" to the single most-recent story as a slim banner, replace horizontal-scrolling series rows with compact vertical arc cards linking to series pages, and delete the five leftover placeholder fixture stories.

**Architecture:** Presentation-layer changes to the existing Eleventy site (Nunjucks templates + CSS + a small amount of vanilla JS in `library.js`), plus one new hand-authored data file (`site/_data/series.json`) for arc descriptions. No changes to the content pipeline logic in `stories-lib.mjs` beyond what's needed to expose data already computed (`groupForLibrary`'s existing return shape already has everything an arc card needs — `series`, `accentColor`, `stories[0].icon`). Content cleanup (deleting fixture stories) is a separate task from the template work so each can be verified independently.

**Tech Stack:** Eleventy 3.x (Nunjucks templates), vanilla JS, Vitest.

**Design doc:** `docs/plans/2026-08-31-homepage-mobile-simplify-design.md` (read this first for full rationale).

---

## Decisions locked in during planning (don't re-litigate these)

- Site header removed on **every** page, not just the homepage — navigation relies on the bottom tab bar's Home link.
- Hero is a single short line — playful tagline, not the old "sprinkle of wonder" copy. No eyebrow, no lede paragraph, no CTA button.
- Continue banner shows the **single** most-recently-played story only (by `savedAt`), as a slim single row, not a card in a `.card-row`.
- "Most played" is dropped entirely (no backend, static site, localStorage is per-device only — not worth a misleading local-only version).
- Arc/series cards are compact, vertical-stacked, and tap through to the existing `/series/<slug>/` page (no in-place expand).
- Arc descriptions come from a new hand-authored `site/_data/series.json`, keyed by the exact `series:` frontmatter string. Missing entries degrade gracefully (card just omits the description).
- Five fixture stories get deleted (all marked `PLACEHOLDER CONTENT` / tagged `"placeholder"`): `stories/felix-and-alex/the-pancake-isle.md`, `stories/felix-and-alex/the-berry-boat.md`, `stories/felix-and-alex/the-cloud-picnic.md`, `stories/felix-and-alex/the-shell-song.md`, `stories/the-singing-shell.md`. After deletion, only "The Map-Maker's Map" (2 parts) remains as real content — that's the expected, correct end state for this pass.
- Loose/standalone stories section and the series detail page itself are **unchanged**.

---

### Task 1: Delete placeholder fixture stories

**Files:**
- Delete: `stories/felix-and-alex/the-pancake-isle.md`
- Delete: `stories/felix-and-alex/the-berry-boat.md`
- Delete: `stories/felix-and-alex/the-cloud-picnic.md`
- Delete: `stories/felix-and-alex/the-shell-song.md`
- Delete: `stories/the-singing-shell.md`

**Step 1: Confirm each file is actually a placeholder before deleting**

Run: `grep -l "PLACEHOLDER CONTENT" stories/felix-and-alex/the-pancake-isle.md stories/felix-and-alex/the-berry-boat.md stories/felix-and-alex/the-cloud-picnic.md stories/felix-and-alex/the-shell-song.md stories/the-singing-shell.md`
Expected: all 5 paths printed back (each contains the marker string).

**Step 2: Delete the files**

```bash
git rm stories/felix-and-alex/the-pancake-isle.md stories/felix-and-alex/the-berry-boat.md stories/felix-and-alex/the-cloud-picnic.md stories/felix-and-alex/the-shell-song.md stories/the-singing-shell.md
```

**Step 3: Check if the now-empty `stories/felix-and-alex/` directory should go too**

Run: `ls stories/felix-and-alex/`
Expected: empty (or "No such file or directory" after git rm, since git doesn't track empty dirs — nothing further to do either way).

**Step 4: Run content validation**

Run: `npm run validate`
Expected: passes, reports 2 stories checked (`the-map-makers-map-part-one.md`, `the-great-kitchen-part-two.md`).

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: PASS — no test in the suite depends on fixture content by file count (confirm by reading test output; if any test fails because it hardcoded a count of 5+ stories, that test's fixture data needs updating to use its own inline fixtures instead of real content — read the failure before assuming this, don't guess).

**Step 6: Commit**

```bash
git commit -m "content: remove placeholder fixture stories"
```

---

### Task 2: Remove the site header

**Files:**
- Modify: `site/_includes/base.njk`
- Modify: `site/assets/style.css`

**Step 1: Remove the header markup**

In `site/_includes/base.njk`, delete this line:
```html
  <header class="site-header"><a href="{{ '/' | url }}">📚 Isles of Yum</a></header>
```

So `<body>` goes straight from the opening tag to `<main>`.

**Step 2: Remove the now-unused CSS**

In `site/assets/style.css`, delete these two rules:
```css
.site-header { padding: 1rem; font-size: 1.25rem; }
.site-header a { text-decoration: none; color: inherit; }
```

**Step 3: Verify visually**

Run: `npm run serve` (leave running), open `http://localhost:8080/isles-of-yum/`.
Expected: no header bar above the hero; page starts directly with hero content; bottom tab bar still present and working.

Also check a story page and the series page — confirm no header there either and nothing looks broken without it (e.g. check there's still a way back via the tab bar's Home link).

**Step 4: Run test suite**

Run: `npx vitest run`
Expected: PASS (template-only change, no unit-testable logic touched).

**Step 5: Commit**

```bash
git add site/_includes/base.njk site/assets/style.css
git commit -m "style: remove site header, rely on tab bar for navigation"
```

---

### Task 3: Shrink the hero to one line

**Files:**
- Modify: `site/index.njk`
- Modify: `site/assets/style.css`

**Step 1: Replace the hero markup**

In `site/index.njk`, replace:
```njk
<section class="hero">
  <p class="eyebrow">A storybook archipelago</p>
  <h1 class="display">Stories with a <span class="accent">sprinkle of wonder</span>.</h1>
  <p class="hero-lede">Welcome to the Isles of Yum — a cozy corner of the internet for curious kids, kind grown-ups, and stories worth reading twice.</p>
  <a class="primary-cta" href="#stories">Find a story →</a>
</section>
```
with:
```njk
<section class="hero">
  <h1 class="display">Isles of Yum <span class="accent">— the hungriest adventures.</span></h1>
</section>
```

(Copy is a placeholder in the spirit of what the user asked for — silly/playful, not stock "wonder" language. Flag to the user that they should swap in their own preferred line if this isn't quite right; this is a UI pass, not a copywriting pass.)

**Step 2: Update the hero CSS**

In `site/assets/style.css`, replace:
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
```
with:
```css
.hero { padding: 1.25rem 1rem 0.75rem; }
.hero h1 { font-size: 1.5rem; line-height: 1.25; margin: 0; font-weight: 700; }
.hero h1 .accent { color: var(--coral); font-weight: 600; }
```

(`.eyebrow`, `.hero-lede`, `.primary-cta` rules are removed since nothing references them anymore — confirm with a search before deleting, see Step 3.)

**Step 3: Confirm nothing else references the removed classes**

Run: `grep -rn "hero-lede\|primary-cta\|class=\"eyebrow\"" site/`
Expected: no matches (both were only used in the hero markup just replaced).

**Step 4: Verify visually**

Dev server (from Task 2), reload homepage at a ~375px mobile viewport width.
Expected: hero is a single short line near the top, search box appears just below it — first screen is now mostly search + first arc card, not empty hero space.

**Step 5: Run test suite**

Run: `npx vitest run`
Expected: PASS

**Step 6: Commit**

```bash
git add site/index.njk site/assets/style.css
git commit -m "style: shrink homepage hero to a single line"
```

---

### Task 4: Series metadata file

**Files:**
- Create: `site/_data/series.json`

**Step 1: Create the file**

`site/_data/series.json`:
```json
{
  "The Map-Maker's Map": {
    "description": "Felix and Alex chase a map that keeps redrawing itself, one impossible island at a time."
  }
}
```

Note: the key must exactly match the `series:` frontmatter string in the story files — verify with:
Run: `grep "^series:" stories/*.md`
Expected: `series: "The Map-Maker's Map"` (confirm exact string, including capitalization and punctuation, matches the JSON key above).

**Step 2: Verify Eleventy picks it up as global data**

Any `.json` file under `site/_data/` is auto-loaded by Eleventy as global data keyed by filename (`series.json` → `series` in templates) — no wiring code needed, unlike `stories.js` which is a computed data file.

Run: `npm run build`
Expected: succeeds (this file isn't used by any template yet, so nothing should change in output — this step just confirms the JSON is valid and doesn't break the build).

**Step 3: Commit**

```bash
git add site/_data/series.json
git commit -m "content: add series metadata for arc card descriptions"
```

---

### Task 5: Arc card partial

**Files:**
- Create: `site/_includes/arc-card.njk`
- Modify: `site/assets/style.css`

**Step 1: Create the arc card template**

`site/_includes/arc-card.njk` — expects ambient variables `group` (one entry from `stories.seriesGroups`) and `series` (the global `site/_data/series.json` data):

```njk
<a class="arc-card" href="{{ '/series/' | url }}{{ group.series | slugify }}/" style="--accent-bg: {{ group.accentColor.background }};">
  <svg class="arc-card-icon" viewBox="0 0 120 82" aria-hidden="true">
    <path class="icon-main" d="{{ icons.path(group.stories[0].icon) }}" />
  </svg>
  <div class="arc-card-text">
    <h3>{{ group.series }}</h3>
    {% set meta = series[group.series] %}
    {% if meta and meta.description %}
    <p class="arc-card-description">{{ meta.description }}</p>
    {% endif %}
  </div>
  <span class="arc-card-chevron" aria-hidden="true">→</span>
</a>
```

This reuses the `icons.path()` Nunjucks global already registered in `eleventy.config.js` (used by `story-card.njk` today) — no new global needed.

**Step 2: Add arc card CSS**

In `site/assets/style.css`, add:
```css
.arc-card-list { display: flex; flex-direction: column; gap: 0.75rem; margin: 0.5rem 0 1.5rem; }
.arc-card {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border-radius: 16px;
  background: color-mix(in srgb, var(--accent-bg) 15%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--fg) 12%, transparent);
  text-decoration: none;
  color: inherit;
  min-height: 44px;
}
.arc-card-icon {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  padding: 8px;
  border-radius: 12px;
  background: var(--accent-bg);
  box-sizing: border-box;
}
.arc-card-icon .icon-main { fill: none; stroke: #fff; stroke-width: 6; }
.arc-card-text { flex: 1 1 auto; min-width: 0; }
.arc-card-text h3 { margin: 0; font-size: 1.05rem; line-height: 1.3; }
.arc-card-description {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  opacity: 0.8;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.arc-card-chevron { flex: 0 0 auto; opacity: 0.6; }
```

**Step 3: This task has no standalone visual verification yet**

The partial isn't wired into `index.njk` until Task 6 — skip visual check here, it happens in Task 6's Step 3.

**Step 4: Commit**

```bash
git add site/_includes/arc-card.njk site/assets/style.css
git commit -m "feat: add compact arc card component"
```

---

### Task 6: Wire arc cards into the homepage, remove horizontal series rows

**Files:**
- Modify: `site/index.njk`

**Step 1: Replace the series-row loop**

In `site/index.njk`, replace:
```njk
<div id="stories">
{% for group in stories.seriesGroups %}
<section aria-labelledby="series-heading-{{ loop.index }}" class="series-row-section" style="--accent-bg: {{ group.accentColor.background }}; --accent-text: {{ group.accentColor.text }};">
  <div class="series-row-heading">
    <h2 id="series-heading-{{ loop.index }}">{{ group.series }}</h2>
    <a class="see-all" href="{{ '/series/' | url }}{{ group.series | slugify }}/">See all →</a>
  </div>
  <div class="card-row">
    {% for story in group.stories %}
      {% if loop.index0 < 4 %}
        {% include "story-card.njk" %}
      {% endif %}
    {% endfor %}
  </div>
</section>
{% endfor %}
```
with:
```njk
<div id="stories">
{% if stories.seriesGroups.length > 0 %}
<section aria-labelledby="arcs-heading">
  <h2 id="arcs-heading" class="visually-hidden">Story arcs</h2>
  <div class="arc-card-list">
    {% for group in stories.seriesGroups %}
      {% include "arc-card.njk" %}
    {% endfor %}
  </div>
</section>
{% endif %}
```

(The rest of the file — the `{% if stories.standalone.length > 0 %}` block and the closing `</div>` plus script tags — stays unchanged.)

Note: `.visually-hidden` already exists in `style.css` (used elsewhere) — reused here rather than adding a new rule, since the section needs an accessible heading but the design doesn't call for a visible "Story arcs" label on top of the cards.

**Step 2: Remove now-unused CSS from the series-row-specific rules**

In `site/assets/style.css`, `.series-row-heading` and `.see-all` were only used by the markup just removed — confirm and delete:

Run: `grep -rn "series-row-heading\|class=\"see-all\"\|see-all\"" site/index.njk site/_includes/`
Expected: no matches after the Step 1 edit — if `series.njk` (the series detail page) doesn't use these classes (confirm by reading `site/_includes/series.njk`), delete these two rules from `style.css`:
```css
.series-row-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
.see-all { text-decoration: none; color: inherit; opacity: 0.8; white-space: nowrap; min-height: 44px; display: inline-flex; align-items: center; }
```

Also check `.series-row-section` / `.series-row-section-neutral` — `.series-row-section-neutral` is still used by the "More Stories" section in `index.njk` (unchanged), so keep both — `.series-row-section` is shared by that block too. Confirm with:
Run: `grep -n "series-row-section" site/index.njk`
Expected: still one match (the standalone/"More Stories" section) — if so, keep `.series-row-section` and `.series-row-section-neutral` as-is, only remove `.series-row-heading`/`.see-all` if truly unused.

**Step 3: Verify visually**

Dev server, reload homepage.
Expected: hero → search → (continue banner if applicable, still old style until Task 7) → a vertical list of compact arc cards (currently just "The Map-Maker's Map") → no "More Stories" section (empty, since all standalone stories were deleted in Task 1 — confirm the `{% if stories.standalone.length > 0 %}` guard correctly hides it, i.e. no empty heading renders).

Click the arc card — confirm it navigates to `/series/the-map-makers-map/` (or whatever `slugify("The Map-Maker's Map")` produces — check the actual URL in the browser, don't assume).

**Step 4: Run test suite and build**

Run: `npx vitest run && npm run build`
Expected: both pass.

**Step 5: Commit**

```bash
git add site/index.njk site/assets/style.css
git commit -m "feat: replace horizontal series rows with vertical arc cards on homepage"
```

---

### Task 7: Continue banner — cap to one entry, slim styling

**Files:**
- Modify: `site/assets/library.js`
- Modify: `site/assets/style.css`

**Step 1: Read the current file fully before editing**

Run: `cat site/assets/library.js` (already read during design — re-confirm current state matches what's expected before editing, since Tasks 1-6 didn't touch this file).

**Step 2: Cut to a single entry and change the markup to a slim banner**

Replace the body of `site/assets/library.js` (the whole file) with:

```javascript
const STALE_CONTINUE_DAYS = 30; // don't show a "continue" banner for a story not touched in a month+

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
  entries.sort((a, b) => b.savedAt - a.savedAt);
  const mostRecent = entries[0];

  const section = document.getElementById("continue-section");
  const row = document.getElementById("continue-row");
  row.innerHTML = `
    <a class="continue-banner" href="${mostRecent.url}">
      <span class="continue-banner-label">Continue</span>
      <span class="continue-banner-title">${mostRecent.title ?? mostRecent.slug}</span>
      <span class="continue-banner-arrow" aria-hidden="true">→</span>
    </a>
  `;
  section.hidden = false;
}
```

Changes from the original: `entries` is sorted then only `entries[0]` is used (was: loop over every entry building a `.story-card` into a `.card-row`); markup is a single `.continue-banner` link instead of a full card.

**Step 3: Update `index.njk`'s continue section container**

In `site/index.njk`, the existing markup:
```njk
<section id="continue-section" aria-labelledby="continue-heading" hidden>
  <h2 id="continue-heading">Continue</h2>
  <div class="card-row" id="continue-row"></div>
</section>
```
Change `class="card-row"` to no class (the banner doesn't need horizontal scroll), and drop the now-redundant `<h2>` since the banner itself has a "Continue" label baked into its markup:
```njk
<section id="continue-section" aria-labelledby="continue-heading" hidden>
  <h2 id="continue-heading" class="visually-hidden">Continue</h2>
  <div id="continue-row"></div>
</section>
```
(Heading kept for accessibility — screen readers still get a landmark — just visually hidden since the banner's own "Continue" label covers sighted users.)

**Step 4: Add slim banner CSS**

In `site/assets/style.css`, add:
```css
.continue-banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 1rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--fg) 8%, var(--bg));
  text-decoration: none;
  color: inherit;
  min-height: 44px;
  margin: 0 0 1rem;
}
.continue-banner-label { font-weight: 700; opacity: 0.7; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em; }
.continue-banner-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.continue-banner-arrow { opacity: 0.6; flex: 0 0 auto; }
```

**Step 5: Verify visually**

Dev server, in browser console on the homepage run:
```javascript
localStorage.setItem('story-progress:the-map-makers-map-part-one', JSON.stringify({title: 'The Map-Maker\'s Map (Part One)', url: '/isles-of-yum/stories/the-map-makers-map-part-one/', savedAt: Date.now()}));
localStorage.setItem('story-progress:the-great-kitchen-part-two', JSON.stringify({title: 'The Great Kitchen (Part Two)', url: '/isles-of-yum/stories/the-great-kitchen-part-two/', savedAt: Date.now() - 1000}));
```
Reload. Expected: exactly ONE slim banner row appears (for "The Map-Maker's Map (Part One)", the more recent `savedAt`), not two, not a card.

Clean up test data after verifying:
```javascript
localStorage.removeItem('story-progress:the-map-makers-map-part-one');
localStorage.removeItem('story-progress:the-great-kitchen-part-two');
```

**Step 6: Run test suite**

Run: `npx vitest run`
Expected: PASS (library.js has no unit tests today per the existing project convention — DOM glue files aren't unit tested, same as `mini-player.js`/`resume.js`; this is manual-verification-only, consistent with existing practice).

**Step 7: Commit**

```bash
git add site/assets/library.js site/assets/style.css site/index.njk
git commit -m "feat: cap continue section to most-recent story as a slim banner"
```

---

### Task 8: Full regression pass

**Files:** none (verification only)

**Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

**Step 2: Run a full clean build**

Run: `rm -rf _site && npm run build`
Expected: succeeds, no errors.

**Step 3: Manual click-through**

Dev server: homepage → arc card → series page → a story card there → story detail page → back to homepage via tab bar. Confirm no dead links, no header bar anywhere, hero is one line, continue banner (if progress exists) shows only one entry.

**Step 4: Check mobile viewport (375px and 390px) for horizontal overflow**

Browser devtools device toolbar at both widths — confirm no element causes the page body to scroll horizontally. The arc cards and continue banner should never need horizontal scroll (only the "More Stories" `.card-row`, if it ever has content, is expected to scroll).

**Step 5: Report status**

Summarize: tests passing count, build clean, manual click-through results, and remind the user the hero tagline text (Task 3) is a placeholder they should swap for their own wording.

---

## Explicitly deferred (not in this plan)

- Any further content authoring (real stories, more series) — goes through `story-writing-process` as normal, not this plan.
- Local-only play-count tracking — explicitly dropped per design doc, not deferred-for-later, just not being built.
- Any change to the series detail page (`/series/<slug>/`) layout — out of scope, unchanged by this plan.
