# Stories app redesign, custom domain, lore and part sync

Date: 2026-11-03 (revision 2, after adversarial review round 1)

## Background

A ChatGPT-built prototype (`story-app-directions.html`, three "directions") proposed a redesign of the Stories app now that it serves several story worlds. It was assessed against what GitHub Pages and the real content can support. Outcome: keep the Hearth visual language and a few ideas, rebuild the structure.

Findings that drive this design:

- The prototype is a single in-memory page, with no URLs, back button or deep links. The real site is a multi-page 11ty build.
- "Playback continues while you browse" is impossible today. A full page load stops the `<audio>` element. `mini-player.js` fakes persistence through localStorage and, on a page that is not the playing story, only writes a flag and controls nothing.
- Prototype data was invented. The real worlds are `isles-of-yum` (10 stories), `bramble-wall` (10) and `Gods-PrimarySchool` (19, "The Staff Room Gods", not yet in `content-sources.json`). Gods stories do have `## Part N. Title` headings and a `gods:` field.
- Accessibility gaps: 10 to 11px text, tap targets under 44px, borders and seek tracks at about 1.8:1 contrast (3:1 needed), div-based controls, no focus styles, no reduced-motion support.
- Existing scripts interpolate localStorage values into `innerHTML` unescaped. localStorage is shared across the whole `robertbeverton.github.io` origin.

## Decisions

| Question | Decision |
|---|---|
| Hosting | **Custom domain on GitHub Pages** (suggested `stories.kinly.download`, CNAME to Pages). Same build and deploy pipeline, no prefix, own origin. Cloudflare in front for headers is optional and unverified. A move to Cloudflare static hosting is the fallback if progress migration turns out to matter (see Migration). |
| Visibility | Public, unlisted: `noindex` meta, `robots.txt`, no sitemap. `noindex` is a request, not a lock. Cloudflare Access is the upgrade path. |
| Progress | Per device, in localStorage. No accounts or sync. Not migrated across the origin change (see Migration). |
| Audio while browsing | Yes, via a persistent shell over real pages, **gated on a device spike** (step 0). |
| Direction | Hearth (dark, calm), dark only for v1. Tokens are structured so a light set can be added later. |
| Worlds | A world switcher and per-world accent. |
| Lore | In scope, owned by each world repo. Launches hidden until a world has entries. External links tucked away. |
| Reader sync | Part-level now. Sentence-level deferred and opt-in. |
| Offline | Explicit non-goal for v1. Streaming only. |
| Fonts | System and Georgia only. Drop the Google Fonts request. |

## 1. Shell architecture

**Fixed chrome is one dock, not two bars.** A single fixed container at the bottom holds an optional mini-player row above a two-item nav (Home, Library). It uses `env(safe-area-inset-bottom)` and `viewport-fit=cover`, is capped at about 112px, and becomes non-fixed when the viewport is under 480px tall (landscape) or zoomed to 200%, so it can never cover content. "Playing" is not a tab: tapping the mini-player opens the player sheet.

**Layout.** Every page is built from one base layout:

1. `<main id="view">`, the only region the router replaces.
2. `<audio id="player">` and the dock, outside `#view` so they survive navigation.

**Router.** One small vanilla module, no framework. It:

- intercepts same-origin link clicks, ignoring modifier keys, `target` and `download`
- fetches the target HTML, parses it with `DOMParser`, and never executes fetched scripts
- swaps `#view`, `<title>` and the active nav state
- uses `history.pushState` and handles `popstate`
- moves focus to the new `h1` and announces the change in a live region
- falls back to a normal navigation on any failure
- compares a `<meta name="build-id">` in each fetched page with the running one, and does a full navigation on mismatch, so a tab left open overnight can never mix old JS with new HTML
- has a **kill switch**: a build flag and a localStorage flag each disable it, leaving the plain multi-page site fully working

**Page scripts are rewritten, not retrofitted.** Today's scripts (`resume.js` uses `document.currentScript.dataset.slug`; others run at top level) won't re-run in a swapped page. Each becomes a module exporting `mount(root)` and `unmount()`, driven by data attributes on the page. This is a rewrite of every page script, and should be estimated as one.

**Player.** Media Session handlers are set once on the persistent `<audio>`. Previous and next load a new source into the same element instead of navigating, so lock-screen controls no longer interrupt playback. The audio source is each story's `audioUrl`, which the narrator writes (see [docs/audio-hosting.md](audio-hosting.md)).

