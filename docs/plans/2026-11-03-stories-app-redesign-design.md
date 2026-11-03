# Stories app redesign, lore and part sync

Date: 2026-11-03 (revision 4, after adversarial review rounds 1 to 3)

## Background

A ChatGPT-built prototype (`story-app-directions.html`, three "directions") proposed a redesign of the Stories app now that it serves several story worlds. It was assessed against what GitHub Pages and the real content can support. Outcome: keep the Hearth visual language and a few ideas, rebuild the structure.

Findings that drive this design:

- The prototype is a single in-memory page, with no URLs, back button or deep links. The real site is a multi-page 11ty build.
- "Playback continues while you browse" is impossible today. A full page load stops the `<audio>` element. `mini-player.js` fakes persistence through localStorage and, on a page that is not the playing story, only writes a flag and controls nothing.
- Prototype data was invented. The real worlds are `isles-of-yum` (10 stories), `bramble-wall` (10) and `Gods-PrimarySchool` (19, "The Staff Room Gods", not yet in `content-sources.json`). Gods stories do have `## Part N. Title` headings and a `gods:` field.
- Accessibility gaps: 10 to 11px text, tap targets under 44px, borders and seek tracks at about 1.8:1 contrast (3:1 needed), div-based controls, no focus styles, no reduced-motion support.
- Existing scripts interpolate localStorage values into `innerHTML` unescaped, and store `url`, `title` and `artworkUrl` (with the `/Stories/` prefix) in each progress record. localStorage is shared across the whole `robertbeverton.github.io` origin.
- iOS home-screen (standalone) web apps have long-standing reports of audio and Media Session problems when the app is in the background. Not confirmed on current iOS, so it is a spike.

## Decisions

| Question | Decision |
|---|---|
| Hosting | **Stay on GitHub Pages at the current URL for now.** A custom domain (suggested `stories.kinly.download`) is optional and deferred until after step 3 (see Custom domain). |
| Visibility | Public, unlisted: `noindex` meta, `robots.txt`, no sitemap. `noindex` is a request, not a lock. Cloudflare Access is the upgrade path. |
| Progress | Per device, in localStorage. No accounts or sync. Records store the slug and playback state only. |
| Audio while browsing | Yes, via a persistent shell over real pages, **gated on a device spike** (step 0). Multi-page is a first-class result if the spike fails. |
| Direction | Hearth (dark, calm), dark only for v1. Tokens are structured so a light set can be added later. |
| Worlds | A world switcher and per-world accent, chosen from the existing vetted palette. |
| Lore | In scope, owned by each world repo. Launches hidden until a world has entries. External links tucked away. |
| Reader sync | Part-level now. Sentence-level deferred and opt-in. |
| Offline | Explicit non-goal for v1. Streaming only. |
| Fonts | System and Georgia only. Drop the Google Fonts request. |
| Rebuilds | A nightly scheduled build plus manual dispatch. No cross-repo token. |
| Stopping point | Step 3 is a legitimate finished product. Later steps are optional. |

## 1. Shell architecture

**Fixed chrome is one dock, not two bars.** A single fixed container at the bottom holds an optional mini-player row above a two-item nav (Home, Library). It uses `env(safe-area-inset-bottom)` and `viewport-fit=cover`, is capped at about 112px, and becomes non-fixed when the viewport is under 480px tall (landscape) or zoomed to 200%, so it never covers content. "Playing" is not a tab: tapping the mini-player opens the player sheet.

**Layout.** Every page is built from one base layout:

1. `<main id="view">`, the only region the router replaces.
2. `<audio id="player">` and the dock, outside `#view` so they survive navigation.

**Router** (only if spike 0a passes). One small vanilla module, no framework. It:

