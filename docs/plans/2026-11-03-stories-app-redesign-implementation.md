# Stories app redesign: implementation plan

Date: 2026-11-03. Implements [2026-11-03-stories-app-redesign-design.md](2026-11-03-stories-app-redesign-design.md) (revision 4). Read that first: it holds every decision and the reasons.

## How the work is split

Most of this is new code in new files, so it can be built in parallel. The real conflict points are a handful of shared files. The plan removes them by:

1. **Scaffold first (serial, lead).** One person lands every shared-file edit and every contract up front.
2. **Wave 1 (parallel).** Packages with disjoint file ownership, each in its own git worktree and branch.
3. **Integrate.** The lead merges wave 1, runs the whole suite, and only then starts wave 2.
4. **Wave 2 (parallel).** Packages that depend on wave 1 output.
5. **Docs last (serial, lead).**

Why this is safe: a package only edits files it owns. Anything shared (`base.njk`, `package.json`, `eleventy.config.js`, `CLAUDE.md`, the build chain, `content-sources.json` schema) is edited by the scaffold or the lead, never by a package.

## Shared files (lead-only)

| File | Why shared | Handled by |
|---|---|---|
| `package.json` (deps, build chain) | Every package may need a script or dep | Scaffold adds jsdom, a `test:e2e` placeholder and the `validate-world-data` build step |
| `eleventy.config.js` | Passthrough for new assets and `library.json` | Scaffold adds `site/assets/**`, `site/library.json.11ty.js` and lore passthroughs |
| `site/_includes/base.njk` | Head tags, one `<script type=module src=js/main.js>`, dock slot | Scaffold writes the skeleton with named slots. WP-B fills styling and markup inside it |
| `CLAUDE.md`, `README.md` | Project-wide | Lead, at the end |
| `docs/contracts.md` | The written contract | Scaffold creates it, the lead amends it |

## Contracts (scaffold output)

Written once, checked by code, imported by every package's tests.

1. **`library.json` schema** (`scripts/schema/library.schema.json`): `stories[]` with `slug`, `title`, `world`, `series`, `seriesOrder`, `durationSec`, `tags`, `url`, `icon`, `publishDate`, optional `parts[]`; `worlds[]` with `name`, `title`, `tagline`, `accent`, `icon`, `hasLore`; `lore[]` with `world`, `slug`, `title`, `tradition`, `summary`, `link?`, `stories[]`, `url`.
2. **Progress record v2** (`site/assets/js/progress.mjs` exports `readAll`, `read`, `write`, `markCompleted`, `toViewModel`) keyed `story-progress:<slug>`, shape `{ v: 2, audioTime, scrollY, playing, savedAt, completedAt? }`. Version 1 records (with `url`, `title`, `artworkUrl`) are still read and rewritten as v2. The scaffold writes the interface and tests with the fixtures. WP-A implements it.
3. **DOM hooks.** Page behaviour is attached by `data-mount="<name>"` attributes. Names: `continue`, `played-lately`, `story-resume`, `search`, `play-button`, `filters`, `world-switcher`, `parts`, `dock`. Every module exports `mount(el)` and returns an `unmount()` function. Templates (WP-B) emit the attributes, modules (WP-A and later) implement them. Selector classes are WP-B's private business.
4. **Events.** Custom events on `document`: `stories:play` `{slug}`, `stories:progress` `{slug}`, `stories:world` `{world}`.
5. **Front matter additions.** Story: optional `lore: <slug>`, optional `parts: [{title, start}]`, existing `audioUrl`, `audioDuration`. Lore entry: `title`, `tradition`, `summary`, optional `link`, `stories[]`. World config: see the design doc.
6. **Fixtures** in `test/fixtures/`: a story page HTML, a library page HTML, a `library.json`, progress records v1 and v2, a tiny silent mp3.
7. **Base path:** `<html data-base="/Stories">`. All client code reads it. No hard-coded `/Stories`.

## Wave 0: scaffold (lead, serial)

Branch `feature/app-redesign`. Do in order:

1. Run `npm ci`, then `npm run fetch-content` once in the main checkout so `stories/` exists (it does not exist today; the world repos are siblings at `../isles-of-yum` and `../bramble-wall`). First add the Gods world to `content-sources.json` (repo `https://github.com/RobertBeverton/Stories_Gods.git`, `localPath` `../Gods-PrimarySchool`, `name` `staff-room-gods` unless the user chose another), so `stories/` includes it.
2. Add jsdom (dev dependency) and per-file `// @vitest-environment jsdom` usage. Do not change the global Vitest environment.
3. Write `docs/contracts.md`, the JSON Schema, the progress interface with failing tests, and the fixtures.
4. Write the `base.njk` skeleton with named slots and `data-base`, the `main.js` entry that imports page modules by `data-mount`, and the Eleventy passthroughs.
5. Add the build-chain placeholder for `validate-world-data` (a no-op script until WP-C fills it).
6. Commit. Every worktree branches from this commit.

