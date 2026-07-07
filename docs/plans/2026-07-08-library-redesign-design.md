# Library Redesign & One-Tap Play — Design

## Goal

Fix the core usability complaint (starting playback from the library requires two clicks even when the user knows exactly which story they want) and give the site a more polished, "product-like" visual identity inspired by Spotify Kids' patterns — bold color-blocked tiles, grouped sections, a persistent mini-player — while staying honest about what a static 11ty + GitHub Pages site can and can't do (no true SPA, no in-memory cross-page audio persistence).

## Background

Original persona review (UX/UI designer, tech-savvy parent, tech-exposed 5-year-old) converged on: every card needs a large, always-visible (not hover-only) Play button distinct from the card's normal "open story" tap target; tapping Play must navigate to the story page with autoplay firing in response to that same gesture (never ambient autoplay); resume state must be shared between the Play button and the existing resume banner; a no-audio story should simply omit the Play button (or show a distinct "no audio" cue, per follow-up direction) rather than showing a broken/missing icon.

The user then asked to go further: use the current site's plainness as a prompt for a genuine visual redesign, referencing Spotify Kids (iOS) screenshots as inspiration for a livelier but still fully-functional interface, and explicitly asked what's achievable within 11ty. Answer: everything in the reference screenshots is achievable with static HTML/CSS/vanilla JS (color-blocked tiles, sticky bottom player bar, grouped sections, big transport controls) — the one real architectural limit is that 11ty produces a static multi-page site, so a "persistent player that survives navigation" can only be *simulated* (state handoff via localStorage + fast re-attach on the next page load), not literally implemented as in-memory continuous playback the way a native app or SPA would.

## Visual language

- **Palette:** keep the existing `color-scheme: light dark` base (warm cream / deep navy backgrounds) rather than Spotify's near-black-everywhere, since this site is reading-heavy, not just browsing-heavy.
- **Per-series accent color:** each series gets a deterministically-derived accent color (hashed from series name/slug, stable across rebuilds, no manual color-picking as more stories are added). Standalone stories get a default neutral accent.
- **Card cover treatment:** no custom mascot/illustration (out of scope); a single simple icon/emoji per series as a lightweight "cover" placeholder, tastefully chosen per series rather than generic.
- **Shape/type:** generous corner rounding (12-16px) on cards and buttons, pill-shaped primary buttons, bolder heading weights, existing large/readable body type retained.

## Library page

**Structure**, in order:
1. Header bar — larger/bolder branding, small decorative accent, unchanged functional role (links home).
2. Search box — same behavior, restyled to match.
3. **"Continue" section** — horizontally-scrollable row of cards with saved localStorage progress, shown first, only rendered if at least one such story exists.
4. **Per-series sections** — one labeled, accent-colored section per series, cards in `seriesOrder`.
5. **"More Stories" section** — standalone stories with no series.

**Card anatomy:**
- Color-blocked tile background (series accent color).
- Title, description, read/listen-time badge (existing data, restyled).
- Large (≥48px), high-contrast, always-visible circular ▶ Play button fixed at the card's bottom-right corner. Tapping it navigates to the story page with an autoplay signal.
- Tapping the rest of the card (title/description area) opens the story page normally — no autoplay, for reading.
- No-audio stories: omit the Play button; show a small distinct "text only" indicator instead (not a broken/greyed play icon).

## Story page

