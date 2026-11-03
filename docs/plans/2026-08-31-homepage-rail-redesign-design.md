# Homepage rail redesign

## Problem

The homepage currently shows a vertical list of full-width arc-cards (icon +
title + description + chevron). Tapping one navigates to a separate series
page listing that arc's stories as full story-cards. That extra page/tap is
friction: the user wants to see and act on story titles without leaving the
homepage. Separately, the page reads as visually flat — color exists only as
a light wash (15% tint) on arc-cards, nowhere else.

Prompted by comparing Timepage's calendar-agenda UI (sticky date rail +
grouped event rows) against our own homepage during an earlier UI/UX
review, and by the continue-banner saturation change shipped just before
this (commit 5826e3f).

## Approach

Replace the arc-card list + separate series page with a single homepage
section: one row-group per arc (or standalone story), each with a small
colored rail icon on the left and a compact list of story title-rows on the
right, all visible without navigating away. The separate series page is
deleted entirely — browsing now happens on the homepage.

### Data layer (`scripts/stories-lib.mjs`)

`groupForLibrary()` currently returns two separate lists — `seriesGroups`
(sorted by each arc's *earliest* story) and `standalone` (unsorted relative
to arcs, rendered in a separate homepage section). Replace with one merged,
uniformly-shaped, ordered list:

- Every entry has the shape `{ series, accentColor, stories, keyIslands,
  characters }` — an arc group has `series` set and `stories` as its full
  ordered (`seriesOrder`) list; a standalone story is wrapped the same way
  with `series: null`, `accentColor: PALETTE[0]`, and `stories: [story]`.
- Sort key flips from earliest-story `publishDate` to **latest**-story
  `publishDate` (`Math.max` instead of `Math.min` across the group's
  stories) — so adding a new story to an existing arc pushes that whole arc
  back to the top of the homepage, and a standalone story sorts by its own
  date. One combined list, one sort pass, arcs and standalone stories
  interleaved by this single key.
- `keyIslands` / `characters` for a group come from its **first story only**
  (by `seriesOrder`) — same rule for both fields, no cross-story
  aggregation. See "Hint lozenges" below.

**Removed:** `seriesPageData()`, `site/series-pages.11ty.js`,
`site/_includes/series.njk`, and the `/series/*` route. Prev/next-in-arc
navigation on the story page itself (`story.njk`'s `.series-nav`, driven by
`prevStory`/`nextStory`) is unrelated to this machinery and is unaffected.

### New front matter fields (per story)

- `keyIslands: [...]` — a **curated, hand-picked** subset/reordering of the
  existing `islands` array, naming only the locations that genuinely matter
  to that specific story (not every place visited). `islands` itself is
  confirmed unused elsewhere in the codebase today (purely descriptive), so
  this is additive with no collision risk. Requires editorial judgment per
  story — not derivable by a rule (e.g. "first island listed" isn't
  reliable, since front-matter order isn't necessarily importance order).
- `characters: [...]` — core non-family character names only (excludes
  Felix/Alex/parents). Optional; a story with no strong recurring character
  omits it entirely.

Values for the 4 existing stories (islands to be filled in by hand; the
characters below were specified directly):

| Story | `characters` |
|---|---|
| the-map-makers-map-part-one | `["Nib"]` |
| the-great-kitchen-part-two | `["Nib"]` |
| marzipans-well | `["Marzipan"]` |
| the-isles-of-yum | *(omitted — no non-family lead)* |

## Layout

```
[hero]
[search box]
[continue-banner, unchanged from commit 5826e3f]

┌────┬─────────────────────────────────┐
│ 🗺️ │ The Map-Maker's Map              │  ← arc heading
│icon│ (Nib) (Nib's sandwich island) …  │  ← hint lozenges, once per group
│    │  · The Map-Maker's Map (Part 1)  │  ← story row: title + Listen/Read
│    │  · The Great Kitchen (Part Two)  │  ← story row: title + Listen/Read
├────┼─────────────────────────────────┤
│ ⚪ │  The Isles of Yum                │  ← standalone: title IS the row
│    │ (Fish Finger Reef) (Beans-on-…)  │  ← lozenges under the one row
│    │                     Listen · Read│
└────┴─────────────────────────────────┘
```

- **Rail** (~52-60px wide, not sticky — revisit if arc count grows enough
  to need it): just the existing `arc-card-icon` treatment, solid-filled in
  the group's `accentColor.background`, icon stroked in `accentColor.text`.
  Standalone groups use `PALETTE[0]` (neutral slate), same mechanism as
  arcs — consistent visual rhythm whether or not a story belongs to an arc.
- **Arc heading**: shown only for arc groups (a standalone group's title
  already says everything, no redundant heading).
- **Hint lozenges**: one row of small pill chips, shown once per group
  (under the arc heading, or as a second line under a standalone story's
  title) — not repeated per individual story row. Combined cap of ~4 chips,
  characters first then islands filling remaining slots (not a strict 2+2
  split). Text-only pills, `--fg` at reduced opacity on a slightly more
  opaque chip background, sitting on the group's already-tinted band — no
  separate per-chip coloring needed.
- **Story row**: replaces `story-card.njk` for homepage use. Single line —
  title left, `Listen` button + `Read` link right. No wave art, no icon, no
  description, no read/listen-time metadata (dropped deliberately: at this
  content length the time difference between stories doesn't inform the
  choice). Whole row is tappable to the story page; Listen button stops
  propagation to start audio directly. Hairline `border-top` between rows
  within a multi-story group; no divider around single-row standalone
  groups.
- **Group band**: the whole rail+content group sits on a background tinted
  `color-mix(in srgb, var(--accent-bg) 20%, var(--bg))` — up from the old
  arc-card's 15%, below the continue-banner's 40% (a full-height content
  band needs to stay calmer than a single compact highlight). Verified AA
  contrast (`--fg` text on this background) across all 8 `PALETTE` entries,
  both light and dark mode: worst case 9.53:1 light, 11.96:1 dark —
  comfortably over the 4.5:1 floor.

## Persona check

Ran `persona-review` (five-year-old listener + tired-parent-reading-aloud)
against the structural change (pre-lozenges).

- **Five-year-old**: color-band grouping should read as "these belong
  together" even better than the old description text did for this age
  group, since young children parse color/proximity before reading text.
  Real concern raised: dropping the arc's descriptive blurb removes the one
  piece of text that explained what an arc is about before committing to
  it — flagged as a genuine loss, not dismissed. Addressed by the hint
  lozenges (added after this review, see below).
- **Tired parent reading aloud**: clear net win — fewer taps, no page
  transition, and seeing a whole arc's chapters listed at once (rather than
  one at a time behind a tap) helps a parent orient "which part are we on"
  at a glance, which the old flow obscured until already on the arc page.
  No concerns.
- Both personas agreed the structural change is a net improvement; no
  contradictions between their notes. The one actionable gap (lost arc
  description) was resolved via the hint-lozenge mechanism worked out after
  this review, rather than restoring the old description text.

## Scope

Explicitly out of scope for this change: sticky rail behavior (revisit once
arc count is large enough that a group can run past a screen height), any
change to story-page content or narration, any change to the continue-
banner (already shipped separately).