Acceptance: `npx vitest run` passes (new tests are for contracts only), `npx @11ty/eleventy` builds, `git status` clean.

## Wave 1 packages (parallel)

Each runs in its own worktree on branch `wp/<name>`. Each must run `npm ci` in the worktree and copy `stories/` from the main checkout, because `content-sources.json` uses `../isles-of-yum`, which resolves wrongly from inside a worktree. Do not run `npm run fetch-content` in a worktree.

### WP-A: page modules and progress (JS)

Owns: `site/assets/js/**` (except `router`, `dock`, `player`, `sleep-timer`, `parts`, `lore`, which are wave 2), `test/js/**`. Deletes the old `site/assets/{library,resume,search,play-button,mini-player}.js` once replaced.

Build: `progress.mjs` per contract; `escape.mjs`; modules `continue` (most recent unfinished), `played-lately` (three most recent, finished or not), `story-resume` (replaces `resume.js`, no `document.currentScript`), `search`, `play-button`, `filters` (world, series, under 15 minutes, in progress, finished, new), a minimal in-page mini-player replacement; `main.js` mounting by `data-mount`; completed rules from the design doc (use `audio.duration`, `ended`, foreground reconciliation); `markCompleted` and replay behaviour.

Rules: no raw `innerHTML` with story or storage data; derive title, URL and art from `library.json`, never from storage; v1 records still readable.

Acceptance: `npx vitest run test/js` passes using the shared fixtures, including v1 reads, replay, completed, escape cases; no file outside the owned list changed (`git diff --stat` shows it).

### WP-B: restyle (CSS and templates)

Owns: `site/assets/css/**` (new), `site/_includes/{story,arc-group,dock-static}.njk`, `site/index.njk`, the body of `base.njk` between its slots, and the contrast scripts and their tests. Replaces `site/assets/style.css`.

Build: Hearth tokens (`tokens.css`); components for home, library rows, story, dock (static, no player), player sheet styles; 44px and 56px targets; `:focus-visible`; `prefers-reduced-motion`; text-size control markup; `data-mount` hooks per the contract; remove the Google Fonts request; `viewport-fit=cover`, safe-area insets, `noindex` meta, `build-id` meta; large covers. Update the contrast scripts so the new tokens (3:1 non-text, 4.5:1 text, accent fills) are checked.

Acceptance: `npx @11ty/eleventy` builds; every contrast script passes; templates contain the hooks the contract lists (a test greps rendered output against the hook list); manual screenshot of Home, Library and Story at 390px and 1280px attached to the report.

### WP-C: data and validation

Owns: `scripts/fetch-content.mjs`, `scripts/stories-lib.mjs`, `scripts/validate-content.mjs`, new `scripts/validate-world-data.mjs`, `scripts/accent-colors.mjs`, `content-sources.json` (schema additions only), `site/_data/**`, `site/library.json.11ty.js`, `scripts/**/*.test.mjs`.

Build: world manifest `stories/.worlds.json`; `lorePath` and namespaced `lore/<world>/`; world accent as a palette name (validated); `library.json` emitted per the schema; severity table from the design doc (structural errors fail, world-data problems warn and drop the offending data); keep `checkDuplicateSlugs` and `findCollisions` behaviour.

Acceptance: `npx vitest run scripts` passes; `library.json` validates against the schema for the real merged content (`isles-of-yum` and `bramble-wall`); an injected lore typo yields a warning for that world and the build still succeeds.

### WP-F: narrator (other repo, `D:\GitHub\Gods-PrimarySchool`)

Owns: `audio-pipeline/narrate-single-voice.mjs`, its test, `audio-pipeline/README.md`. Edits nothing else.

It is the local checkout of `RobertBeverton/Stories_Gods` (baseline `cbc1ff8` on `main`). Work on a branch `wp/narrator-parts` there and do not push. No ElevenLabs calls: the API key and billing are the user's, so this package implements and tests with `--dry-run` and mocked responses only.

Build: use character-level alignment (verify the API shape from ElevenLabs documentation, and report any mismatch) to compute each `## Part` heading's start time, write `parts: [{title, start}]` and `audioDuration` into front matter, save the raw alignment next to the audio (gitignored), and keep existing behaviour (pronunciations, cache, ffmpeg concat).

