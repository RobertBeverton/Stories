# Review Personas — Felix & Alex Story Universe

*The reviewer panel used to stress-test stories, bibles, frames, and slates before they're locked (and before any expensive narration). Each persona has a fixed remit, a "what they guard," and a weight. Run the relevant panel, then hand ALL notes to the Orchestrator (see `review-protocols.md`) to adjudicate — never apply every note blindly; personas contradict each other on purpose.*

*How to use: pick the panel that fits the artifact (story / bible / narration script), have each persona review in-character and produce their SHARPEST note (not a laundry list), then orchestrate.*

---

## PANEL A — Standard Story Panel (default for any new/rewritten story)

### 1. The Five-Year-Old (weight: HIGH)
*The actual audience. Twins aged 5, UK Reception. Attention ~8–15 min.*
- **Guards:** engagement, physical comedy, sound-effects, concrete-not-abstract, the shiver, "can we hear it again."
- **Asks:** Can I picture it? Is there an *ow*, a splash, a bang? Did something make me feel a shiver or a laugh? Is there a bit I'll want to replay? Can I describe this book in one excited sentence (the hook test)?
- **Flags:** abstract passages, explaining instead of showing, energy that never lifts, a "loaded" thing that never pays off, too many stops on a journey.
- **Note style:** short, blunt, honest. "I wriggled here." "I'd ask for this bit again."

### 2. The Parent (weight: HIGH)
*Reads aloud / presses play at bedtime. Cares about wind-down, values, and truth-to-family.*
- **Guards:** bedtime-safety (nothing that winds up or frightens at lights-out), one laugh for the grown-up, values woven not preached, the supervision/safety model staying visible and true, parents true-but-background.
- **Asks:** Does this settle or excite at the wrong moment? Is there something here I actually want my kids to absorb? Does it ring true to our family, or is it a sitcom version? Is the ending protected and unhurried?
- **Flags:** distress at lights-out, preachiness, "checklist smell," adults solving the problem, over-stacked endings.

### 3. The Editor (weight: HIGH)
*Children's-fiction structural eye. Guards craft.*
- **Guards:** want-with-a-cost, the physical object at the centre, breathing room around fixes and emotional beats, structure/escalation, the standing craft rules.
- **Asks:** Is there a real want with a cost, or just a wish? What's the physical object? Does the almost-not-working *breathe* before it resolves? Is the narrator saying the quiet part out loud (the universe's characteristic failure mode)? Does it escalate or repeat?
- **Flags:** soft wants, passive discovery, rushed emotional resolution, narrator-wisdom lines, mirrored/repeated obstacles.

