# Page modules: markup they expect

`main.js` (load it as `<script type="module" src="{{ '/assets/js/main.js' | url }}">`)
mounts `site/assets/js/<name>.mjs` for every element with `data-mount="<name>"`.
Modules build their own inner DOM with `createElement` and text nodes, so a
template only needs the `data-mount` root. Everything displayed (title, link,
icon, world, accent) comes from `<base>/library.json`; `<html data-base="/Stories">`
is required. Modules emit the CSS classes listed in `../css/README.md` next to their `data-role`/`data-*`
hooks (tests use the hooks; CSS uses the classes).

Common rules:

- A module's root is `hidden` when it has nothing to show (Continue with an empty
  library, Played lately with no history). Style `[hidden]` as `display: none`.
- Cards and buttons carry `data-icon` (library icon name), `data-accent` (the
  world's accent name from `PALETTE`), `data-world` and `data-state` for CSS.
- Events on `document`: `stories:play {slug}` (cancelable), `stories:progress {slug}`,
  `stories:world {world}`.

## `continue`

`<section data-mount="continue"></section>`. Renders one
`a[data-role="card"]` (`data-state="resume|start|again"`, `data-slug`) with children
`[data-role="kicker"]`, `[data-role="title"]`, optional `progress[data-role="bar"]`
(resume only) and `[data-role="action"]`. Links to the story with `?autoplay=1`.

## `played-lately`

`<section data-mount="played-lately"></section>`. Renders
`ul[data-role="list"] > li[data-role="item"] > a[data-slug][data-state="in-progress|finished"]`
with `[data-role="title"]` and `[data-role="state"]` inside. At most three.

## `story-resume`

On the story `<article data-mount="story-resume" data-slug="<slug>">`. Needs the
page's `<audio id="player">` (optional: with none it only restores scroll).
Optional `[data-role="resume"]` inside the article is used as the message area
(banner, autoplay fallback, audio error); without it the module inserts one
(`role="status"`) after the first `h1`. It fills it with
`button[data-role="resume-button"]`, `button[data-role="restart-button"]`,
`p[data-role="autoplay-fallback"]`, `p[data-role="audio-error"]` and
`button[data-role="retry-button"]`. It claims `stories:play` for its own slug.
It saves progress, marks finished (`ended`, and foreground reconciliation against
the real `audio.duration`) and sets Media Session metadata.

## `play-button`

`<button type="button" data-mount="play-button" data-slug="<slug>">Play</button>`
(an `<a>` also works). Optional `[data-role="label"]` child holds the text; a button
holding only text uses itself; a button with other children and no label child
(an icon-only row button) keeps its content and has the verb in its `aria-label`
("Play X", "Resume X", "Play again X") swapped. Label becomes "Resume" or
"Play again" by progress; `data-state="new|in-progress|finished"` is set. Click
fires `stories:play`; if nothing claims it, navigates to `<url>?autoplay=1`.

## `search`

`<input type="search" data-mount="search">` (or a container holding an input).

## `filters`

`<div data-mount="filters"></div>`. Builds a group with `select[data-role="series"]`
(hidden when the current world has fewer than two series) and toggle buttons
`button[data-filter="under15|in-progress|finished|new"][aria-pressed]`. Status
filters OR together; everything else ANDs. It follows the world from
`stories:world` (and the remembered world on mount).

## `world-switcher`

`<div data-mount="world-switcher"></div>`. Builds `div[role="group"]` with
`button[data-world="<name>"]` per world plus `button[data-world=""]` for All
(`aria-pressed`). `data-variant="picker"` (Home) draws `.world-tile` buttons with
the world's icon and PALETTE colours (`--tile`, `--tile-ink`) and, after a choice,
goes to `<base>/library/`; otherwise `.btn` chips. Remembers the choice in
`localStorage["stories-world"]` and emits `stories:world`.

## `text-size`

`<fieldset data-mount="text-size">` holding three `input[type=radio]` (`sm|md|lg`).
The size is CSS; the module restores the remembered radio on mount and stores
changes in `localStorage["stories-text-size"]`.

## World accent (not a hook)

`main.js` also starts `world-accent.mjs` on every page. It sets `--accent` and
`--accent-ink` on `<html>` from the current world's PALETTE entry (from
`library.json`'s `world.accent` name; the palette is `accent-colors.mjs`, shared
with the build scripts) on load and on `stories:world`. All worlds restores the
tokens.css default.