- intercepts same-origin link clicks, ignoring modifier keys, `target` and `download`
- fetches the target HTML, parses it with `DOMParser`, removes every `script` element and `on*` attribute before inserting, and never executes fetched scripts
- swaps `#view`, `<title>` and the active nav state
- uses `history.pushState` and handles `popstate`, and **owns scroll restoration** on Back and Forward (the reading position saved in progress is applied only on first load of a story)
- moves focus to the new `h1`; the live region announces page changes and user-triggered actions only, never part changes during playback
- falls back to a normal navigation on any failure
- compares a `<meta name="build-id">` in each fetched page with the running one, and does a full navigation on mismatch, **at most once per navigation** so a mixed-version CDN cannot cause a reload loop
- has a **kill switch**: a build flag and a localStorage flag each disable it, leaving the plain multi-page site fully working

**Page scripts are rewritten, not retrofitted.** Today's scripts (`resume.js` uses `document.currentScript.dataset.slug`; others run at top level) won't re-run in a swapped page. Each becomes an ES module exporting `mount(root)` and `unmount()`, driven by data attributes. This is a rewrite of every page script and is estimated as one. The rewrite happens before the router exists, so the multi-page site benefits either way.

**Player.** Media Session handlers are set once on the persistent `<audio>`. Previous and next load a new source into the same element. The audio source is each story's `audioUrl`, which the narrator writes (see [docs/audio-hosting.md](../audio-hosting.md)). Behaviour that depends on JavaScript running while the screen is locked (next and previous, `ended`, sleep timer, progress saving) is designed from the spike's results, not assumed.

**Asset URLs.** Filenames stay stable with `?v=<buildTime>` as today. Content-hashed filenames are not used: Pages replaces the whole site each deploy, so hashed files cached HTML points at would 404, and Pages cannot send immutable headers anyway. All client code takes its base path from one place (a `data-base` attribute on `<html>`), so a later domain move is a one-line change.

## 2. Data and worlds

**World tag.** Worlds are still merged flat into `stories/` and slugs still key progress (`story-progress:<slug>`), as CLAUDE.md requires. `fetch-content` records each story's `world` (the source `name`) at fetch time, since the folders are flattened and the value cannot be inferred later. It writes a gitignored manifest, `stories/.worlds.json`, mapping each flat story path to its world, so the story files themselves are never modified. Duplicate slugs are already rejected by `checkDuplicateSlugs` in [validate-content.mjs](../../scripts/validate-content.mjs).

**World config.** Presentation details sit with each source in `content-sources.json`:

```json
{ "name": "isles-of-yum", "title": "Isles of Yum",
  "tagline": "...", "accent": "sage", "icon": "..." }
```

`accent` is the **name of an entry in the existing vetted `PALETTE`** ([accent-colors.mjs](../../scripts/accent-colors.mjs)), not a free hex, so contrast is already guaranteed (dark ink on pastel fill). Precedence: the world accent styles UI chrome (active nav, primary buttons, filters); the series accent styles a story's header and cover only. An unknown accent name fails the build. These values carry no canon.

**Library index.** The build emits `library.json` with slug, title, world, series, order, duration, tags, URL, icon and publish date per story. Search, filters, Continue and "Played lately" use it, so no page needs titles or URLs stored in progress.

**Progress records.** Schema version 2: `{ v: 2, audioTime, scrollY, playing, savedAt, completedAt? }` keyed by slug. Version 1 records (with `url`, `title`, `artworkUrl`) are still read, ignoring those fields, and are rewritten as version 2 on next save.

**Filters** (all derivable today): world, series, under 15 minutes, in progress, finished and new.

**Output hardening.** All titles and values are escaped before writing to the page, via `textContent` or an escape helper, never raw `innerHTML`. This also fixes `resume.js`, `library.js` and `mini-player.js`.

## 3. Visual design, screens and states

**Tokens.** One full palette on `:root`: surface, raised surface, text, muted text, accent, line. Borders and tracks at least 3:1 against the background. `theme-color` matches the surface. Accent is used as a fill with dark text.

**"Current world".** The Library's world filter. It defaults to all worlds, and is remembered per device. The Lore segment appears only while the filter is a single world that has lore entries.

**Screens.**

