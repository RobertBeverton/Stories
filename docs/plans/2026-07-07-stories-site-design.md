# Stories Site — Design

## Goal

A GitHub Pages site that lets granted users (initially family, on phone or PC) browse a growing library of stories (5 now, 30–50 later), search by title/series/description/tags, see estimated read/listen time, read the markdown text or play ElevenLabs-generated MP3 narration, and resume where they left off — per device, no login.

## Repo structure

```
/stories/
  bramble-wall/
    book-1.md
    book-1.mp3
  some-standalone-story.md
  some-standalone-story.mp3
/reference/                 # lore/canon docs (e.g. bramble-wall-bible.md) — never built into pages
/site/                      # 11ty project
  _includes/                # layouts, partials
  _data/                    # build-time collections
  index.njk
  story.njk
  series.njk
/scripts/
  validate-content.mjs      # pre-build guard, see "Content validation" below
.github/workflows/build.yml # build 11ty, deploy to GitHub Pages on push to main
```

`bramble-wall-bible.md` (series canon notes) and `bramble-wall-book-1.md` currently sit at repo root and should move into this structure during initial scaffolding: the bible into `/reference/`, the story into `/stories/bramble-wall/book-1.md` with frontmatter added.

## Frontmatter schema

```yaml
---
title: "The Gap in the Bramble Wall"
series: "The Bramble Wall"     # omit for standalone stories
seriesOrder: 1                  # position within series
description: "Felix and Alex find a hidden gap in a bramble wall and race a storm to build a den."
tags: ["adventure", "forest", "brothers"]
audio: "book-1.mp3"
audioDuration: 742               # seconds; filled in manually/by helper script after ElevenLabs generation
publishDate: 2026-07-07
---
```

- `series` present → grouped under a series page, ordered by `seriesOrder`, gets prev/next chapter nav.
- `series` absent → standalone, shown in general grid, no chapter nav.
- `tags` + title + description feed the client-side search index. **Write tags as a kid would say them** — concrete nouns from the story (character names, key objects/animals, settings: "fox", "radio", "den") in addition to any thematic tags — not just adult cataloguing terms, since search only matches this metadata, not story text.
- Reading time computed at build from word count (~200–230 wpm estimate, labeled "~12 min read").
- `audioDuration` is written into frontmatter, but is **derived automatically at build time from the actual MP3 file** (see Content validation below) rather than hand-typed — the frontmatter value is advisory/overwritten, not authoritative, so a stale or skipped value can't silently mislabel a story.

## Audio storage

MP3s committed directly into the repo alongside their markdown (via Git, not LFS) for v1. At a planning level this is comfortable (40-50 stories × ~6-12MB ElevenLabs output ≈ 300-500MB, under GitHub's soft 1GB repo warning and Pages' 1GB site limit) — but nothing enforces that ceiling automatically, so a CI size guard is included below rather than relying on manually noticing. Revisit with Git LFS or external hosting (e.g. R2/S3) if the guard starts tripping, or a single file exceeds ~50MB.

## Content validation (build-time guard)

A pre-build Node script (`scripts/validate-content.mjs`), run as its own GitHub Actions step before the 11ty build, fails the build loudly (non-zero exit) if:
- Required frontmatter fields are missing (`title`, `description`, `publishDate`) or YAML fails to parse.
- Two files in the same series share a `seriesOrder` value, or any two files resolve to the same output slug.
- An `audio:` path in frontmatter doesn't resolve to an actual committed file.
- Total size of `/stories` exceeds a set threshold (e.g. 700MB) or any single file exceeds ~90MB.

This script also computes real `audioDuration` from each MP3's actual length (via a pure-JS/no-native-deps library such as `music-metadata`, chosen over `ffprobe` to avoid platform/binary issues in CI) and writes/overwrites it, so the frontmatter field never has to be hand-measured or trusted as-is.

This turns the most likely content bugs (duplicate ordering, dead audio links, missing fields, wrong durations, repo bloat) from silent, user-discovered breakage into loud, maintainer-discovered CI failures — the highest-leverage single addition identified during review.

## Build pipeline

GitHub Actions, triggered on **pull request** (build + validate only, so a broken change is caught before merge) and on push to `main` (build, validate, deploy):
1. Run `validate-content.mjs` (see above) — fail fast if anything's wrong.
2. 11ty scans `/stories/**/*.md`, parses frontmatter.
3. Computes reading time; uses the build-derived `audioDuration`.
4. Generates: home/library page, per-story pages, series pages.
5. Builds `search-index.json` (title, series, description, tags) for client-side search.
6. On `main` only: deploys static output to GitHub Pages.

Content changes (new stories, edits) go via a branch + PR rather than direct commits to `main`, even solo — so a validation failure is visible as a red X before it can reach the live site, not after. This matters more than usual here because there's no manual QA step otherwise catching a bad frontmatter edit made e.g. from the GitHub mobile/web editor.

