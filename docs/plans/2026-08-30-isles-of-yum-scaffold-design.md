# Isles of Yum — new repo scaffold design

Date: 2026-08-30

## Context

A new, already-substantial story world ("Isles of Yum" — Felix & Alex stories set in a
magical food-themed archipelago) exists as working notes at
`C:\Users\bever\Downloads\isles-of-yum\isles-of-yum\`: a World Guide, Story Archive,
Ideas/Arcs tracker, an audio-pipeline spec, and 8 stories (3 as PDFs under
`stories/originals/`, 1 as markdown — `08_Marzipans_Well.md`; the rest referenced in the
archive but not present as files).

Decision: build this as a **new, separate GitHub repo** (`RobertBeverton/isles-of-yum`),
not folded into the existing `Stories` repo, because:
- Stories' `/write-story` skill, `docs/process/`, and `reference/` are hard-wired to the
  Felix & Alex *shared canon* (character directory, villain roster, Bramble Wall rules).
  Nesting Isles of Yum under `stories/isles-of-yum/` would pull that canon into context
  by default for a world that already has its own separate, mature, and different process
  (no-villain rule, two-persona check, its own craft rules).
- Isles of Yum's process docs are self-contained and already proven across 7 stories —
  porting the *pattern* (11ty pipeline, validation, GH Actions, skill-driven writing
  workflow) costs nothing; inheriting Stories' *specific canon files* would actively
  conflict with it.

## Scope of this pass

1. Scaffold the new repo's pipeline (11ty site, validate-content, tests, GH Actions,
   `/write-isles-story` skill) — ported and adapted from Stories, not copied verbatim.
2. Build the ElevenLabs audio narration pipeline (`audio-pipeline/narrate.mjs`) per the
   existing `SPEC.md`, as a real (not stubbed) script — resolves SPEC.md's open questions
   per decisions below. This runs locally only, never in CI (needs a human-supplied
   `ELEVENLABS_API_KEY`).
3. **Out of scope for this pass**: migrating the 8 existing stories into the new
   frontmatter/folder shape (separate follow-up), and any live ElevenLabs API testing
   (no API key/voice IDs available yet — ships with placeholders).

## Repo shape

```
isles-of-yum/
  stories/                     # markdown, frontmatter + prose
  narration/                   # narration-script variants (stripped for audio)
  audio/                       # generated/committed MP3s
  reference/                   # World_Guide.md, Story_Archive.md, Ideas_and_Arcs_Tracker.md
  docs/process/                # writing process docs (adapted from Stories' docs/process/)
  audio-pipeline/
    narrate.mjs                # parser + batcher + ElevenLabs client
    narrate.test.mjs
    voice_map.json              # placeholder voice_ids (NARRATOR/FELIX/ALEX/MARZIPAN)
  scripts/
    validate-content.mjs       # ported from Stories, adapted frontmatter shape
    validate-content.test.mjs
    slugify.mjs                # ported as-is
    stories-lib.mjs            # ported as-is (or adapted minimally)
  site/                        # 11ty templates, ported from Stories/site
  eleventy.config.js
  .github/workflows/build.yml  # validate + build + deploy to its OWN GitHub Pages
  .claude/commands/write-isles-story.md
  CLAUDE.md
  package.json
```

## Key adaptations (not straight ports)

- **Frontmatter**: same shape as Stories' `bramble-wall/book-1.md` (title, description,
  tags, audio, audioDuration, publishDate, draft). Isles of Yum stories are standalone
  within one ongoing world rather than Stories' `series`/`seriesOrder` model. Add an
  optional `islands: []` field (data already tracked per-story in Story_Archive.md as
  "Islands Featured") — useful now for content and later for an island-index page.
- **validate-content.mjs**: same core checks (required frontmatter, duplicate slugs, repo
  size) but **missing `audio`/mismatched file is a warning, not a hard failure** — you're
  adding the first 3 audio files yourself, and the pipeline will generate the rest over
  time, so a story pending narration shouldn't block the build. Once `audioDuration` is
  present and the file exists, a *mismatched* duration is still a hard fail, same as
  Stories.
- **`/write-isles-story` skill**: adapted from `write-story.md`'s draft → review → lock →
  narration shape, but points at Isles of Yum's own actual process (World Guide's
  two-persona check + review pass) rather than Stories' heavier multi-panel canon system
  — Isles of Yum already has its own proven, simpler process; don't force Stories'
  machinery onto it.

## Audio pipeline (`narrate.mjs`)

Node (`.mjs`), not Python, despite SPEC.md sketching a `narrate.py` CLI — chosen because
the rest of the toolchain is already all-Node (11ty, validate-content, slugify), this
script only ever runs locally/on-demand (never in CI, so no benefit from ElevenLabs'
official Python SDK), and one runtime keeps the repo's maintenance surface smaller
long-term. Uses a raw `fetch` against `POST /v1/text-to-dialogue`.

Resolves SPEC.md's two open decisions:
- **Low-confidence dialogue attribution → block and report.** If any turn has no
  adjacent dialogue tag, an unmapped character name, or ambiguous multi-character
  attribution, the script prints a line-numbered report and **exits without calling the
  API** — avoids paying to generate audio with wrong voices; fix the source `.md` and
  rerun.
- **Minor-character voice strategy**: left as a per-story judgment call (fold into
  NARRATOR or add a new entry to `voice_map.json`), same as SPEC.md already suggested —
  not worth hardcoding.

Pipeline steps:
1. Parse narration `.md`: split on `• • •` into scenes, then into narration vs. dialogue
   turns (quote + nearest dialogue tag).
2. Flag low-confidence turns (see above); abort if any exist.
3. Merge adjacent same-voice turns; greedily batch into ≤1,800-char groups, never
   splitting a turn, preferring breaks at scene boundaries.
4. Call ElevenLabs per batch (`ELEVENLABS_API_KEY` env var), caching each successful
   batch's audio to a temp dir keyed by content hash — a retry after a transient
   failure (rate limit, 5xx) doesn't re-call the API for batches that already succeeded.
5. Concatenate batch MP3s in order via `ffmpeg -f concat` into `audio/<slug>.mp3`.
6. Print final duration for pasting into that story's `audioDuration` frontmatter.

CLI: `node audio-pipeline/narrate.mjs stories/<slug>.md --voice-map audio-pipeline/voice_map.json --out audio/<slug>.mp3`

Tests cover the parser/batcher (turn splitting, speaker resolution, low-confidence
flagging, batch packing) against fixture snippets — no live API calls in tests.

## Repo/publishing setup

- New GitHub repo: `RobertBeverton/isles-of-yum`, **public**, own GitHub Pages, deployed
  by its own `build.yml` (validate → 11ty build → deploy), same pattern as Stories.
- Explicitly rejected: keeping it private and merging its build output into Stories'
  Pages via a cross-repo checkout — would require a PAT stored as a Stories secret and
  couple the two repos' CI (a broken isles-of-yum build could block Stories' deploy),
  re-introducing the coupling the repo split was meant to avoid. Public source is
  acceptable since Stories' source is already public today.

## Out of scope / explicit non-goals

- Migrating existing story content (PDFs + the 6 archive-referenced-but-missing story
  files) into the new structure.
- Live ElevenLabs testing — no API key/voice IDs available; ships with placeholder
  `voice_map.json` values.
- Any change to the existing Stories repo.