1. **Home.** Picture-first. A large Continue card (the most recent unfinished story), a three-picture "Played lately" row (finished or not, so a replayed favourite never disappears), then the world picker as big pictures. No "Recently added" list: Library sorts newest first with a New marker. With no history, the card shows the newest story.
2. **Library.** Search, filters and compact rows, newest first. Each title is a link, play is a separate button. A "Stories | Lore" segmented control sits at the top when the current world has lore.
3. **Story.** Cover, metadata, a play button that drives the persistent player, the text and next story. The reader has A− and A+ text size, a measure of about 65 characters and generous line height.
4. **Player.** A full-screen sheet from the mini-player: native seek slider, plus or minus 15 seconds, speed, sleep timer and, when parts exist, the part list.
5. **Lore.** See below.

**States the prototype skipped.**

- **End of story.** The audio stops. It never autoplays the next story. The Continue card and story row switch to "Play again", and a "Next story" link is offered.
- **Finished.** `completedAt` is set on `ended`, and on the next foreground if playback reached within about 10 seconds of the actual `audio.duration` (not the front-matter value, which can be wrong). Playing a finished story from the start keeps `completedAt` but resets `audioTime`; it counts as in progress again only once playback passes 10 seconds. Continue skips finished stories, and "Played lately" does not.
- **New.** A story published in the last 14 days with no progress gets a New marker.
- **Empty and error.** No-history Home, no search results, audio failing to load (clear message and a retry), and no network.

**Child-first sizing.** Primary targets on Home and the player are at least 56px, and everything else at least 44px. The seek slider has a large thumb. Seek is not on the mini-player. Covers are large and carry meaning.

**Accessibility.** Body text at least 16px and UI labels at least 12px. Visible `:focus-visible` ring. Native `<input type="range">` for seek, with a time value as text. Nav is real links with `aria-current`. World switcher is keyboard-operable. `prefers-reduced-motion` honoured. One `h1` per page. Checked at 200% zoom.

**Dropped from the prototype:** phone frame and status bar, the three-direction picker, the lock-screen mockup, invented data, the light direction.

### Lore

World-owned, so canon stays out of this repo.

- A world repo may include `lore/` with one markdown file per entry. Front matter: `title`, `tradition`, `summary`, optional `link`, `stories` (list of slugs). Body is short text for curious listeners.
- A story's `gods:` field already names the figure. It gains an optional `lore:` slug for an exact match.
- `content-sources.json` gains an optional `lorePath` per source. `fetch-content` copies it into `lore/<world>/` (namespaced by world, unlike stories, because lore has no legacy progress keys to protect and two worlds may both have an `athena.md`). The build emits entries into `library.json`.
- The Lore segment lists the current world's entries grouped by tradition. Entries link to stories, and story pages link back. A world with no entries shows no Lore segment. Launching with only new stories covered is expected.
- **External links** appear only inside a closed "For grown-ups" section at the bottom of an entry, opening in a new tab with `rel="noopener noreferrer"`. They are never in the main reading flow.
- Lore text is written under the same care as the Story Bible, especially for living traditions.

### Reader sync

Two tiers.

1. **Part-level, in scope, but not a small narrator change.** The narrator packs scenes into chunks of up to 9,000 characters, so a story is a few chunks each containing many parts, and chunk durations do not give part starts. The narrator must instead get character-level alignment from the narration service (ElevenLabs offers a with-timestamps variant of text to speech, to be verified in a spike) and convert the character offset of each `## Part` heading, plus the chunk's start time, into a part start. The fallback is synthesising each part as its own request with previous-and-next-text stitching, which costs more calls and risks voice continuity. Either way it writes `parts: [{title, start}]` into front matter beside `audioDuration`. The reader highlights the current part, lets you tap a part to jump, and follows the audio clock at any speed. Re-narration rewrites `parts` and `audioDuration` together. Stories without `parts` show a plain reader.
2. **Sentence-level, deferred.** If the narrator captures character-level alignment for part starts, sentence timings are available almost for free, so the remaining cost is the reader UI and drift handling. The narrator should save the raw alignment beside the audio so this stays possible. If added later, it is an opt-in toggle, off by default.

### Validation severity

Data problems are scoped to the world that caused them, so one world's typo cannot block another world's release.

