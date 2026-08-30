# Mobile Storybook Redesign — Design

## Background

A V0-generated mockup (`isles-of-yum-Interfacev1`, Next.js/React, static/fake data) explored a warmer "storybook" visual language for the site: cream paper background, serif display headlines, a hand-drawn island map, and color-blocked story cards with simple line-art icons. The look is a real improvement over the current plain Eleventy styling, but the mockup was built desktop-first (side-by-side hero, full 3-column card grids per series) and doesn't hold up on a phone — which is the primary device: open phone, pick a story, hit play, hand off to a Bluetooth speaker, then lock the screen.

This design restyles the **existing, working Eleventy site** (`stories-lib.mjs`, resume/progress tracking, mini-player, per-series accent colors, audio pipeline) rather than rebuilding on V0's React/Next.js stack. The content model and data pipeline are sound and out of scope; this is a presentation-layer pass plus lock-screen/background-audio wiring.

## Primary use case driving the design

Phone screen is usually **locked or backgrounded** once playback starts — this is closer to a podcast/audiobook app than a reading app. That means:
- The library/picker screen matters more than the in-story reading view.
- Real OS lock-screen media controls (title, artwork, play/pause, next/prev) are a first-class requirement, not a nice-to-have.
- "Listen" is the primary action on a story card; "Read" is secondary.

## Visual language

Keep from V0:
- Cream/paper background, warm serif display headlines (two-tone treatment, e.g. coral accent on part of the headline).
- Color-blocked story cards with simple line-art icons (reuses existing per-series `accentColor` data).
- Rounded pill buttons.
- Hand-drawn island map as hero decoration.
- The "paper vs. clay" texture toggle as an optional personality touch.

Change for mobile + scale:
- Bottom tab bar (Home / Library / Now Playing) instead of top nav — thumb-reachable, gives Now Playing a permanent home.
- Hero shrinks and stacks: map moves below the headline as a smaller decorative strip; first screen is headline + one CTA, not map real estate.
- Series shown as horizontal-scroll rows (peeking cards, `scroll-snap`), each capped with a "See all →" into a dedicated series page — reuses the `card-row` pattern already built for the "Continue" section, just extended to every series. Keeps the homepage roughly constant height regardless of story count (10-15+ stories = ~6 rows, not a wall of grids).
- Cards are single-column within a row, ~78vw wide so the next card peeks in.

## Story card

- Color-block header (existing per-series accent color) + line icon, shorter than V0's version so more cards fit on screen.
- Serif title + one-line blurb.
- Meta line: `~6 min read · ~5 min listen` (existing `readMinutes`/`audioMinutes` fields).
- **Primary action: a big round Play/pause button** — starts playback directly from the card, no navigation required, so a story can be queued and the phone handed off in one tap.
- **Secondary: small "Read →" text link.**
- No-audio state keeps the existing 🚫🔊 badge, now visually muted since Listen is the default expectation.

## Now Playing / lock-screen audio

This is the functional core of the redesign, not just decoration:

- **Media Session API** on the shared `<audio>` element: set `title`, `artist` ("The Isles of Yum"), `artwork` (per-story/series icon rendered to PNG at standard sizes), and register `play`/`pause`/`seekbackward`/`seekforward`/`previoustrack`/`nexttrack` action handlers (next/prev = adjacent story in the same series). This is what makes the OS lock screen and Bluetooth speaker/headset hardware buttons show real metadata and work correctly.
- Existing bottom mini-player becomes the persistent **in-app Now Playing bar** (above the tab bar): art swatch, title, play/pause, progress sliver. Tapping opens a full Now Playing view with scrubber and next/prev.
- Existing resume logic (`resume.js`, `story-progress:` localStorage keys) is unchanged — this is styling plus Media Session wiring on top of it.
- **PWA**: manifest + minimal service worker (cache-shell only, not full offline story caching for this pass) so the site is installable and backgrounded playback is reliable rather than best-effort in a browser tab.

## Series pages, story detail, and scaling

- **Homepage**: hero → Continue row (if resuming) → one horizontal row per series → standalones row → footer. Stays short at any story count.
- **New series detail page** (`/series/<slug>/`, generated the same way `story.njk` is per-story): full vertical stacked list of every story in that series, series art/blurb at top. This is the actual scaling mechanism — browsing 15 stories happens one series at a time, never all-at-once.
- **Story detail page** (existing `story.njk`, restyled not restructured): color-block header banner (existing `.story-header` pattern) as the "cover," a prominent Listen button before the text, read-along text below for when the screen is open.
- **Multi-part arcs** (e.g. the Nib storyline): shown as a slim "Part 1 of 2" label plus sequential ordering within a series row/page — no new taxonomy, still just series + order.

## Explicitly out of scope for this pass

- Character glossary/lookup page — noted as a future nav item and a future data-model consideration (tagging which characters appear in which stories), not designed now.
- Full offline story caching in the service worker.
- Any change to `stories-lib.mjs`, frontmatter schema, `narrate.mjs`/audio pipeline, `accent-colors.mjs`, or `search.js` — the content model is sound and untouched.

## File-level implementation plan

1. `site/assets/style.css` — new tokens (cream bg, coral/charcoal, existing `--accent-bg`/`--accent-text`), serif display font, card redesign, bottom tab bar, horizontal row scroll-snap, Now Playing bar restyle.
2. `site/_includes/base.njk` — bottom tab bar markup, PWA manifest link + theme-color meta, new font link.
3. `site/_includes/story-card.njk` — play-first button + icon swatch; icon sourced from a small per-story/series field.
4. `site/index.njk` — restructure to hero + continue-row + per-series horizontal rows + standalone row (replacing full per-series grids).
5. New `site/_includes/series.njk` + a generated collection for `/series/<slug>/` pages (mirrors `story-pages.11ty.js`).
6. `site/assets/mini-player.js` — set up `navigator.mediaSession` metadata + action handlers when a story plays; wire next/prev to adjacent stories in the series.
7. `site/assets/resume.js` — likely untouched, may emit an event `mini-player.js` listens for.
8. New `site/manifest.webmanifest` + minimal `site/sw.js` + registration script.
9. Icons: app icons (192/512) and per-story/series line-art icons — start with simple inline SVGs in the style V0 prototyped (sun/boat/shell/etc.), swappable for commissioned art later.

## Open questions — resolved during plan-writing

- **Serif font:** Fraunces (variable, "soft" opsz), loaded via Google Fonts `<link>`.
- **Per-story icon field:** new `icon:` frontmatter field, validated against a fixed enum in `scripts/icons.mjs`.
- **Media Session artwork PNGs:** generated at build time by `scripts/generate-icon-art.mjs` (using `sharp`) from the same icon/color combinations already in use — not hand-provided, not a one-off manual step.

See `docs/plans/2026-08-30-mobile-storybook-redesign-plan.md` for the concrete task-by-task implementation plan.
