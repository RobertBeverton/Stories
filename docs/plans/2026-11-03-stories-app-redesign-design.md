# Stories app redesign, hosting move, lore and part sync

Date: 2026-11-03

## Background

A ChatGPT-built prototype (`story-app-directions.html`, three "directions") proposed a redesign of the Stories app now that it serves several story worlds. It was assessed against what GitHub Pages and the real content can support. Outcome: keep the Hearth visual language and a few ideas, rebuild the structure.

Findings that drive this design:

- The prototype is a single in-memory page, with no URLs, back button or deep links. The real site is a multi-page 11ty build.
- "Playback continues while you browse" is impossible today. A full page load stops the `<audio>` element. `mini-player.js` fakes persistence through localStorage and, on a page that is not the playing story, only writes a flag and controls nothing.
- Prototype data was invented. The real worlds are `isles-of-yum` (10 stories), `bramble-wall` (10) and `Gods-PrimarySchool` (19, "The Staff Room Gods", not yet in `content-sources.json`). Gods stories do have `## Part N. Title` headings and a `gods:` field.
- Accessibility gaps: 10 to 11px text, tap targets under 44px, borders and seek tracks at about 1.8:1 contrast (3:1 needed), div-based controls, no focus styles, no reduced-motion or colour-scheme support.
- Existing scripts interpolate localStorage values into `innerHTML` unescaped. localStorage is shared across the whole `robertbeverton.github.io` origin.

## Decisions

| Question | Decision |
|---|---|
| Hosting | Cloudflare static hosting on a `kinly.download` subdomain (suggested `stories.`). GitHub Pages stays as a fallback until the move is verified. |
| Visibility | Public, unlisted: `noindex` meta, `X-Robots-Tag`, `robots.txt`, no sitemap. Cloudflare Access can be added later. |
| Progress | Per device, in localStorage. No accounts or sync. |
| Audio while browsing | Yes, via a persistent shell over real pages (approach A). |
| Direction | Hearth (dark, calm) as the single base. |
| Worlds | A world switcher and per-world accent now. |
| Lore | In scope, owned by each world repo. |
| Reader sync | Part-level now. Sentence-level deferred and opt-in. |

## 1. Hosting and shell architecture

**Hosting.** Build is unchanged: 11ty plus content fetched from world repos, in GitHub Actions. Deploy publishes `_site/` to Cloudflare static hosting with the `cf` CLI (no Wrangler config in this project). The token lives in GitHub secrets, scoped to this project. `PATH_PREFIX` becomes empty, and the manifest, `start_url`, `scope` and service-worker scope move to `/`. A build-time switch keeps the old `/Stories/` build working for one release.

**Shell.** One base layout with three regions:

1. `<main id="view">`, the only region the router replaces.
2. `<audio id="player">` and the mini-player bar, outside `#view` so they survive navigation.
3. A fixed bottom nav (Home, Library, Playing) using `env(safe-area-inset-bottom)` and `viewport-fit=cover`.

**Router.** One small vanilla module, no framework. It:

- intercepts same-origin link clicks, ignoring modifier keys, `target` and `download`
- fetches the target HTML and swaps `#view`, `<title>` and the active nav state
- uses `history.pushState` and handles `popstate`
- moves focus to the new `h1` and announces the change to screen readers
- falls back to a normal navigation on any failure

Each page type registers `init()` and `destroy()`, which the router calls on every swap.

**Player.** Media Session handlers are set once on the persistent `<audio>`. Previous and next load a new source into the same element instead of navigating, so lock-screen controls no longer interrupt playback.

## 2. Data and worlds

**World tag.** Worlds are still merged flat into `stories/` and slugs still key progress (`story-progress:<slug>`), as CLAUDE.md requires. `fetch-content` now records each story's `world` (the source `name` in `content-sources.json`) at fetch time, since the folders are flattened and the value cannot be inferred later.

**World config.** Presentation details sit with each source in `content-sources.json`:

```json
{ "name": "isles-of-yum", "title": "Isles of Yum",
  "tagline": "...", "accent": "#...", "icon": "..." }
```

These carry no canon. `accent` becomes a CSS custom property per page. Adding a world means adding one entry.

**Library index.** The build emits `library.json` with slug, title, world, series, order, duration, tags, URL and icon per story. Search and filters use it, so the library page does not load every story page.

**Filters** (all derivable today): world, series, under 15 minutes (`audioDuration`), in progress and not started (localStorage).

