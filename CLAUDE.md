# Stories

The app for Felix & Alex's stories: static 11ty site and the narration
tool, deployed to GitHub Pages at https://robertbeverton.github.io/Stories/
(path prefix `/Stories`, set in `scripts/stories-lib.mjs` and
`eleventy.config.js`).

**This repo has no stories.** `npm run fetch-content` pulls them from the world
repos in `content-sources.json` (`../isles-of-yum`, `../bramble-wall`) into a
gitignored `stories/` folder. Never commit story text or mp3s here. Writing,
canon and process live in each world repo, under its own CLAUDE.md. Keep world
canon out of this repo's docs.

Worlds are merged flat into `stories/` on purpose. Slugs key reading progress
in localStorage (`story-progress:<slug>`) across the whole
robertbeverton.github.io origin, so changing a story's path or filename resets
progress. Don't nest by world without migrating those keys.

`git log` and `docs/plans/` record UI problems already solved, from both the
original Stories site and the isles-of-yum redesigns. Check them before
re-solving something.

Node 24 (`.nvmrc`; `nvm install 24 && nvm use 24`). CI reads the same file, and the AWS SDK used
by `upload-audio` stops supporting Node 20 in 2027.

```bash
npm install
npm run serve      # fetch content + dev server
npx vitest run     # tests
npm run build      # full build into _site/
```

## App layout and contracts

The redesign (`docs/plans/2026-11-03-stories-app-redesign-design.md`, built per
`...-implementation.md`) is multi-page 11ty plus small ES modules. A router keeps one persistent `<audio>` and the dock alive across
navigation (`site/assets/js/{router,dock,player,sleep-timer,shell-audio}.mjs`; rules in
`docs/contracts.md` section 8 and `site/assets/js/README.md`). The build id is a content hash,
so a nightly rebuild with no changes never forces a reload. `npm run test:e2e` (Playwright,
Chromium) is the smoke test, and the deploy job in `build.yml` needs it.

- **Contracts** live in `docs/contracts.md` and are machine-checked
  (`scripts/schema/`, `test/contracts.test.mjs`, fixtures in `test/fixtures/`). Change
  the contract first, then the code. Packages that need a contract change stop and report.
- **`library.json`** is emitted by `site/library.json.11ty.js` from `scripts/world-data.mjs`
  and validated against `scripts/schema/library.schema.json`. Title, URL and art are
  always read from it, never from localStorage. Progress records are v2
  (`{v, audioTime, scrollY, playing, savedAt, completedAt?}`) and never store them.
- **Page behaviour** is `site/assets/js/<name>.mjs` modules exporting `mount(el)`/`unmount`,
  attached by `data-mount="<name>"` via `main.js`. `site/assets/js/README.md` lists the markup
  each expects. No raw `innerHTML` with story, library or storage data (use `textContent`
  or `escape.mjs`). Client code reads the base path from `<html data-base>`, never `/Stories`.
- **Styles** are `site/assets/css/` (Hearth tokens, dark only). `scripts/check-token-contrast.mjs`
  enforces 4.5:1 text and 3:1 non-text. System fonts only, no external requests.
- **Worlds** are configured in `content-sources.json` (`title`, `tagline`, `accent` = a
  `PALETTE` name, `icon`, optional `lorePath`). `fetch-content` writes `stories/.worlds.json`
  (story path -> world) and copies lore into `lore/<world>/` (gitignored). Lore text and
  `parts` live in the world repos. World-data problems (bad `parts`, dangling lore slugs, bad
  `audioUrl`) warn and drop that data; only structural errors fail the build.
  `node scripts/validate-world-data.mjs --strict --world <name>` is the check for a world
  repo's own CI.
- **Security**: base.njk sets a CSP meta (scripts `self` plus the import-map hash, audio from
  `scripts/audio-origin.mjs`), `noindex` and ships `robots.txt`. Modules are cache-busted by a
  build-generated import map (`site/_data/importMap.js`). Add no inline scripts or handlers.
- **Offline**: `sw.js` (emitted by `site/sw.js.11ty.js`, logic in `site/assets/js/sw-logic.mjs`) caches the
  shell (`shell-<buildId>`) and serves saved mp3s from `audio-v1` with Range support; `offline.mjs` is the
  store (index in localStorage `stories-offline`), the Offline page and the story page button sit on top.
  Rules in `docs/contracts.md` section 9, design in `docs/plans/2026-11-12-offline-listening-design.md`.
  `?sw=off` (and `?sw=on`) is the kill switch. The audio host needs the CORS rule in `docs/audio-hosting.md`.
  Do not deploy a build with a precache entry that 404s: the worker's install fails and offline silently
  never turns on. The e2e test covers saving and playing offline; the tablet steps are in
  `docs/offline-device-checklist.md`.
- **Audio**: a story's front matter `audioUrl` (https, on the audio origin) wins over a
  sibling mp3. See `docs/audio-hosting.md`.
- **Narrator**: `narrator/` is the only narration code; world repos keep just `narration/`
  settings (respellings, voice). `npm run narrate -- <story.md>` writes the mp3 to the
  git-ignored `narrator/out/` and `parts`/`audioDuration` into the story; `npm run upload-audio`
  hosts it. See `narrator/README.md`. Never run narration in CI.

```bash
npx vitest run               # unit, template and jsdom integration tests
npm run build                # fetch, validate, contrast checks, icons, 11ty
```

Agent worktrees: do not run `fetch-content` inside a worktree (`../` sources resolve wrongly);
copy `stories/` from the main checkout. Worktrees under `.claude/worktrees/` are ignored by git and vitest.