## Library rows (needed by `search` and `filters`)

Every row in the list must be `[data-role="story-row"][data-slug="<slug>"]`. The
modules toggle `hidden` on rows (via `data-hidden-by`) and set
`data-state="new|in-progress|finished"` and `data-new="true"` (published in the
last 14 days with no progress) on each row. An optional
`[data-role="no-results"]` element is used for the "no stories match" message,
otherwise one is inserted after the rows' list. An optional
`[data-role="results-status"]` live region gets "n of N stories" while a search
or filter hides rows.

## `dock` and the shell (router, player, sleep timer)

`base.njk` renders `<main id="view">`, then ONE `<audio id="player" data-role="shell-audio">`
and the dock, both outside `#view`. On a story page the audio already holds that
story (`data-slug`, `src`), so a plain page load works without the router.

- **`dock.mjs`** (`data-mount="dock"`, mounted once, never remounted): fills
  `.dock-mini` with a title button (opens the player sheet) and a play/pause
  button, hidden until something has been started. The player sheet is a modal
  `role="dialog"` (focus trapped, Escape closes, `#view` and the dock rows `inert`
  while open, focus returns to the opener) with a native range seek, back/forward
  15 s, previous/next, speed (remembered in `stories-speed`), the sleep timer and a
  "Read the story" link. The live region announces only user actions (speed,
  sleep timer).
- **`player.mjs`**: owns the audio. Claims `stories:play {slug}` (`preventDefault`)
  when it can find that story's `data-audio-url` on the page or in its cache, so a
  Play button plays in place; otherwise the play-button's `?autoplay=1` navigation
  runs. Saves v2 progress (which emits `stories:progress`), marks finished, and sets
  Media Session (title, artist = world, album = series, artwork from the app icons
  as real URLs; play, pause, stop, seekto, seekbackward, seekforward, previoustrack,
  nexttrack, position state). Next/previous are the neighbours in the series; their
  audio URL is taken from the page, or fetched from the story page and prefetched
  once playback starts.
- **`sleep-timer.mjs`**: 10/15/30/45/60 minutes, fade over the last 10 s, then pause.
  Designed from the spike (timers and `timeupdate` kept running with the screen
  locked): a setTimeout, a check on every `timeupdate` against the wall-clock
  deadline AND the audio actually listened to, and a check on
  visibilitychange/pageshow/resume for a page the OS froze.
- **`router.mjs`**: started from `main.js`. Intercepts same-origin, in-scope link
  clicks (not modified clicks, `target`, `download`, `rel=external`,
  `data-router="off"`, hash-only, or files such as `.mp3`), fetches the page,
  sanitises it (`sanitizeView`: no scripts, `on*` attributes or `javascript:` URLs;
  nothing fetched ever executes), swaps `#view`, the title and the dock's
  `aria-current`, and calls `unmountAll(view)` then `mountAll(view)`. So every module
  inside `#view` must tolerate unmount and a later mount of fresh markup. It owns
  scroll restoration and moves focus to the new `h1`; a polite live region announces
  the title. Any failure falls back to a normal navigation.
  `onBeforeMount` / `onAfterMount` let modules outside `#view` react to a swap.

**Build id.** A fetched page whose `<meta name="build-id">` differs from the
running page triggers a full navigation, at most once per URL per 10 s (a
`sessionStorage` marker), so a mixed-version CDN cannot reload forever; the second
time the page is swapped in with a console warning.

**Kill switch** (all leave the plain multi-page site working): `<html data-router="off">`
(build with `STORIES_ROUTER=off`), `localStorage["stories-router"] = "off"`, or open any
page with `?router=off` (sets that flag) and `?router=on` (clears it).

**Who may use `audio#player`.** story-resume binds to `audio#player`, so the shell
keeps `id="player"` on the element only while it holds the story the current page is
about. On a different story's page while another story is playing, the id is removed:
story-resume then sees no audio and cannot drive or save progress for the wrong story.
Arriving with `?autoplay=1`, or with nothing started yet, switches the element to the
page's story.

**Known browser limitation.** Firefox on Android did not update the lock-screen
title after next/previous even though metadata was set on each load while the page
was hidden (device spike). `player.mjs` assigns a fresh `MediaMetadata` again when
`playing` fires and on every return to the foreground; there is no other workaround.
iOS has not been tested.

## Not here yet

`parts` and `lore` land with WP-E. `main.js` logs a warning and carries on when a
module file is missing.
