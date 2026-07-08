# Writing Workflow — Index & Usage Guide

*Read me first. This tells you (and any agent) how the writing/review workflow is organized and — more importantly — WHAT TO READ WHEN. "All the files exist" is not the same as "the right file gets read first." This is that map.*

*This covers the **writing side**: drafting, canon, and review. For the **site side** (frontmatter schema, build pipeline, GitHub Pages deploy), see [`docs/plans/2026-07-07-stories-site-design.md`](../plans/2026-07-07-stories-site-design.md). Finished, LOCKED reading versions get frontmatter added and move to `/stories/` for the site build; everything under `/reference/` referenced below is lore/canon/working notes and is never built into pages.*

---

## What this workflow is for
Generating and rewriting bedtime stories for Felix & Alex (twins, 5, UK) — writing new stories, rewriting old ones from the archive, reviewing them with a persona panel, and producing ElevenLabs narration. Three tracks: the **Bramble Wall** grounded forest series (a finite 5-book set, complete), the **restarted Trio Force** series (open-ended, numbered case files, own bible — see below), and the **wider shared-cannon magic universe** (the big pre-restart back-catalogue, unnumbered legacy material).

---

## READ-ORDER BY TASK (the important part)

### Task: Write a new Bramble Wall book
1. `reference/bramble-wall/bible.md` — the canonical series spec (frame + slate + rules).
2. `reference/bramble-wall/ledgers.md` — **current state** (den, shelf, seeds, what's already used). Check BEFORE writing.
3. `craft-standing-rules.md` — universal craft rules.
4. Write against the book's slate entry. Then → review (below). Then → **update `ledgers.md`.** Once locked, add frontmatter and move into `/stories/bramble-wall/` per the site design doc.

### Task: Write a new Trio Force case file
1. `reference/trio-force/bible.md` — the canonical series spec (frame + slate + rules; RESTARTED, supersedes old archive numbering and Amelia's old on-scene/notebook role).
2. `reference/trio-force/ledgers.md` — **current state** (case-number assignments, evidence shelf, villain/Thursday-group roster, Amelia-usage count, powers granted, guest cast). Check BEFORE writing — case numbers are assigned here, at lock, never in a draft.
3. `craft-standing-rules.md` — universal craft rules.
4. `shared-canon-villain-roster.md` + `shared-canon-magic-and-powers-system.md` — villain anatomy and power-design rules (still valid, referenced by the bible).
5. Write against the next open slate slot. Then → review (below) → **update `ledgers.md`** (number, evidence shelf, villain, Amelia, powers, guests, all at once). Once locked, add frontmatter and move into `/stories/trio-force/`.

### Task: Rewrite an old story from the archive
1. `reference/shared-cannon/felix-alex-story-archive.md` — find and read the original.
2. `reference/shared-cannon/felix-alex-story-rankings.xlsx` — why it scored as it did (the diagnosis).
3. `reference/shared-cannon/shared-canon-character-directory.md` + `reference/shared-cannon/shared-canon-generation-guide.md` — canon and craft.
4. `craft-standing-rules.md` — universal rules (note: these SUPERSEDE the older guide where they conflict — e.g. the Felix/Alex braid replaces "does/notices").
5. Any relevant series bible if it belongs to a sub-series.
6. Rewrite → review → save.

### Task: Review a draft (story, bible, or narration script)
1. `personas.md` — pick the panel (A: story · B: adversarial · C: foundation).
2. `review-protocols.md` — run the pass, then **ORCHESTRATE** (never apply all notes).
3. Apply FIX/MITIGATE; record HOLDs; escalate DECIDEs.

### Task: Produce narration (ElevenLabs)
1. `narration-production-notes.md` — model choice (v2 for stories), what to strip/keep, workflow.
2. Produce the narration version from the LOCKED reading version (don't narrate a draft).
3. Audio Ear pass (`personas.md`).
4. Generate; then mark 🔊 in `reference/bramble-wall/ledgers.md`.

### Task: Design a NEW series or foundation
1. `craft-standing-rules.md` — universal constraints.
2. `personas.md` Panel C + `review-protocols.md` (pre-mortem + architect) — stress-test the foundation before writing any prose.
3. Model note: use the strongest reasoning model for foundational/architecture work; a fast capable model for writing-against-a-settled-bible. (Opus for architecture, Sonnet for construction.)

---

## FILE MAP

```
/docs/process/                       ← this workflow (drafting/review/canon process)
  README.md                          ← this index
  craft-standing-rules.md            ← universal craft rules (ALL stories)
  personas.md                        ← the review panel (scored/weighted)
  review-protocols.md                ← how to run reviews + the Orchestrator
  narration-production-notes.md      ← ElevenLabs v2/v3, device facts, workflow

/reference/                          ← lore/canon/working notes — never built into pages
  /bramble-wall/
    bible.md                         ← canonical series spec (frame+slate+rules)
    ledgers.md                       ← LIVE STATE — check before writing, update after

  /trio-force/                       ← RESTARTED case-file series (clean numbering from #1)
    bible.md                         ← canonical series spec (frame+slate+rules; patches Amelia's role)
    ledgers.md                       ← LIVE STATE — case #s assigned here at lock, evidence shelf, villains, Amelia usage, powers, guests

  /shared-cannon/                    ← the wider universe (magic) / pre-restart back-catalogue
    shared-canon-character-directory.md    ← who's who (PATCHED — see note)
    shared-canon-generation-guide.md       ← original craft guide (see supersession note)
    felix-alex-story-archive.md            ← full back-catalogue (~85k words)
    felix-alex-story-rankings.xlsx         ← scored evaluations (the diagnosis data)
    shared-canon-story-worlds-and-locations.md
    shared-canon-magic-and-powers-system.md
    shared-canon-villain-roster.md

/stories/                            ← LOCKED, published stories (built into the site)
  bramble-wall/
    book-1.md · book-1.mp3           ← reading version + narration, with frontmatter
  trio-force/
    book-1.md · book-1.mp3           ← Case File #1, reading version + narration, with frontmatter
  some-standalone-story.md
```

Note: the folder is spelled `shared-cannon` (not `shared-canon`) in this repo — kept as-is rather than renamed, since git history and other references may depend on the existing name. There's no separate `/big-list-rewrites/` directory yet; when old-story rewrites need working files (original/ranking-notes/rewrite), create them under `/reference/` following that pattern.

---

## CANONICAL SOURCE-OF-TRUTH RULES (prevent drift)
1. **A series bible is canon for its series.** Bramble Wall's bible and Trio Force's bible each override the general guide where they differ.
2. **`craft-standing-rules.md` overrides the old `generation-guide.md`** where they conflict — specifically the **Felix/Alex braid** (replaces "Felix does / Alex notices") and **true-but-background parents** (replaces the sitcom-dad / tea versions).
3. **Ledgers are the live state.** If prose and ledger disagree, the ledger is checked and reconciled — never claim continuity from memory.
4. **The character directory is PATCHED:** Felix/Alex = the braid; parents = Dad (laid-back enduro rider, espresso, tech/DIY, full bike safety gear) and Magda (UI/UX designer, DJs/dances/exercises, forages); Isla has a documented role (own bike, still learning, wants one like Alex's); Pete added (Dad's riding friend, Isla's dad); **Amelia is patched for Trio Force** — off-screen verifier only, no notebook, no on-scene appearances (see `reference/trio-force/bible.md` PART C §2). Apply this patch to the directory if not already done.
5. **Bramble Wall geography:** front gate → footpath → forest. NO fifteen-acre field / leaning gate / "STARBOARD" (those are wider-universe only). The forest is sparse, rideable, floods for months, bare floor, raised dry areas.
6. **Trio Force case numbering restarted at #1.** Old archive Trio Force stories (colliding numbers, e.g. three different "#33"s) are legacy material — reference by title only, never slot them into the new numbered line. New numbers are assigned in `reference/trio-force/ledgers.md` at lock, never in a draft.

---

## QUICK FACTS (so they're never re-derived wrong)
- **Boys:** Felix & Alex, twins, born 3 March 2021 (5 now).
- **Radios:** Motorola TALKABOUT T82 Extreme. Emergency button = alert tone on all radios, NOT location. Dual power (rechargeable or AA). Works everywhere in this forest (tested).
- **Bramble Wall = grounded, NO magic** (the counterweight to the magic universe). Only permitted uncanny note: the rare, deniable *tock*.
- **Cast ceiling:** 6 speaking characters max per story.
- **Narration:** v2 Multilingual for stories (v3 drifts across sentences). Iterate in text (cheap); narrate once.

---

*Version 1.2. Update this index whenever a new top-level file or series is added.*