## 2. Data and worlds

**World tag.** Worlds are still merged flat into `stories/` and slugs still key progress (`story-progress:<slug>`), as CLAUDE.md requires. `fetch-content` records each story's `world` (the source `name`) at fetch time, since the folders are flattened and the value cannot be inferred later. The build **fails on a duplicate slug** across worlds.

**World config.** Presentation details sit with each source in `content-sources.json`:

```json
{ "name": "isles-of-yum", "title": "Isles of Yum",
  "tagline": "...", "accent": "#...", "icon": "..." }
```

These carry no canon. `accent` becomes a CSS custom property per page. The build **fails if an accent can't reach 4.5:1 for text on its fill**, reusing the existing contrast scripts. Adding a world means adding one entry.

**Library index.** The build emits `library.json` with slug, title, world, series, order, duration, tags, URL, icon and publish date. Search and filters use it, so the library page does not load every story page.

**Filters** (all derivable today): world, series, under 15 minutes (`audioDuration`), in progress, finished and new (localStorage plus publish date).

**Output hardening.** All titles and progress values are escaped before writing to the page, via `textContent` or an escape helper, never raw `innerHTML`. This also fixes `resume.js`, `library.js` and `mini-player.js`.

## 3. Visual design, screens and states

**Tokens.** One full palette on `:root`: surface, raised surface, text, muted text, accent, line. Borders and tracks at least 3:1 against the background. `theme-color` matches the surface. Accent is used as a fill with dark text.

**Screens.**

1. **Home.** Picture-first. A large Continue card, then the world picker as big pictures. No "Recently added" list: Library sorts newest first with a New marker. With no history, the card shows the newest story.
2. **Library.** Search, filters and compact rows, newest first. Each title is a link, play is a separate button. When a world has lore, a "Stories | Lore" segmented control sits at the top, so the nav stays stable.
3. **Story.** Cover, metadata, a play button that drives the persistent player, the text and next story. The reader has A− and A+ text size, a measure of about 65 characters and generous line height.
4. **Player.** A full-screen sheet from the mini-player: native seek slider, plus or minus 15 seconds, speed, sleep timer and, when parts exist, the part list.
5. **Lore.** See below.

**States the prototype skipped.**

- **End of story.** The audio stops. It never autoplays the next story. The Continue card and story row switch to "Play again", and a "Next story" link is offered.
- **Finished.** The progress record gains `completed` (set on `ended` or within about 10 seconds of the end). Finished stories show "Play again", not "in progress", and Continue skips them.
- **New.** A story published in the last 14 days with no progress gets a New marker.
- **Empty and error.** No-history Home, no search results, audio failing to load (clear message and a retry), and no network.

**Child-first sizing.** Primary targets on Home and the player are at least 56px, and everything else at least 44px. The seek slider has a large thumb. Accidental skips are limited by not putting seek on the mini-player. Covers are large and carry meaning.

**Accessibility.** Body text at least 16px and UI labels at least 12px. Visible `:focus-visible` ring. Native `<input type="range">` for seek, with a time value as text. Nav is real links with `aria-current`. World switcher is keyboard-operable. Part changes and playback state use live regions. `prefers-reduced-motion` honoured. One `h1` per page. Checked at 200% zoom.

**Dropped from the prototype:** phone frame and status bar, the three-direction picker, the lock-screen mockup, invented data, the light direction.

### Lore

World-owned, so canon stays out of this repo.

- A world repo may include `lore/` with one markdown file per entry. Front matter: `title`, `tradition`, `summary`, optional `link`, `stories` (list of slugs). Body is short text for curious listeners.
- A story's `gods:` field already names the figure. It gains an optional `lore:` slug for an exact match, and the validator fails the build on a dangling slug.
- `fetch-content` pulls `lore/` like stories, tagged with `world`. The build emits entries into `library.json`.
- The Lore segment lists the current world's entries grouped by tradition. Entries link to stories, and story pages link back. **A world with no entries shows no Lore segment.** Launching with only new stories covered is expected.
- **External links** appear only inside a closed "For grown-ups" section at the bottom of an entry, opening in a new tab with `rel="noopener noreferrer"`. They are never in the main reading flow.
- Lore text is written under the same care as the Story Bible, especially for living traditions.

### Reader sync

Two tiers.