| Problem | Result |
|---|---|
| Duplicate slug, unknown world accent, malformed `library.json` | Build fails (structural). |
| `parts` count or order differs from the story's `## Part` headings, or a start beyond `audioDuration`; dangling `lore:` slug; bad lore front matter | The offending story's `parts`, or lore link, is dropped and the build prints a warning naming the world and file. The same checks run in each world repo's own CI, where they fail. |

## 4. Delivery, testing, rollout

**Rebuilds.** [build.yml](../../.github/workflows/build.yml) gains a nightly `schedule` trigger alongside the existing manual dispatch. GitHub disables scheduled workflows in a repository with no activity for 60 days, and the commits happen in the world repos, not here, so the nightly build can silently stop while you are busy writing stories. The primary trigger is therefore a small workflow in each world repo that, on push to `main`, calls this repo's `workflow_dispatch` using a fine-grained token with only Actions write access on this repo (it cannot push code; verify the permission when creating it). The nightly build is the backstop, and a quarterly check confirms both are alive. Token expiry goes on the operations calendar.

**Node.** CI moves off Node 20 to a currently supported LTS.

**Headers.** Pages controls none, so `noindex` and a CSP go in `<meta>` tags. Templates use inline `style="--accent-bg:..."`, so the CSP allows inline styles and protects scripts only.

**Audio and bucket.** Each story points at R2 with `audioUrl`, written by the narrator (as in docs/audio-hosting.md). If a custom domain is adopted, the bucket's CORS rules gain the new origin.

**Testing.**

- Vitest plus jsdom (or happy-dom) for page modules, the progress store (including version 1 reads), library index and filters, completed and new rules, the escape helper and, later, the router (link filtering, swap, history, focus, build-id mismatch and loop guard).
- **Contracts are machine-checked.** The scaffold owns a JSON Schema for `library.json`, a validator for the progress record, and shared fixtures (story page HTML, `library.json`, progress records of both versions). Every package's tests import them, so parallel work cannot drift from the written contract.
- A Playwright smoke test in CI (kept small): build, load a story, start a tiny silent mp3 fixture (Chromium with the autoplay-without-gesture flag), navigate, assert the same `<audio>` element survives and its `currentTime` keeps advancing. Playwright's WebKit is not iOS standalone, so it does not replace the device spike.
- Existing contrast scripts extended for the new tokens and the 3:1 non-text rule.
- A manual pass on the real devices for lock-screen controls, safe areas, screen-lock audio and the installed home-screen icon.

**Operations.** Calendar reminders for the R2 token expiry and for a quarterly check that the nightly build is still running. Local copies of every mp3 kept outside Cloudflare.

### Custom domain (optional, after step 3)

A custom domain on GitHub Pages gives a clean origin and no `/Stories` prefix. It gives listeners nothing visible, and once escaping and slug-only records land, the shared-origin risk is gone anyway. It costs a one-time progress reset (localStorage is per origin) and a re-add of home-screen icons. Whether GitHub redirects the old project URL to a custom domain is unconfirmed (sources disagree), so a handoff script on the old origin may or may not be possible. If progress migration matters, the fallback is to host the new domain on Cloudflare static hosting while the old Pages site stays on its origin for a final handoff release. Test the `.download` TLD on the family's devices and networks (some filters distrust it) before choosing it.

### Rollout order

Each step ships independently. Step 3 is a complete product.

0. **Spikes** (human, on real devices). (a) A static test page proves persistent audio, lock-screen controls, screen-lock playback, `timeupdate` and `ended` firing while locked, a sleep timer, and the Safari versus installed-icon difference. The result decides the router, the sleep-timer design, progress reconciliation and the manifest `display` value. (b) Confirm `audioUrl` from R2 plays and seeks end to end. (c) Narrator spike on one Gods story: verify the character-alignment API, produce `parts`, and check each start against the audio by ear.
1. **Foundation:** scaffold and contracts, escape helper and slug-only progress store, page scripts as modules, build-id meta, `noindex`, CI Node and nightly trigger.
2. **Restyle:** Hearth tokens, accessibility, the dock without the player, finished, new and end-of-story states, large targets, text-size control.
3. **Worlds and data:** world switcher, world accents, `library.json`, Home and Library from the index, scoped validators.
4. **Shell** (only if spike 0a passed): router, persistent player, sleep timer, player sheet. The kill switch ships with it.
5. **Lore and part sync:** world-repo changes, narrator `parts`, lore pages, part list and reader highlighting.
6. **Custom domain** (optional).