## Pages

**Home / Library**
- Search box (live client-side filter over the JSON index — titles/series/descriptions/tags only, not full text). Grid stays visible under/behind the search box rather than disappearing on a no-match query, so a child who mistypes still sees something browsable rather than a blank page.
- Series shown as grouped cards ("Book 1 of 3" + blurb); standalone stories as their own cards in the same grid, each in a landmarked `<section aria-labelledby>` so screen reader users can jump between groups.
- Sorted by `publishDate` descending by default.
- Each card: title, ~read time, ~audio duration, description, "▶ Resume" badge (icon + label, not text-only) if localStorage has progress.

**Series page** (only for series with 2+ entries)
- Series title/description, ordered chapter list with individual read/listen times, highlight on the chapter with saved progress.
- After a story's content ends, an explicit "Next: Book 2 →" link/card is shown inline (not just as a header nav item) so a child reaching the end of the text is prompted toward the next chapter rather than having to know to look for it.

**Story page**
- Title, series/chapter breadcrumb + prev/next links (if applicable).
- Audio player built on the native `<audio controls>` element (styled, not replaced) rather than a fully custom widget — gets keyboard operability, screen reader state, and scrubbing for free instead of re-implementing ARIA slider semantics. A small amount of custom UI (resume-from-X prompt) sits alongside it rather than replacing it.
- Rendered markdown body is present in the static HTML output regardless of JS — search, resume-banner, and audio-position-saving are progressive enhancements layered on top, not gates in front of the content. This is an explicit constraint on implementation, not just a byproduct of using 11ty.
- Saves `{scrollY, audioTime}` to localStorage keyed by story slug on pause/unload (throttled during playback).
- On return: a "Resume or start over?" choice uses distinct icons (e.g. a clock/rewind glyph for resume vs. a fresh-page glyph for start over) plus text, not text alone, since a pre-reading child can't reliably parse the words. Choosing "start over" does not discard the previous saved position until the new session itself progresses past it — so an accidental tap is recoverable rather than destructive.
- **Known, accepted limitation:** on a shared family device, resume state is keyed by story slug only (no per-child profile), so two siblings reading the same story will overwrite each other's position. Not solving this in v1 (would need login/profiles, explicitly out of scope) — noting it here so it's a conscious tradeoff.
- **Known, accepted limitation:** iOS Safari requires a user tap to start audio (no autoplay-into-resume) and may evict localStorage after ~7 days of no visits to the site, silently resetting resume state. Not engineering around this in v1 (would need server-side accounts) — worth a manual test pass on an actual iPhone/iPad before calling v1 done, so the maintainer knows what "graceful degradation" looks like here (progress just resets sometimes) rather than discovering it as a bug report.

**Navigation**
- Persistent header linking back to the library from every page.
- Mobile-first CSS: tap targets sized to at least 44×44px (iOS HIG / WCAG 2.5.5 minimum, stated explicitly so it's checkable rather than vibes-based), body text at a minimum readable size (e.g. 18px+), single-column layout, WCAG AA contrast (4.5:1) on all text — reflects that children are primary users.
- No autoplaying animation/audio on load; any hover/transition effects respect `prefers-reduced-motion`.

## Content curation

Adding `draft: true` to a story's frontmatter excludes it from the library grid, series pages, and search index at build time, while still being buildable/previewable via its direct URL (not linked from anywhere) or on a PR preview. This gives the maintainer a lightweight way to review a new story before it's discoverable by a child browsing the site, without needing a login system — flip `draft: false` (or remove the field) once vetted.

## Privacy note

"Unlisted public GitHub Pages" means undiscoverable-by-navigation, not access-controlled — the repo, its commit history, and file contents are crawlable via GitHub's own search/API and by any search engine once a link is shared anywhere that pre-fetches URLs (chat link-preview bots, etc.), and git history retains old content even after edits/deletions. This is an accepted tradeoff for low-sensitivity content (first names already appear in stories), but: never commit a child's full name, school, or specific location in story content, filenames, or commit messages.

## Explicitly not building (v1)

Login/auth, cross-device progress sync or per-child profiles, text-audio karaoke highlighting, cover image pipeline (placeholder cards using series-name initials instead), comments/ratings, offline/service-worker caching of audio, adaptive/streaming audio delivery.

## Review history

- **Persona reviews conducted** (kid user, parent/adult user, maintainer, accessibility/offline specialist) — findings folded in above: resume UX clarity, content curation/draft gate, native audio element, build-time content validation, tap target/contrast specifics, tag-writing guidance, and documented shared-device/iOS limitations as conscious tradeoffs rather than oversights.
- **Premortem conducted** — findings folded in above: automatic audio-duration derivation (removes the top abandonment risk), duplicate slug/seriesOrder + missing-audio-file build guard, repo-size CI guard, PR-before-merge workflow so a broken build doesn't silently reach the live site, and the privacy note on what "unlisted" actually means.