Acceptance: `npx vitest run` in that repo passes; a mocked-alignment test proves part starts and ordering; documented user step for the real spike run.

### WP-G: CI

Owns: `.github/workflows/build.yml` and a new `.github/workflows/smoke.yml` stub.

Build: supported Node LTS, a nightly `schedule`, keep `workflow_dispatch` and `repository_dispatch`, and a documented `workflow_dispatch` trigger recipe for world repos (a small workflow file text and the token permission needed, written into `docs/` as a how-to, not installed). The smoke workflow is a stub that wave 2 fills.

Acceptance: workflow YAML is valid (`actionlint` if available), and the build job is unchanged apart from Node and triggers.

### WP-S: spike page (human-run)

Owns: `site/spikes/audio-spike.html` and `docs/spikes/audio-spike.md`.

Build a self-contained page with a silent or short audio track, Media Session handlers, a log written to localStorage and shown on screen, and timestamped checks for: `timeupdate` while locked, `ended` while locked, a 60-second `setTimeout` while locked, previous and next handlers, and behaviour after pause for 30 seconds. The document gives the user the exact test script for Safari and an installed icon on each device, and a table to record results.

The spike runs from the deployed Pages site (lock-screen controls need a secure context), so the user merges this one package to `main` early.

Acceptance: page loads with no external requests; instructions are unambiguous.

## Integration gate (lead, after wave 1)

1. Merge the branches in this order: scaffold, WP-C, WP-A, WP-B, WP-G (WP-F is another repo; WP-S merges whenever).
2. `npm ci`, `npm run build`, `npx vitest run` all pass.
3. Write one integration test that renders WP-B's templates, mounts WP-A's modules in jsdom, and asserts every `data-mount` hook resolves. Fix mismatches at the contract.
4. Manual look at Home, Library, Story.

This is the step that makes parallel work trustworthy. Do not skip it.

## Gate: spike results (human)

The user runs WP-S on their phone and tablet and reports the results. The router (WP-D) starts only on a pass. On a fail, WP-D is replaced by "player on the story page", and the design doc is amended.

## Wave 2 packages (parallel)

### WP-D: shell (only if the spike passed)

Owns: `site/assets/js/{router,dock,player,sleep-timer}.mjs`, `site/_includes/dock.njk`, `test/js/router*.test.mjs`, `test/e2e/**`, `.github/workflows/smoke.yml`.

Build per the design doc: router with sanitising, build-id check with once-per-navigation loop guard, scroll restoration ownership, focus management, kill switch; persistent `<audio>` and dock; player sheet; Media Session; sleep timer designed from the spike results; Playwright smoke test.

Acceptance: router tests pass in jsdom including build-id mismatch and loop guard; the smoke test passes in CI; kill switch verified by a test that disables the router and asserts normal navigation.

### WP-E: lore and parts UI

Owns: `site/lore.njk`, `site/_includes/{lore-entry,part-list}.njk`, `site/assets/js/{parts,lore}.mjs`, `site/assets/css/lore.css`, `test/js/parts*.test.mjs`.

Build: Lore segment and entries (only when the current world has entries), "For grown-ups" link section, story-to-lore links both ways, part list and highlighting driven by the audio clock, tap to jump.

Acceptance: tests with fixture `library.json` containing lore and parts; no Lore segment when a world has no entries; part highlight follows a simulated `timeupdate`.

## Final (lead)

Update `CLAUDE.md` (project description, the new contracts and file layout, the world-repo content contract, how to run the tests and smoke check), `README.md`, and amend the design doc with anything learned. Run a final adversarial review of the merged branch with the `adversarial-review` skill, using the code instead of the plan.

## Parallelism, honestly

| Wave | Packages | Can run at once | Why not more |
|---|---|---|---|
| 0 | scaffold | no (serial) | It creates the shared files everything else depends on. |
| 1 | A, B, C, F, G, S | yes, 6 | Disjoint files. Limit to 4 to 5 live agents at a time to keep worktree installs and review manageable. |
| gate | spike results | human | Needs real devices. |
| 2 | D, E | yes, 2 | D and E are separate files, but both read wave 1 output. |
| final | docs, final review | no | `CLAUDE.md` and the integration view are shared. |

What this plan cannot parallelise: scaffold, integration, device spikes, the real narration run and the lore text itself. The risk that remains is semantic mismatch between A and B (hooks), which the contract and the integration test are there to catch.