- Header/title area takes on the story's series accent color as a background band, visually linking back to its card.
- Native `<audio controls>` remains the actual player element (preserves all Task 10 accessibility work — keyboard operability, real transport controls), restyled inside an accent-colored card rather than left as a bare browser widget.
- On arrival via a Play-button tap (signal read from the URL/sessionStorage), the page attempts `audio.play()` immediately, resuming from saved position if present — same resume state the in-page resume banner already uses, so both entry points agree.
- **Autoplay is a best-effort attempt, not a guarantee** (see Premortem finding #1) — the `.play()` call's returned promise is always handled: on success, the page proceeds silently; on rejection (browser blocked it, common on a first-visit mobile browser since a user gesture does not carry across a full page navigation), a highly visible "▶ Tap to play" affordance is shown immediately so the child isn't left staring at silence with no explanation.
- **The autoplay path and the resume banner are mutually exclusive, not two independent features reading the same data** (Premortem finding #5): when the autoplay signal is present, `resume.js`'s existing manual resume-banner-and-focus logic is skipped entirely, and the autoplay branch performs the seek-and-play itself using the same `readProgress()` data. The banner (with its Task-10-reviewed focus management) remains exactly as it is today for the organic-visit case (arriving without a Play-button tap).
- Breadcrumb, prev/next series nav, resume banner, and story body are otherwise unchanged, just re-skinned.

## Mini-player bar

- A fixed bottom bar appears on **any** page when local playback state indicates a story is currently playing (triggered via a card's Play button or by pressing play manually on a story page).
- Contents: small color-swatch/icon for the story, title, play/pause toggle. Tapping the bar (outside the toggle) navigates to that story's page.
- No prev/next/queue controls (no playlist concept exists here) — deliberately simpler than Spotify's full transport row.
- **Cross-page handoff (not true persistence):** playback state (slug, currentTime, a `playing` boolean, and an `updatedAt` timestamp) is written to localStorage on an interval, reusing the existing Task 10 resume infrastructure. On every page load, the mini-player checks this state and re-renders itself accordingly; audio pauses during the page transition and resumes at the same position fast enough after the new page loads to read as continuous, though it is technically a stop/restart, not gapless playback. This tradeoff is deliberate and explicitly accepted, not a bug.
- **Staleness guard (Premortem finding #2):** the `playing` flag is only trusted if `updatedAt` is recent (within roughly 2-3x the write interval). A tab closed, backgrounded, or killed while "playing" stops writing fresh timestamps, so on the next page load the mini-player correctly treats that state as stale and does not falsely render a permanent "now playing" bar for audio that's no longer running anywhere.
- **On any page where a real `<audio>` element for the currently-playing story exists** (i.e. that story's own page), the mini-player's play/pause icon is bound directly to that element's native `play`/`pause` events — never to a separately-tracked boolean — so the control can't desync from the actual audio state (Premortem finding #4). On other pages (e.g. the library), where no real audio element exists locally, the icon is necessarily an optimistic reflection of the last-known localStorage state, and tapping it writes an intent flag that the story's own page picks up if/when it's next loaded (it cannot pause audio on a page that isn't open).
- If the user navigates to a *different* story's page while one is already playing via the mini-player, that story keeps priority — the new page's own audio does not auto-start over it.
- **Accepted non-goal:** two browser tabs concurrently playing different (or the same) story will race on the shared localStorage key (Premortem finding #3) — this is a single-family personal project, not worth a `BroadcastChannel`/leader-election system for. The staleness guard above bounds how wrong things can look; true multi-tab correctness is out of scope.

## Accent color contrast guardrail

Per-series accent colors are **not** derived as an arbitrary hash-to-HSL value (Premortem finding #6) — an unconstrained hash risks landing on a low-contrast pairing (e.g., pale yellow background with white text) with no lightness floor/ceiling, especially across both light and dark `color-scheme` renders. Instead: the series-name hash selects an index into a small, fixed palette of 8-10 pre-vetted `{background, text}` color pairs, each manually checked once against WCAG AA (4.5:1) in both light and dark mode before being added to the palette. This keeps color assignment automatic/deterministic (no manual picking per new series) while bounding contrast risk to a one-time fixed check instead of an unbounded generative space.

## Handling sparse content today (Premortem finding #7)

The site currently has exactly one story, in one series, with no standalone stories and no saved progress anywhere. The sectioned layout must be built so this doesn't look broken:
- The "Continue" section is already conditionally rendered only when saved progress exists (per the original Library page structure) — confirmed still correct.
- The "More Stories" (standalone) section must be given the same guard: rendered only when at least one standalone story exists, never as a bare heading over nothing.
- A single series section containing a single card is accepted as an honest, if sparse, reflection of current content — not something to visually disguise or work around. The guard above only prevents the *empty-section* failure mode, not the *sparse-but-real* one.

## Explicitly out of scope for this iteration

Custom mascot illustration/character system, multi-child profile switching, a real queue/playlist model, true gapless/in-memory cross-page audio persistence (would require an SPA rearchitecture), drag-to-seek circular scrubber matching Spotify's exact gesture polish (native `<audio controls>` scrubbing is kept instead), multi-tab playback coordination (see accepted non-goal above).

## Premortem

Conducted against this design before implementation. Findings folded in above:
1. Autoplay-after-navigation is not guaranteed by browser autoplay policy (a user gesture does not survive a full page navigation) — mitigated with a `.catch()` fallback to a visible "Tap to play" affordance, and a requirement to verify on a real mobile browser before considering the feature done.
2. A "currently playing" flag with no expiry would falsely persist forever after a tab close/kill — mitigated with an `updatedAt` staleness check.
3. Two tabs racing on shared localStorage — accepted as a non-goal for this project's scale, bounded by the staleness guard.
4. Mini-player play/pause toggle desyncing from real audio state — mitigated by binding to native media events wherever a real audio element exists, rather than a shadow boolean.
5. New autoplay logic and the existing Task-10-reviewed resume banner both trying to manage focus/audio state from the same data — mitigated by making them mutually exclusive based on whether the autoplay signal is present.
6. Hash-derived accent colors risking WCAG AA contrast failures — mitigated by hashing into a small fixed palette of pre-vetted color pairs rather than an unconstrained HSL space.
7. Sectioned layout looking broken at today's 1-story content scale — mitigated by guarding the standalone section the same way the Continue section is already guarded, and accepting sparse-but-honest rendering otherwise.
