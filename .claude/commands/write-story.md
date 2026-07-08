---
description: Write, review, lock, and produce narration for a new Felix & Alex story from just a title
---

Story title/premise: $ARGUMENTS

Produce this as a complete, locked, narration-ready story for Felix & Alex, following the exact process this repo has already established (see `docs/process/README.md`). Do not re-derive the process from scratch — read the docs below and follow them.

## 1. Read first (in order)
1. `docs/process/README.md` — the index; confirm which read-order path applies.
2. `reference/shared-cannon/shared-canon-character-directory.md` and `reference/shared-cannon/shared-canon-generation-guide.md` — canon, cast, locations, formats.
3. `docs/process/craft-standing-rules.md` — universal rules that override the older generation guide (the Felix/Alex braid, true-but-background parents, etc).
4. `reference/shared-cannon/shared-canon-villain-roster.md` and `shared-canon-magic-and-powers-system.md` if the premise involves a villain or a power.
5. Skim `reference/shared-cannon/felix-alex-story-archive.md` (search, don't read whole — it's ~85k words) only if the premise resembles an existing story, to avoid an accidental duplicate.

**Default home for a new title:** the wider shared-canon universe (magic/Trio-Force allowed — talking creatures, villains, powers), NOT Bramble Wall (that series is grounded/no-magic and already complete at 5/5 locked books). Only use Bramble Wall's world if the title is explicitly a Bramble Wall book (see step 6 for why that needs confirmation).

**Determine standalone vs. series BEFORE drafting:**
- Check `reference/` for a folder matching the premise (e.g. does this title obviously continue an existing series bible?).
- If the premise doesn't name or obviously match an existing series, ASK the user directly: "Is this a standalone story, or book 1 of a new series?" Don't guess silently — series vs. standalone changes the folder structure, frontmatter, and whether a bible/ledger pair must be created. Only skip asking if the user's prompt already says (e.g. "book 2 of the Troll Kingdom series").
- If it's book 1 of a new series, treat `docs/process/personas.md` Panel C (Foundation Panel) + the pre-mortem as a required step BEFORE drafting prose — per `docs/process/README.md`'s "Design a NEW series" path — since a series bible is a foundation document, not just a story.

## 2. Pick the format
Choose per `shared-canon-generation-guide.md`'s format table (Standalone Fantasy Adventure / Trio Force Case File / Character Adventure) based on the premise's shape, and state which you picked and why in one line before drafting.

## 3. Draft
Write the story against: the chosen format's structure and length, `craft-standing-rules.md` in full (want-with-a-cost, one physical object at the centre, the braid, endings with one laugh + one feeling, age calibration, cast ceiling of 6), and relevant canon (villain roster / powers system if applicable). Give Felix and Alex both a want. Don't let the narrator say the quiet part out loud.

## 4. Review — Standard Panel Pass
Run Panel A from `docs/process/personas.md` (Five-Year-Old, Parent, Editor, Historian/World-keeper, Audio Ear) in-character, each giving their sharpest single note. Then run the Orchestrator (`docs/process/review-protocols.md`): sort every note into FIX / MITIGATE / HOLD / ACTIVELY DECIDE, state the bucket + one-line reason for each, and apply only FIX and MITIGATE items.

## 5. Review — Adversarial Pass
Run Panel B (Cynical Editor, Bored Kid, Skeptical Parent, Continuity Auditor). Orchestrate the same way. Take Skeptical Parent and Continuity Auditor notes seriously; resist Cynical Editor's "make it a different story" pressure per the standing principle.

## 6. Lock
Once both passes are orchestrated and fixes applied, treat the prose as LOCKED. Create the story file according to which case applies:

**Case A — standalone (no series):** `stories/<kebab-case-title>.md`. Frontmatter matches `stories/bramble-wall/book-1.md`'s shape (title, description, tags, audio, audioDuration, publishDate — today's date, draft: false) but with no `series`/`seriesOrder` fields.

**Case B — book N of a NEW series (confirmed with user in step 2):**
1. Create `reference/<series-slug>/bible.md` — the frame + slate + rules for this series, modeled on `reference/bramble-wall/bible.md`'s structure (PART A what-the-series-is, PART B survival principles, PART C fixed frame, PART D live dials, PART E slate, PART F ledgers-pointer, PART G open items). This must survive Panel C + pre-mortem (step 3) before it's treated as locked.
2. Create `reference/<series-slug>/ledgers.md` — live state tracker, modeled on `reference/bramble-wall/ledgers.md` (status table, per-book state ledgers for whatever persists across books — den/shelf-equivalent, recurring cast, planted seeds).
3. Create `stories/<series-slug>/book-1.md` (or the correct book number). Frontmatter matches `stories/bramble-wall/book-1.md` exactly, including `series: "<Series Display Name>"` and `seriesOrder: N`.
4. Update `docs/process/README.md`'s FILE MAP and READ-ORDER BY TASK section to add the new series alongside Bramble Wall, so future `/write-story` calls for this series find it.

**Case C — book N of an EXISTING series** (the premise names one, or the user confirms a continuation): read that series' `bible.md` and `ledgers.md` first (ledgers = current state, check before writing), write against the next open slate slot, use the matching `series`/`seriesOrder` frontmatter, and update that series' `ledgers.md` after locking (den/shelf/friction/etc. rows, whatever that series tracks).

**Bramble Wall specifically:** that series is marked complete (5/5 locked) in its own ledger — don't add a 6th book without the user explicitly confirming they want to extend a "finished" series.

## 7. Produce the narration script
Follow `docs/process/narration-production-notes.md`: derive the narration version from the locked reading version (strip audio tags/CAPS/stage directions, keep ellipses/em-dashes/line breaks for pacing), run an Audio Ear pass. Narration scripts live under the top-level `narration/` folder (NOT inside `stories/`), mirroring the same standalone-vs-series structure as `stories/`:
- **Standalone:** `narration/<kebab-case-title>-narration.md`.
- **Series book:** `narration/<series-slug>/book-N-narration.md`.
Never overwrite the reading version in `stories/`.

## 8. Report back
Summarize: format chosen, word count, which panel notes were FIX/MITIGATE/HOLD, file path(s) created, and any ACTIVELY DECIDE items escalated to the user (e.g. Bramble Wall conflict, a canon collision, a tone call only they can make).
