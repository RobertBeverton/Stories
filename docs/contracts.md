# Contracts

The written contract behind the app redesign (see
[plans/2026-11-03-stories-app-redesign-design.md](plans/2026-11-03-stories-app-redesign-design.md)).
Code checks it: `scripts/schema/` and `test/contracts.test.mjs`. If this file
and the code disagree, fix the disagreement at the contract, not in a package.
Only the lead edits this file.

## 1. `library.json`

Emitted at the site root (`/library.json`). Schema: `scripts/schema/library.schema.json`;
validate with `checkLibrary()` from `scripts/schema/validate.mjs`. Unknown fields are rejected.

- `stories[]`: `slug`, `title`, `world`, `series` (or null), `seriesOrder` (or null),
  `durationSec` (or null), `tags`, `url` (prefixed with the base path), `icon`,
  `publishDate` (`YYYY-MM-DD…`), optional `characters[]` (names, searchable in the Library), optional `parts[]` of `{title, start}` (seconds).
- `worlds[]`: `name`, `title`, `tagline`, `accent` (a name in `PALETTE`), `icon`, `hasLore`.
- `lore[]`: `world`, `slug`, `title`, `tradition`, `summary`, optional `link`, `stories[]` (slugs), `url`.

Slugs are the flat, folder-qualified slugs that already key progress. Never change them.

## 2. Progress record v2

Module: `site/assets/js/progress.mjs` (exports `readAll`, `read`, `write`, `markCompleted`,
`toViewModel`). localStorage key `story-progress:<slug>`.

```
{ v: 2, audioTime, scrollY, playing, savedAt, completedAt? }
```

v1 records (with `url`, `title`, `artworkUrl`) are still read, ignoring those
fields, and rewritten as v2 on the next save. Title, URL and art always come from
`library.json`, never from storage. Check with `checkProgressRecord()`.

### Play counts

Module: `progress.mjs` also exports `playCount(slug)` and `readPlays()`. localStorage
key `story-plays:<slug>`, value `{"n": <whole number >= 1>}`. One count is one listen
to the end on this device, added by `markCompleted` (never for a second call about
the same listen, so `ended` plus the foreground check count once). A story with
`completedAt` and no count is 1. Counts are a separate key and not a field of the v2
record on purpose: an older copy of the module open in another tab rejects records
with unknown fields, which would hide the listener's progress. Junk or negative
counts read as 0. Recency of a listen is the record's `completedAt`.

## 3. DOM hooks

Behaviour attaches through `data-mount="<name>"`. Names: `continue`, `played-lately`,
`story-resume`, `search`, `play-button`, `filters`, `world-switcher`, `text-size`, `lore`, `parts`, `dock`, `surprise`, `play-float`.
Each name maps to `site/assets/js/<name>.mjs`, which exports `mount(el)` and returns
`unmount()`. `site/assets/js/main.js` mounts them. Templates (WP-B) emit the
attributes; modules implement them. CSS class names are WP-B's private business.
Per-element data uses `data-slug` (the flat slug).

## 4. Events

On `document`: `stories:play` `{slug}`, `stories:progress` `{slug}`, `stories:world` `{world}`,
`stories:search` `{query}` (the Library search box changed; `CustomEvent`, payload in `detail`),
`stories:surprise` (no payload; opens the Surprise me sheet, which the `surprise` module on Home listens for).

Library state kept in storage (guarded, optional): `localStorage["stories-library-sort"]`
(`order` | `newest`), `sessionStorage["stories-library-view"]` and `["stories-library-query"]`
(chips, open series, revealed pages, typed search; per tab).

The Library groups stories with no new `library.json` field: series come from `series` and
`seriesOrder`; the second level (traditions) comes from `lore[].tradition` through
`lore[].stories`, and the Tradition select simply does not appear for a world without lore.

## 5. Front matter additions

Story: optional `lore: <slug>`, optional `parts: [{title, start}]`; existing
`audioUrl` and `audioDuration`. Lore entry: `title`, `tradition`, `summary`,
optional `link`, `stories[]`. World config (`content-sources.json`): `name`, `title`,
`tagline`, `accent`, `icon`, optional `lorePath`.

## 6. Fixtures

`test/fixtures/`: `story-page.html`, `library-page.html`, `library.json`,
`progress-v1.json`, `progress-v2.json`, `silent.mp3` (about 0.26s). All text is invented
placeholder text. One fixture title contains HTML on purpose, to test escaping.

## 7. Base path

`<html data-base="/Stories">`. All client code reads it. No hard-coded `/Stories` in client code.

## 8. Shell (WP-D)

`base.njk` renders `<main id="view">`, then one `<audio id="player" data-role="shell-audio">`
(with `data-slug` and `src` on a story page that has audio) and the dock, all
outside `#view`. The router replaces only `#view`: it calls `unmountAll(view)`, swaps
sanitised markup, then `mountAll(view)`, so every module inside `#view` must unmount
cleanly and mount again on fresh markup. The dock lives outside `#view` and is mounted
once. The audio element keeps `id="player"` and `data-role="shell-audio"` for good, and
holds whichever story was started last, which need not be the page's own. **Ownership is
the slug, not an id:** a page module (story-resume, parts) finds the audio through
`site/assets/js/shell-audio.mjs` and may drive or save from it only while
`audio.dataset.slug` equals its own slug, checked again on every event; it picks the
audio up on its own once a Play button or the player loads its story. Its Resume and Start
over buttons play (seek and play while the audio holds the story, else a `stories:play`
request the player answers), and the story page's Play button is Pause while that story plays. Play buttons and the story article carry
`data-slug` and `data-audio-url` (the player reads the audio URL from them; it is not in
`library.json`). While the player swaps the source it sets `audio.dataset.settling = "1"`
(removed on `loadedmetadata`); the element reads 0:00 then, so no module saves a position
from it (`isSettling` in `shell-audio.mjs`). Modules move between pages with `nav.open(url)`
(through the router while it runs, so audio keeps playing), never `nav.go`, which is the
full-load fallback. A draft story (`draft: true`) has no page, no library entry and no
prev/next link. Kill switch: `<html data-router="off">`, `localStorage["stories-router"]="off"`,
or `?router=off` / `?router=on`. Details: `site/assets/js/README.md`.

**Build id.** `<meta name="build-id">`, the `?v=` on CSS and `main.js`, and the import map
(so also its CSP hash) all carry one build id: the first 12 hex characters of a SHA-256
over the build inputs (`scripts/build-id.mjs`: stories, lore, `site/`, build scripts,
`content-sources.json`, the Eleventy config, the lockfile). It is deterministic: identical
inputs give the same id, so the nightly build with no change keeps it, and any change to
stories, templates, modules or CSS changes it. A router fetch that sees a different id
forces one full page load (which restarts the audio); that is acceptable only because the id
no longer moves without a deploy.

## Test conventions

jsdom is opt-in per file: `// @vitest-environment jsdom` on the first line. The global
Vitest environment stays `node`.