## Open items

- Add the Gods world to `content-sources.json`: repo `https://github.com/RobertBeverton/Stories_Gods.git`, local `../Gods-PrimarySchool`, `name` `legend-lane` (decided), display `title` "Legend Lane". The `name` keys the world manifest, library worlds and R2 folder, so it is fixed. The display `title` can change any time. The series itself is still "The Staff Room Gods" in story front matter.
- Gods stories have no mp3s yet. Part sync, `audioUrl` and the player need narrated audio to exercise.
- Decide the fate of the world repos' own 11ty sites (preview only, or retired).
- Cross-repo work (narrator `parts` output, `lore/` entries, `lore:` slugs) belongs in the world repos, each under its own CLAUDE.md.
- Decide whether the custom domain happens at all, and the subdomain name.
- Parallel delivery is described in [2026-11-03-stories-app-redesign-implementation.md](2026-11-03-stories-app-redesign-implementation.md).

## Implementation notes (added after wave 1 and the lore and parts work)

What building it taught us. Decisions above are unchanged.

- **Palette and icons are shared client and build code.** `accent-colors.mjs` and `icons.mjs` live in `site/assets/js/` with re-exports in `scripts/`, so the client draws covers and applies world accents from `library.json` names alone. No palette hex values are duplicated in CSS.
- **`parts` titles are compared to the `## Part` headings with emphasis markers ignored**, because the narrator strips them when recording titles.
- **A front matter `audioUrl` wins over a sibling mp3** when it is an https URL on the audio origin (`scripts/audio-origin.mjs`). Anything else is dropped with a warning.
- **Modules are cache-busted by a build-generated import map**, with its sha256 in the CSP, because only `main.js` carried `?v=` before. `library.json` is fetched with the page's build id.
- **A remembered world that no longer exists is treated as All** and cleared.
- **Text size** persists through a small `text-size` module (`stories-text-size`), and the Library Lore segment is the `lore` hook. Both were added to the contract.
- **Narrator finding (Stories_Gods):** `cleanForNarration` strips the `#` from headings before `parseScenes` runs, so the "split at headings" logic never fires and chunks split mid-part at sentence boundaries. Fixing it changes chunk text and invalidates the narration cache (it costs money), so it was left alone. Part timing does not depend on it.
- **Re-narrating an existing story re-bills the whole story** because old cache entries have no alignment and the request-id chain changes every later chunk's cache key.
- **Spike result (Pixel, Firefox 159 installed, plus desktop):** timers, `timeupdate`, `ended` and `play()` all keep working while locked, so the router and persistent player were built (WP-D). iOS is untested. On Firefox Android the lock-screen title does not update after next or previous; the player reassigns `MediaMetadata` after `playing` and the limitation is documented.
- **Ownership follows the slug.** The shell `<audio>` always has `id="player"` and `data-slug`; story-resume and parts find it by `data-role` and ignore events unless the loaded slug is their own. (The final code review found the earlier id-based scheme saved one story's progress into another.)
- **The build id is a content hash**, not a timestamp, so the nightly rebuild does not force a reload (and kill playback) on an unchanged site. A real deploy still forces one full navigation, because mixing new markup with old modules mid-story is worse than one restart per release.
- **CI gates the deploy** on unit tests and the Playwright smoke test (`build.yml`, job `verify`).
- **Narrator run:** real alignment data came back with both `alignment` and `normalized_alignment` and a `request-id` header. The heading-split finding above is cosmetic for part timing and was left alone to avoid re-billing.
- **Lore links are the `link` property** (validated, shown under a closed "For grown-ups" section), not body text.