**Output hardening.** All titles and progress values are escaped before writing to the page, via `textContent` or an escape helper, never raw `innerHTML`. This also fixes `resume.js`, `library.js` and `mini-player.js`.

## 3. Visual design, screens and accessibility

**Tokens.** One full palette on `:root`: surface, raised surface, text, muted text, accent, line. Borders and tracks raised to at least 3:1 against the background. `theme-color` matches the surface. Accent is used as a fill with dark text. A light scheme, if wanted, is a real `prefers-color-scheme` token set.

**Screens.**

1. **Home.** The Continue card is first and dominant. Then the world switcher and a short "Recently added". With no history, the first-visit state shows the newest story in place of Continue.
2. **Library.** Search, filters and compact rows. The title is a link, play is a separate button.
3. **Story.** The existing page restyled: cover, metadata, a play button driving the persistent player, the text and next story.
4. **Player.** A full-screen sheet from the mini-player: native seek slider, plus or minus 15 seconds, speed, sleep timer, and the part list when parts exist.
5. **Lore.** See below.

**Accessibility.** Body text at least 16px and UI labels at least 12px. Tap targets at least 44px. Visible `:focus-visible` ring. Native `<input type="range">` for seek. Nav is real links with `aria-current`. World switcher is keyboard-operable. `prefers-reduced-motion` honoured. One `h1` per page.

**Dropped from the prototype:** phone frame and status bar, the three-direction picker, the lock-screen mockup, invented data.

### Lore

World-owned, so canon stays out of this repo.

- A world repo may include `lore/` with one markdown file per entry. Front matter: `title`, `tradition`, `summary`, optional `link`, `stories` (list of slugs). Body is short text for curious listeners.
- A story's `gods:` field already names the figure. It gains an optional `lore:` slug for an exact match.
- `fetch-content` pulls `lore/` like stories, tagged with `world`. The build emits entries into `library.json`.
- The Lore tab lists the current world's entries grouped by tradition. Entries link to stories, and story pages link back. A world with no `lore/` hides the tab.
- External links are an entry-level choice made in the world repo.

### Reader sync

Two tiers.

1. **Part-level, in scope.** The narrator already builds audio from chunks joined with ffmpeg and speaks "Part N. Title." at each start, so it can record cumulative chunk durations. It writes `parts: [{title, start}]` into front matter beside `audioDuration`. The reader highlights the current part, lets you tap a part to jump, and follows the audio clock at any playback speed. Stories without `parts` show a plain reader.
2. **Sentence-level, deferred.** Needs word-level timings from the narration service, per-sentence alignment and drift correction. If added later, it is an opt-in toggle, off by default, only for stories with alignment data.

## 4. Migration, handoff, testing, rollout

**Headers.** A `_headers` file sets `Cache-Control: immutable` on hashed assets and short caching on HTML, a CSP, and `X-Robots-Tag: noindex`. The existing `repository_dispatch` hook is wired up so a push to a world repo rebuilds the site.

**Progress handoff.** localStorage is per origin, so the new site starts empty. One last release of the old Pages site reads every `story-progress:*` key, base64-encodes it into the URL fragment and redirects to the new domain. A fragment is never sent to a server. The new site imports the keys once, only where no local key exists, then clears the fragment. If JS or storage is unavailable, the redirect still happens and progress starts fresh.

**Testing.**

- Vitest for the router (link filtering, swap, history, focus), library index and filters, progress import and the escape helper.
- Existing contrast scripts extended for the new tokens, including the 3:1 non-text rule.
- `validate-content` extended to lore front matter, `parts` and `lore:` links.
- Manual check on a real phone for lock-screen controls and safe areas.

**Rollout order.** Each step ships independently, and the old site stays up until step 1 is verified.

1. Hosting move with the existing UI, plus the progress handoff, so URLs settle first.
2. Shell: router, persistent player, new nav.
3. Hearth restyle and the Home, Library, Story and Player screens.
4. World switcher and `library.json`.
5. Lore and part-level sync, with the narrator and world-repo changes.

## Open items

- Add `Gods-PrimarySchool` to `content-sources.json`. It is not currently a git repo, so it needs a remote first.
- Gods stories have no mp3s yet. Part sync and the player need narrated audio to exercise.
- Confirm the subdomain name.
- Check Cloudflare's current guidance on Pages versus Workers static assets for new projects before step 1.
- Cross-repo work (narrator `parts` output, `lore/` entries, `lore:` slugs) belongs in the world repos, each under its own CLAUDE.md.