1. **Part-level, in scope.** The narrator already builds audio from chunks joined with ffmpeg and speaks "Part N. Title." at each start, so it can record cumulative chunk durations and write `parts: [{title, start}]` into front matter beside `audioDuration`. The reader highlights the current part, lets you tap a part to jump, and follows the audio clock at any speed. A validator **fails the build unless `parts` matches the story's `## Part` headings in count and order, and every start is within `audioDuration`**. Re-narration rewrites `parts` and `audioDuration` together. Stories without `parts` show a plain reader.
2. **Sentence-level, deferred.** Needs word-level timings, per-sentence alignment and drift correction. If added later, it is an opt-in toggle, off by default.

## 4. Migration, delivery, testing, rollout

**Custom domain.** Add a `CNAME` file and the DNS record, enable HTTPS in Pages. `PATH_PREFIX` becomes empty, and the manifest, `start_url`, `scope` and any service-worker scope move to `/`. Content-hashed asset filenames replace the current `?v=buildTime`. Headers: Pages controls none, so `noindex` and a CSP go in `<meta>` tags. Cloudflare response-header rules in front of a proxied Pages domain could add real headers; this is unverified and optional.

**Migration and progress.** localStorage is per origin, so the new origin starts empty. Once a custom domain is set, GitHub redirects the old project URL to it at the HTTP level (to be confirmed in step 0), so no script can run on the old origin to hand progress across.

- **Default: progress resets once.** The stakes are low: an empty Continue card and resume positions on about 20 to 50 stories. Home-screen icons of the old PWA need re-adding from the new domain.
- **If migration matters:** keep the old Pages site on its origin and host the new domain on Cloudflare static hosting (token in GitHub secrets, `cf` CLI). The old site then runs a final handoff release that base64-encodes `story-progress:*` into a URL fragment and redirects to the new domain, which imports the keys once. This is more moving parts, so it is not the default.

**Audio and bucket.** Each story points at R2 with `audioUrl`, written by the narrator (as in docs/audio-hosting.md). The bucket's CORS rules gain the new origin. The audio keys, hashes and `Cache-Control` rules are unchanged.

**Content triggers.** The existing `repository_dispatch` hook is wired up so a push to a world repo rebuilds the site. The token it needs is scoped to this repo only.

**Testing.**

- Vitest plus jsdom (or happy-dom) for the router (link filtering, swap, history, focus, build-id mismatch), library index and filters, completed and new state, and the escape helper.
- A Playwright smoke test in CI: build, load a story, start audio, navigate, and assert the same `<audio>` element and its playback survive.
- Existing contrast scripts extended for the new tokens, the 3:1 non-text rule and per-world accents.
- `validate-content` extended to lore front matter, `parts`, `lore:` links and duplicate slugs.
- A manual pass on the real devices for lock-screen controls, safe areas, screen-lock audio and the installed home-screen icon.

**Operations.** Domain auto-renew on. Calendar reminders for the R2 token and any CI token expiry. Local copies of every mp3 kept outside Cloudflare. The `.download` TLD is tested on the family's devices and networks before relying on it.

**Rollout order.** Each step ships independently.

0. **Spikes (before any code is committed to).** (a) Prove persistent audio, lock-screen controls and screen-lock playback on the real phone and tablet, in Safari and as an installed home-screen app. If it fails, the router is dropped and the plan continues as a multi-page site. (b) Confirm the Pages redirect behaviour for a custom domain. (c) Confirm `audioUrl` from R2 plays and seeks end to end.
1. **Custom domain** on Pages, prefix removed, hashed assets, build-id, `noindex`.
2. **Restyle:** Hearth tokens, accessibility fixes, escaping, finished, new and end-of-story states, large targets, text-size control.
3. **World switcher and `library.json`,** with the slug and accent validators.
4. **Shell:** router and persistent player, only if spike 0a passed. The kill switch ships with it.
5. **Lore and part-level sync,** with the narrator and world-repo changes.

## Open items

- Add `Gods-PrimarySchool` to `content-sources.json`. It is not currently a git repo, so it needs a remote first.
- Gods stories have no mp3s yet. Part sync, `audioUrl` and the player need narrated audio to exercise.
- Confirm the subdomain name.
- Decide whether progress loss on the origin change is acceptable (default) or worth the Cloudflare-hosting path.
- Cross-repo work (narrator `parts` output, `lore/` entries, `lore:` slugs) belongs in the world repos, each under its own CLAUDE.md.
