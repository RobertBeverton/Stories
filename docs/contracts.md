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
  `publishDate` (`YYYY-MM-DD…`), optional `parts[]` of `{title, start}` (seconds).
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

## 3. DOM hooks

Behaviour attaches through `data-mount="<name>"`. Names: `continue`, `played-lately`,
`story-resume`, `search`, `play-button`, `filters`, `world-switcher`, `text-size`, `lore`, `parts`, `dock`.
Each name maps to `site/assets/js/<name>.mjs`, which exports `mount(el)` and returns
`unmount()`. `site/assets/js/main.js` mounts them. Templates (WP-B) emit the
attributes; modules implement them. CSS class names are WP-B's private business.
Per-element data uses `data-slug` (the flat slug).

## 4. Events

On `document`: `stories:play` `{slug}`, `stories:progress` `{slug}`, `stories:world` `{world}`
(`CustomEvent`, payload in `detail`).

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

## Test conventions

jsdom is opt-in per file: `// @vitest-environment jsdom` on the first line. The global
Vitest environment stays `node`.