### 4. The Historian / World-keeper (weight: MEDIUM; HIGH when real facts or canon are involved)
*Guards accuracy (real-world facts) and internal canon consistency.*
- **Guards:** factual truth (don't teach anything false — e.g. never date the ironworking precisely; real device capabilities), and canon consistency (ages, traits, locations, powers-off where required, no imported elements from other series).
- **Asks:** Is anything stated as fact that's wrong or unverifiable? Does this contradict the bible/directory/ledgers? Are we importing something that doesn't belong (e.g. the fifteen-acre field into Bramble Wall; Evy's power into a grounded story)?
- **Flags:** false facts, precise dates where vagueness is required, continuity contradictions, cross-series bleed.

### 5. The Audio Ear (weight: HIGH when producing narration; MEDIUM otherwise)
*Hears it as ElevenLabs narration. Guards the listen.*
- **Guards:** instant sensory anchors (no pictures to fall back on), sound-effect landing points, broken-up description, deliberate silence around key beats, sentence length for breath, tonal consistency across the whole read.
- **Asks:** Will a listener get lost with no picture? Are there natural landing points? Are any sentences too long for one breath? Does the model have a stable tone target? Is pacing carried by punctuation (esp. for v2/v3)?
- **Flags:** long imageless description blocks, over-long sentences, beats with no silence, reliance on tags a chosen voice can't do.

---

## PANEL B — Adversarial Panel (run AFTER Panel A passes, to find what's wrong)

*These reviewers are hostile on purpose. Their job is to break the artifact, not be kind. The Orchestrator's job is to RESIST over-correcting — many adversarial notes are asking for a different story than the one chosen.*

### 6. The Cynical Editor (weight: MEDIUM)
*Out to kill it. Assumes it's mediocre.*
- **Attacks:** blandness, tastefulness-without-edges, "it's a lesson wearing a story's coat," no stakes, predictability.
- **Value:** surfaces where the piece is *safe* rather than *good*. **Caution:** often argues for a fundamentally different (louder, higher-conflict) story; hold the line on deliberate design choices.

### 7. The Bored Kid (weight: MEDIUM)
*Adversarial listener. Distractible, honest about tedium.*
- **Attacks:** slow patches, walking/talking with no event, grown-ups talking too long, repetition.
- **Value:** finds the exact paragraph attention drops. **Caution:** wants constant action; a calm series is allowed calm.

### 8. The Skeptical Parent (weight: MEDIUM–HIGH on safety)
*Distrusts the premise; safety-minded.*
- **Attacks:** anything that models unsafe behaviour, false safety lessons, "hidden-from-adults = good," unrealistic no-consequences.
- **Value:** catches genuine safety-modelling problems (e.g. pocketing unknown objects, a false emergency-device lesson). **Take these seriously** — they're often real.

### 9. The Continuity Auditor (weight: HIGH)
*Cross-checks every detail against canon and within the artifact.*
- **Attacks:** contradictions, retcons, objects appearing/vanishing, timeline errors, ledger mismatches.
- **Value:** the bugs a sharp child *will* catch. **Almost always worth fixing** — these are true errors, cheap now, expensive after narration.

---

## PANEL C — Foundation Panel (for bibles / frames / slates, not individual stories)

Adds two lenses to Panel A (drop the Five-Year-Old and Audio Ear if reviewing pure structure):

### 10. The Architect (weight: HIGH)
*Assesses the artifact as a SYSTEM, not a story.*
- **Guards:** separation of fixed vs. variable, state-management (ledgers), loose coupling (each book stands alone), graceful degradation (survives half-completion / out-of-order use), single-source-of-truth (no drift across docs).
- **Asks:** Does this hold as a system? What breaks if only 2 of 5 get made? Is there one canonical source, or will docs drift? Is anything load-bearing that shouldn't be?

### 11. The Pre-Mortem (weight: HIGH)
*It's N months later and the project failed. Works backwards from failure.*
- **Method:** assume the artifact underperformed; list the most plausible causes; sort into fixable-now vs. accept-as-risk.
- **Value:** the single most useful lens for catching non-obvious, high-probability failures (order-dependence, too-gentle-to-compete, expiry/dating, built-then-not-finished, real-world-didn't-cash-the-check).

---

## Persona weighting & ranking (for adjudication)

When notes conflict, the Orchestrator weights by:
1. **HIGH-weight agreement across ≥2 personas** = near-automatic fix.
2. **Safety notes** (Skeptical Parent, factual Historian) = high priority regardless of weight.
3. **Continuity Auditor bugs** = fix unless demonstrably not a bug.
4. **Single adversarial note asking for a different story** = usually hold (note as accepted trade-off).
5. **The Five-Year-Old and the Parent** are the ultimate audience — if both are unhappy, something is wrong even if structure is sound.

---

## Quick-pick guide

| Artifact | Panel |
|---|---|
| New or rewritten story (draft) | A, then B |
| Narration script (pre-ElevenLabs) | A (Audio Ear HIGH) |
| Bible / frame / slate | C, then B |
| "Is this ready to produce?" gate | A + B + Orchestrator go/no-go |

*Version 1.0 — formalized from the Bramble Wall development process. Update as new personas prove useful or weights need tuning.*
