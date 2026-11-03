# Homepage mobile simplification — design

**Date:** 2026-08-31
**Status:** Validated with user, ready for implementation planning.

## Problem

The mobile-storybook-redesign homepage (shipped 2026-08-30) is functional but,
seen on a real phone, has three problems:

1. The hero (eyebrow + big title + lede paragraph + CTA button) plus the
   site header bar eat ~70% of the first screen before any content appears.
2. The site header (`📚 Isles of Yum` bar) is redundant — it does nothing
   the bottom tab bar's Home link doesn't already do.
3. Five fixture/placeholder stories (added in the previous redesign purely to
   have data to render against) are still live and confusing on the real
   homepage.
4. The "Continue" row has no limit — every in-progress story shows, which
   doesn't scale.
5. Series/arcs render as full-width horizontal-scrolling rows of full story
   cards, which is heavy for a top-level "browse the library" view once
   there are more than a couple of arcs.

## Decisions

- **Site header:** removed entirely, on every page (not just homepage).
  Navigation relies on the bottom tab bar.
- **Hero:** cut to a single short line — a playful title + short tagline
  (not the "sprinkle of wonder" copy, which reads like stock cookbook-blurb
  language, not something a kid or parent connects with). No eyebrow label,
  no lede paragraph, no CTA button.
- **Search:** stays as the first real interactive element, directly under
  the hero line.
- **Continue:** shows only the single most-recently-played story (by
  `savedAt`), as a slim single-row banner — not a card, not a `.card-row`.
- **Most played:** dropped. There's no backend/account system (this is a
  static site with localStorage-only progress tracking), so a play count
  can't be meaningful across devices. Not worth building a per-device-only
  version that would misrepresent itself as "most played."
- **Arcs (series):** shown as compact vertical cards — icon swatch (from the
  first story's `icon`) + series name + a short (~2 line) description.
  Tapping navigates to the existing `/series/<slug>/` page (no in-place
  expand/accordion — reuses what already exists, no new interaction state).
  Stacked vertically, not horizontally scrolling, since they're compact.
- **Series descriptions:** new hand-authored `site/_data/series.json`,
  keyed by the exact `series:` frontmatter string, `{ description }`. Not
  derived from any single story's own description, since a series is its
  own identity distinct from any one part of it. Missing entries degrade
  gracefully (card renders without a description) so adding a new series
  name to a story never breaks the build before its blurb is written.
- **Loose ("standalone") stories:** unchanged — still rendered as full story
  cards further down the page (currently there are none after cleanup, so
  this section won't render at all until one exists).
- **Series pages** (`/series/<slug>/`) themselves are unchanged — still list
  full story cards. The simplification is homepage-only.

## Content cleanup

Delete five fixture stories that were only ever meant to exercise the UI
during the previous redesign (all explicitly marked `PLACEHOLDER CONTENT`,
tagged `"placeholder"`):

- `stories/felix-and-alex/the-pancake-isle.md`
- `stories/felix-and-alex/the-berry-boat.md`
- `stories/felix-and-alex/the-cloud-picnic.md`
- `stories/felix-and-alex/the-shell-song.md`
- `stories/the-singing-shell.md`

After this, the only real content is "The Map-Maker's Map" (2 parts). The
"Felix & Alex" series and the standalone-stories section will both be empty
until real content is added later — expected and fine for this pass.

## New/changed pieces

- `site/_data/series.json` — new, hand-authored series metadata.
- `site/_includes/base.njk` — remove `<header class="site-header">`.
- `site/index.njk` — replace hero/CTA markup with a one-line hero; replace
  the per-series horizontal `.card-row` block with a stacked arc-card list
  sourced from `stories.seriesGroups` + `series.json`; continue section
  reduced to a single-entry banner.
- New arc-card partial (e.g. `site/_includes/arc-card.njk`).
- `site/assets/library.js` — cut the Continue row down to the single most
  recent entry; new banner markup instead of a card.
- `site/assets/style.css` — new hero/arc-card/continue-banner rules,
  removal of now-unused `.site-header` rule, removal (or repurposing) of
  the horizontal `.card-row` rule for the arcs-specific context (loose
  stories may still want it if that section returns to horizontal scroll
  — kept for standalone section, only the series section changes).

## Explicitly out of scope

- Any new content authoring beyond the `series.json` descriptions (real
  story writing goes through `story-writing-process` as normal).
- Cross-device most-played tracking (would need a backend; not being added).
- Changes to the series detail page's own layout.
