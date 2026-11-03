# Continue-banner saturation design

## Problem

The homepage "Continue" banner (localStorage-driven "pick up where you left
off" link) renders as a flat neutral gray tint — the same visual weight as
every arc-card below it. A returning reader has to scan the whole page to
find it instead of it standing out as the obvious next tap.

Prompted by a UI/UX comparison against the Headspace app: its featured
content card uses much higher color saturation than its surrounding muted
category grid, so hierarchy reads instantly through color alone rather than
size or position. Isles of Yum has no equivalent — everything on the
homepage currently uses the same low-intensity tint treatment.

## Approach

Make the continue-banner render using the in-progress story's own accent
color (the same per-arc color already used to tint that arc's card) at a
much stronger mix — 40% instead of the arc-card's 15% — so it visually
outranks the arc list below it. Text stays the existing `--fg` color; no
new copy, icon, or layout changes.

### Data flow

The story's accent color is computed at build time
(`scripts/accent-colors.mjs`) but the continue-banner is rendered client-side
from a localStorage entry that currently only stores `title`/`slug`/`url`/
`savedAt` — it has no color data and no template context to get one from.

1. `site/_includes/story.njk`: add `data-accent-bg="{{ accentColor.background
   }}"` to the element(s) `resume.js` already reads `data-*` attributes from
   (the `<audio>` element for narrated stories; a comparable always-present
   element for text-only stories with no audio player).
2. `site/assets/resume.js`: in `saveProgress()`'s initial call (currently
   saving `title`/`url`/`artworkUrl`/`prevUrl`/`nextUrl`), also save
   `accentBg: <el>?.dataset.accentBg`.
3. `site/assets/library.js`: when rendering `.continue-banner`, if
   `mostRecent.accentBg` is present, set `style="--accent-bg:
   ${mostRecent.accentBg}"` and add a `has-accent` class; otherwise render
   as today (no inline style, no class).

### CSS

Add a new rule scoped to the `has-accent` class so entries saved before this
ships (no stored color) keep rendering exactly as they do today — no
attribute-selector hacks, no fallback math mixing `--fg` at the wrong
percentage:

```css
.continue-banner.has-accent {
  background: color-mix(in srgb, var(--accent-bg) 40%, var(--bg));
}
```

The existing base rule (`color-mix(in srgb, var(--fg) 8%, var(--bg))`) is
untouched and remains the fallback for legacy entries. Since `resume.js`
re-saves progress on every story view, a legacy entry self-heals to the new
colored treatment the next time that story is opened — this is a one-time
cosmetic downgrade per story, not a permanent gap.

### Contrast verification

Computed WCAG AA contrast (`--fg` text on the 40%-mixed background) for all
8 entries in `PALETTE` (`scripts/accent-colors.mjs`), light and dark mode:

- Light mode: 6.80:1 (berry red, worst case) to 7.82:1 (neutral slate)
- Dark mode: 9.29:1 (neutral slate, worst case) to 10.86:1 (plum)

All comfortably clear the 4.5:1 floor — no palette entry needs adjustment,
no text-color switch required (stays `--fg` throughout, unlike
`.story-header` which switches to a fixed `--accent-text`).

## Scope

Explicitly excluded from this change (raised in the same review but kept
separate): the arc-card icon-bleed idea (letting the SVG icon crop against
the card's rounded corner instead of sitting in a padded box). Different
element, different trade-offs, no shared code path with this change.

## Persona check

Ran `persona-review` (five-year-old listener + tired-parent-reading-aloud,
adapted from story review to a UI change) against this design.

- **Five-year-old**: stronger color salience should read as "the important
  one" even more reliably for a young child than for an adult, since kids
  lean on gross visual contrast over subtlety. No confusion risk — copy and
  icon are unchanged. Note (not a blocker): only the single most-recent
  story gets the bold treatment, so a beloved-but-not-most-recent story
  stays muted — pre-existing behavior of the single-item continue-banner,
  not introduced by this change.
- **Tired parent reading aloud**: direct usability win — less scanning, less
  risk of mis-tapping while tired, faster path to "the thing we're already
  reading." This persona is the primary beneficiary of the change.
- **Editor lens** (adapted): confirmed the continue-banner and its matching
  arc-card will share a hue at two different intensities when they're the
  same arc — this is the intended hierarchy mechanism working as designed,
  not a visual clash.

No fixes required; both personas came back positive, no contradictions
between their notes.

## Decision

Approved for implementation. Small, additive, self-healing for legacy data,
contrast-verified, persona-checked.
