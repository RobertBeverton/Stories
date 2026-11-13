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
(resume only) and `[data-role="action"]`. Links to the story with `?autoplay=1`. The bar is updated in place (the card is not
rebuilt) from saved records AND, while a story plays, from the shell audio's clock
(`withLiveProgress` / `onLiveProgress` in `shell-audio.mjs`), so it moves between the
five-second saves and shows a story started seconds ago.

## `played-lately`

The "Pick a story" row on Home: `<div data-mount="played-lately"></div>`. Renders
`ul[data-role="list"] > li[data-role="item"]`: two `a[data-slug][data-state="in-progress|finished|new"]`
(with `[data-role="title"]` and `[data-role="state"]`), then a
`button[data-role="surprise-tile"]` that dispatches `stories:surprise`. The two stories are the most
recently played, leaving out the story the Continue card shows; with less history the row is
filled with the newest other stories (state `new`, "Not played yet"). A finished story heard more
than once says "Heard N times". Like `continue`, it follows the playing story's audio clock.

## `surprise`

`<div data-mount="surprise" hidden></div>` (an anchor; nothing renders in place). Listens for
`stories:surprise` on `document` and opens a bottom sheet (`sheet.mjs`,
`[data-role="surprise-sheet"]`) with world chips (All worlds, then worlds by last played), the
pick (`.surprise-title`, `.surprise-status`), `[data-role="surprise-play"]` and
`[data-role="surprise-again"]`. The pick is `selectors.pickSurprise`: never heard to the end
first, else among those heard longest ago; "Another one" never repeats until the world runs out.
The last world is remembered in `localStorage["stories-surprise-world"]`. Play closes the sheet and
fires `stories:play`, falling back to the story page with `?autoplay=1`; audio never starts
without that press.

## `play-float`

`<div data-mount="play-float" data-slug="<slug>" data-title="<title>"></div>` on the story page (only when the story has audio). Renders
`button[data-role="play-float"]`, a floating Play pill above the dock. It shows only while the page's own
`[data-mount="play-button"][data-pause-when-playing]` for the same slug is out of sight (IntersectionObserver, with the dock
counted as covering the bottom 80px) and the shell audio is not playing this story. A press clicks the page's own button, and the
label follows it (Play, Resume, Play again). Without IntersectionObserver it stays hidden.

## `sheet.mjs` (helper, not a mount)

`createSheet({id, title})` returns `{el, body, attach, open, close, destroy, isOpen, onClose}` (`attach()` puts the closed sheet in the page so its controls exist before it is first opened): a
`role="dialog" aria-modal` bottom sheet on `<body>` (so the router never swaps it). While open
`#view` and `.dock` are `inert`, Escape and the Close button shut it, Tab stays inside and focus
returns to what opened it. Call `destroy()` on unmount.

## `story-resume`

