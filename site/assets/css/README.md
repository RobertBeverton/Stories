# CSS (WP-B)

Hearth, dark only. System fonts and Georgia, no network requests. Linked from
`base.njk` in this order: `tokens.css`, `base.css`, `dock.css`, `pages.css`,
`player.css`. Contrast for `tokens.css` is enforced by
`scripts/check-token-contrast.mjs` (text 4.5:1, non-text 3:1, every PALETTE accent).

Templates emit only the `data-mount` roots from `docs/contracts.md` (with
`data-slug` where relevant) plus the no-JS fallback content below. Modules build
their own inner DOM and can reuse these classes.

## Custom properties (tokens.css)

- Surfaces and text: `--bg --surface --raised --text --muted --line --focus`, plus `--line-soft` for
  card edges and dividers only (decorative, not contrast-checked; controls and seek tracks use `--line`).
  The look follows the owner's Hearth prototype: green-tinted dark surfaces (`--bg` #101411), lime
  default accent (#c4ed8e), serif display headings, soft radial/linear gradients on hero, cover and lore cards.
- World accent (UI chrome, a fill with dark ink): `--accent --accent-ink`.
  Defaults to a PALETTE entry. On `stories:world`, set both on `<html>` from the
  world's PALETTE entry (`background`, `text`).
- Series accent (story header and cover only): `--series --series-ink`, set inline on
  the element (see `cover.njk`).
- Targets: `--tap` 44px, `--tap-lg` 56px. Reading size: `--reading-scale`.

## Mount roots and what each expects

| Hook | Where | Root emitted | Fallback content | Classes available to the module |
|---|---|---|---|---|
| `dock` | every page | `<div class="dock" data-mount="dock">` containing `.dock-mini[data-dock-slot="mini"]` (empty) and the real Home and Library links | the links themselves | In `.dock-mini`: `.dock-mini-title` plus `.btn.btn-icon` buttons. Add `has-mini-player` to `<body>` while the row is shown |
| `continue` | Home | `<div data-mount="continue">` | `<a class="card-continue" data-slug>` with `.cover`, `.card-continue-label`, `.card-continue-title`, `.btn.btn-primary.btn-lg` for the newest story | Same classes. Replace the fallback |
| `played-lately` | Home | `<div class="lately-root" data-mount="played-lately">`, empty | none. The section hides itself while the root is `:empty` | `ul.lately > li > a.lately-item` with `.cover` and `.lately-title`. Three items |
| `world-switcher` | Home and Library | `<div data-mount="world-switcher" data-variant="picker\|filter">` | Home: a link tile to `/library/`. Library: empty | Picker: `.world-tile` (a link or `button`, `aria-pressed` or `aria-current` for the selected one, `--tile` and `--tile-ink` set inline from the world's PALETTE entry). Filter: `.btn` buttons with `aria-pressed` |
| `search` | Library | `<input type="search" id="search-box" class="search-box" data-mount="search">` | the input | Rows have `data-title`, `data-description`, `data-tags`, `data-series` |
| `filters` | Library | `<div class="filters" data-mount="filters" role="group">`, empty | none (hides while `:empty`) | `.btn` with `aria-pressed` |
| `play-button` | Library rows, Story | `<button type="button" class="btn btn-primary" data-mount="play-button" data-slug data-audio-url>` | the button (a play icon in rows, icon and "Play" text on Story) | For states set `aria-label` or the `<span>` text, e.g. "Pause", "Play again" |
| `story-resume` | Story | `<article class="story" data-mount="story-resume" data-slug>` | the story | Resume prompt: `.resume-prompt` |
| `parts` | Story | `<div class="parts-root" data-mount="parts" data-slug>`, empty (hides while `:empty`) | none | `ul.parts-list > li > button.btn`, current one `aria-current="true"`. Highlight text with `.part-current` |

Library page extras: `ul#stories.rows` of `li.row` carrying `data-slug`,
`data-title`, `data-series`, `data-tags`, `data-description`,
`data-published` (YYYY-MM-DD) and `data-duration` (seconds, may be empty);
`p#library-status[role=status]` for result counts; `p#no-results[hidden]` for the
empty state. A row shows its `.badge-new` only when the filters module sets
`data-new="true"` on the row.

## Player sheet (player.css)

Emitted by the player module, not the templates: `.player-sheet` (set
`data-open` for the entrance animation, `hidden` to close), `.player-close`,
`.player-cover.cover`, `.player-title`, `.player-world`, `.player-seek` with a
native `input[type=range]` and `.player-time`, `.player-controls` with
`.player-play`, `.player-options`, `.player-error`.

## Text size

`fieldset.textsize[data-mount="text-size"]` on the story page is three real radios
(`#ts-sm`, `#ts-md`, `#ts-lg`). The size works with CSS only
(`.story:has(#ts-lg:checked)` sets `--reading-scale`); the `text-size` module
only remembers the choice.

## Module output

Modules emit these classes (plus their `data-role` hooks): `card-continue`,
`card-continue-text`, `card-continue-label`, `card-continue-title`,
`card-continue-bar` (a `<progress>`), `lately`, `lately-item`, `lately-title`,
`lately-state`, `cover` (svg from the shared icon set, series colours inline),
`world-tiles` / `world-tile` (Home picker, `--tile`/`--tile-ink` inline),
`world-chips` (Library filter), `filter-chips`, `filter-select`, `btn`,
`resume-prompt` (the story page template provides it, outside the coloured
hero), `resume-note`. The group wrapper a module builds is the grid or flex
container, not the mount root.