On the story `<article data-mount="story-resume" data-slug="<slug>">`. Uses the shell's
`<audio data-role="shell-audio">` (found with `shell-audio.mjs`; optional: with none it only
restores scroll), and only while `audio.dataset.slug` is this story's slug: every handler
(`timeupdate`, `play`, `pause`, `ended`, `loadedmetadata`, `error`, `stories:play`,
`pagehide`, the Resume and Start over buttons) re-checks that, so another story playing in
the dock is never saved into this record. It does not claim `stories:play` while the audio
holds another story; the player loads it, and this module takes over once it has.
Optional `[data-role="resume"]` inside the article is used as the message area
(banner, autoplay fallback, audio error); without it the module inserts one
(`role="status"`) after the first `h1`. It fills it with
`button[data-role="resume-button"]`, `button[data-role="restart-button"]`,
`p[data-role="autoplay-fallback"]`, `p[data-role="audio-error"]` and
`button[data-role="retry-button"]`. It claims `stories:play` for its own slug. A press of Play on a story the audio already holds
follows one rule (`startPosition` in `shell-audio.mjs`, shared with the player): ended or
finished-and-paused starts from 0, an unstarted audio goes to the saved place, otherwise it
carries on; a story already playing is left alone (the page's button is Pause then). Resume
and Start over are Play buttons with a position: they seek and play while the audio holds the
story, and otherwise ask the player for it with `stories:play` (after writing the record).
It saves progress, marks finished (`ended`, and foreground reconciliation against
the real `audio.duration`) and sets Media Session metadata (only for a loaded story that is
its own; the player owns Media Session otherwise).

## `play-button`

`<button type="button" data-mount="play-button" data-slug="<slug>">Play</button>`
(an `<a>` also works). Optional `[data-role="label"]` child holds the text; a button
holding only text uses itself; a button with other children and no label child
(an icon-only row button) keeps its content and has the verb in its `aria-label`
("Play X", "Resume X", "Play again X") swapped. Label becomes "Resume" or
"Play again" by progress; `data-state="new|in-progress|finished"` is set. Click
fires `stories:play`; if nothing claims it, navigates to `<url>?autoplay=1`.
With the `data-pause-when-playing` attribute (the story page's own button) it is also a Pause
button: while the shell audio holds this story and plays it, the label is "Pause", the glyph a
pause, `data-playing="true"` is set, and a press pauses the audio instead of firing
`stories:play`. It follows the audio however playback was started. Row buttons do not opt in.

## Lore listing (A to Z, search, heard)

The Lore listing (`lore.njk`) is an A to Z index per world: `section[data-lore-world]` holds one
`section.lore-letter[data-letter]` per letter (`scripts/lore-index.mjs`, the `loreLetters` filter: sorted ignoring case and
accents, "#" last) with an `h3.lore-letter-head` and rows `li[data-search] > a.lore-row` (icon, name, tradition). A world
heading is visually hidden while only one world has lore.
On it (`data-mount="lore" data-current="lore"`) the `lore` module also wires
`input[data-role="lore-search"]` (every word must appear in the row's `data-search`: title, tradition, summary)
and a live region `[data-role="lore-status"]`. Non-matching `li`, emptied `.lore-letter` and emptied
`[data-lore-world]` sections get `hidden`. It also fills `nav[data-role="letters"]` with a button per letter that
has entries (only while one world is on show and there are five or more letters; a click scrolls to and focuses that
letter's heading) and `[data-role="heard"]`: names only, as links, of entries whose stories have been listened to on
this device (an `audioTime` above zero or a finish), most recent first, up to 8, hidden while a search is typed.

## `search`

`<input type="search" data-mount="search">` (or a container holding an input). Hides
rows that do not match (title, series, tags, characters: every word must appear), remembers the text for
the tab and announces `stories:search {query}`. Restores the remembered text on mount.

## `filters`

`<div data-mount="filters"></div>` (sits beside the search box): the Library's controls and view (see "Library" below).
Renders one `button[data-role="filters-open"]` ("Filters", with a `[data-role="filter-count"]` badge when something is on)
that opens a bottom sheet (`sheet.mjs`, `[data-role="filters-sheet"]`, attached to the page at mount, hidden until opened). The sheet holds
toggle chips `button[data-filter="in-progress|not-played|audio"][aria-pressed]` in `div[data-role="filters"]`
(`audio`: the story has a known audio duration) (statuses OR together; everything else ANDs),
`div[data-role="collection"]` with a `button[data-collection][aria-pressed]` per tradition from lore plus "Any"
(its `[data-role="collection-section"]` is hidden unless one world is chosen and it has two or more),
`div[data-role="sort"]` with `button[data-sort="order|newest|plays"]`, "Clear filters" (`[data-role="sheet-clear"]`) and
"Show N stories" (`[data-role="sheet-done"]`, closes the sheet). In `[data-role="sort-slot"]` (or after the button when the page has none)
it renders the on filters as removable `button[data-role="active-chip"]` ("Remove Not played") and a `button[data-role="clear"]`
when two or more filters, or a search, are on. It follows the world from `stories:world` (and the remembered world on mount).

## Library (grouped browse)

Default: grouped. Inside `div[data-role="library-view"]` (inserted before the rows' list) it builds
one `section[data-role="series-group"]` per world and series (stories with no series: "Single stories"),
freshest first, all collapsed. A scope with a single series (one world with one series) hides the card header and next-up link
(`section.series-group` stays, `[data-role="groups"][data-solo="true"]`) and lists its stories directly. Each has
`h2 > button[data-role="group-toggle"][aria-expanded][aria-controls]` (name, `[data-role="group-summary"]`
"20 stories · 3 heard"), optional `a[data-role="group-next"]` ("Continue: ..." for a story in progress,
"Next up: ..." once something is heard, nothing before that), and a
`[data-role="group-body"]` holding the rows in story order (`seriesOrder`, else newest first; "Newest" sort always newest first)
and `button[data-role="show-more"]` ("Show 10 more"). More than 12 cards: `[data-role="show-more-groups"]`.
Typing a search or turning any chip or tradition on switches to `[data-role="flat"]`: matching rows only,
20 at a time (`[data-role="flat-more"]`), count "n of N stories". The count lives in the template's
`[data-role="results-status"]` (`aria-live="polite"`) and is always filled ("38 stories").

Rows are the template's own `<li data-role="story-row">`; they are moved, never recreated (play buttons
keep working) and hidden with `hidden` through `data-hidden-by` reasons `filters`, `search`, `page`.
`data-state`, `--progress` and `data-new="true"` are set on every row. State is kept per tab in
sessionStorage (see contracts.md section 4) so Back returns to the same view. Unmount puts every
row back in `#stories` and removes the view. At most about 10 rows per open series are visible;
all rows stay in the DOM, hidden.

## `world-switcher`

`<div data-mount="world-switcher"></div>`. Builds `div[role="group"]` with
`button[data-world="<name>"]` per world plus `button[data-world=""]` for All
(`aria-pressed`). `data-variant="picker"` (Home) draws compact `.world-tile` buttons with
the world's icon and PALETTE colours (`--tile`, `--tile-ink`), most recently played world first,
and, after a choice, goes to `<base>/library/`. Up to three worlds are tiles; with four or more only
the first two are, plus an `[data-role="all-worlds"]` tile ("All N worlds") that opens a sheet of
every world and All stories. Otherwise `.btn` chips in the configured order. Remembers the choice in
`localStorage["stories-world"]` and emits `stories:world`.

## `text-size`

`<fieldset data-mount="text-size">` holding three `input[type=radio]` (`sm|md|lg`).
The size is CSS; the module restores the remembered radio on mount and stores
changes in `localStorage["stories-text-size"]`. The radios are visually hidden with
`pointer-events: none`; the labels are the 44px touch targets (stacked absolute inputs
once swallowed every tap meant for A-).

## Lore cards (story page, not a hook)

`lore-links.njk` renders, inside the story hero between the details and the Play row,
`section.story-lore[data-role="story-lore"]` with one `a.lore-link.lore-chip` per linked
entry: the tradition, "About <title>" and the one-line summary. Only emitted when the story
has lore links. It is the only list of lore links on the page.

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
`[data-role="no-results"]` element is used for the "no stories match" message
(shown when search or filters exclude every row), otherwise one is inserted after the rows' list.
An optional `[data-role="results-status"]` live region gets the count ("n of N stories" with search alone;
the filters module always fills it). Rows may carry `.row-series` and `.row-order` spans in `.row-meta`
(CSS shows the series name in flat lists and "Story n" inside a series).

## `dock` and the shell (router, player, sleep timer)

`base.njk` renders `<main id="view">`, then ONE `<audio id="player" data-role="shell-audio">`
and the dock, both outside `#view`. On a story page the audio already holds that
story (`data-slug`, `src`), so a plain page load works without the router.

- **`dock.mjs`** (`data-mount="dock"`, mounted once, never remounted): fills
  `.dock-mini` with one open button (title, `[data-role="mini-time"]` "elapsed / total" and
  a chevron: the whole left side opens the player sheet), skip back/forward 15 s buttons, a
  play/pause button and a thin `[data-role="mini-progress"]` line, all following the audio
  clock; hidden until something has been started. The player sheet is a modal
  `role="dialog"` (focus trapped, Escape closes, `#view` and the dock rows `inert`
  while open, focus returns to the opener) with a native range seek, back/forward
  15 s (arrow plus "15 sec"), previous/next (the parts of a story that has parts, with the
  neighbouring stories as text buttons in the options row; otherwise the neighbouring
  stories), speed (remembered in `stories-speed`), the sleep timer and a
  "Read the story" link. The live region announces only user actions (speed,
  sleep timer). Closing the sheet returns focus to its opener; if that is gone (a router
  swap removed it) focus goes to the mini button when the mini row shows, else the page's
  `h1` (given `tabindex="-1"`), else the first dock control, never `<body>`.
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
  While paused it waits for the deadline in one timer (never re-arming at zero delay) and
  `play` re-evaluates.
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
time the page is swapped in with a console warning. The id is a content hash of the
build inputs (`scripts/build-id.mjs`), not a timestamp, so the nightly rebuild with no
change keeps it and a page left open never reloads (and loses its audio) for nothing.
Decision: a real deploy still forces the reload even while audio plays. Swapping new
markup under old modules and CSS risks a broken page mid-story, which is worse than one
audible restart after an actual release; revisit only if deploys become frequent.

**Scroll.** `history.scrollRestoration` is `manual`. `history.state.scrollY` is written
after scrolling stops (150 ms), when the page becomes hidden, and on `pagehide`. A reload,
a Back after a full-page fallback navigation and a Back from another site never fire
`popstate`, so `startRouter` also reads `history.state.scrollY` when it starts and scrolls
there once the first modules have mounted (`ready`, passed from `main.js`).

**Overlapping navigations.** The newest `go()` wins. A view whose modules were still
mounting (or whose before-mount hooks had not finished) when the next navigation started
runs no after-mount hooks, focus, scroll or announcement, and is not mounted at all in
the second case. `mountAll` re-checks, after each module's dynamic import, that its claim
is still current and the element is still inside the root, so a late import never mounts
onto a detached element; a mount cancelled during `mount()` is unmounted at once.

**Kill switch** (all leave the plain multi-page site working): `<html data-router="off">`
(build with `STORIES_ROUTER=off`), `localStorage["stories-router"] = "off"`, or open any
page with `?router=off` (sets that flag) and `?router=on` (clears it).

**Who may use the audio.** One `<audio>` holds one story at a time, and the dock's
Next/Previous or a Play button can swap it at any moment, so ownership is the slug and
never an id the shell adds or removes (`id="player"` is permanent). `shell-audio.mjs`
exports `shellAudio()` (the element) and `holdsStory(audio, slug)`; story-resume and
`parts` resolve the element once and call `holdsStory` inside every handler. On a different
story's page while another story plays they do nothing to the audio; pressing that page's
Play makes the player load its story (`stories:play` is claimed by the player), after which
the same handlers, already attached, follow it: part highlight, part jumps, Resume, Start over,
progress saving. Arriving with `?autoplay=1`, or with nothing started yet, switches the
element to the page's story before the modules mount.

**Known browser limitation.** Firefox on Android did not update the lock-screen
title after next/previous even though metadata was set on each load while the page
was hidden (device spike). `player.mjs` assigns a fresh `MediaMetadata` again when
`playing` fires and on every return to the foreground; there is no other workaround.
iOS has not been tested.

## `offline-save`

`<div class="offline-save" data-mount="offline-save" data-slug>` on a story with audio. Builds one
`button.btn[data-role="save"]` (`data-state="none|saving|queued|saved|stale|error"`, `aria-pressed="true"`
when saved) and `p.offline-note[role="status"][aria-live="polite"][data-role="note"]`, which carries the
space message or the failure reason from `job.failedReasons` in plain words. Hides itself (`hidden`)
where the browser has no Cache API or service worker, or the story has no audio. Everything comes from
`library.json` and `offline.mjs`.

## Missing modules

`main.js` logs a warning and carries on when a module file is missing.
