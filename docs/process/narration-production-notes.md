# Narration Production Notes — ElevenLabs

*Hard-won knowledge about turning a locked story into audio. This is expensive knowledge (paid in credits and trial-and-error) — never re-learn it. Read before generating any audio.*

---

## Model choice: v2 Multilingual is the current default for story narration

**Use Eleven v2 Multilingual (studio-quality) for full-story narration.** It gives a **steady, consistent voice across a whole story** — the thing that matters most for a continuous 1,500–2,500-word read.

**Why NOT v3 (currently):** v3 is the expressive/experimental model. Because it's more "creative," when the studio generates sentence-by-sentence (or chunk-by-chunk), **each chunk re-interprets the emotional context independently and the tone/emphasis DRIFTS between adjacent sentences.** For long continuous narration this inconsistency is worse than v2's stable-but-flatter read. (Tested and confirmed on Bramble Wall Book 1.)

**When v3 might still be worth it:** short, single-shot, punchy clips where per-line expressiveness matters more than cross-passage consistency. Not full stories. If you ever want v3's expressiveness back on long text, the only mitigations are:
- **Stability: Robust** — much more consistent, but barely responds to tags (loses the point), or
- **Generate the whole story in one pass** — reduces drift but risks other instability on long text.

Keep a v3-tagged version of each story parked in case ElevenLabs improves v3 consistency later — but produce from v2 for now.

---

## Writing for v2 (what to keep, what to strip)

**STRIP:** all `[audio tags]` (`[whispers]`, `[excited]`, etc.) — v2 doesn't support them; it ignores or mispronounces them.

**KEEP (v2 responds to all of these — they're your real control surface):**
- **Ellipses (…)** — pauses and weight. Your MAIN pacing tool.
- **Em-dashes (—)** — shorter breaks, rhythm.
- **Sentence length** — short sentences = staccato/tension; longer = flow.
- **Paragraph/line breaks** — the *tock* eeriness comes from short lines + spacing, not a tag.

**CONVERT:**
- **CAPS → italics (or remove).** v2 can over-stress or spell out fully-capitalised words. Use *italics* for emphasis, or let sentence structure carry it. Add emphasis in Studio (bold/highlight) rather than CAPS in the text.
- **"He said quietly" stage directions → let the punctuation/voice do it.** Don't bake delivery instructions into prose that will be read aloud verbatim.

---

## Writing for v3 (if/when used) — reference only

- Tags go on the narrator's delivery, within the chosen voice's range (a gentle voice won't `[shout]`).
- **Sparse tagging** — over-tagging causes speed-ups/artifacts. ~1 tag every few paragraphs, at beats that matter.
- No `<break>` tags in v3 — use ellipses/punctuation/structure.
- Stability: **Natural** (balanced) or **Creative** (livelier, wanders more). Robust kills tag response.
- If a tag word gets *spoken* instead of performed, delete that tag — punctuation still carries the beat.
- Sound-effect tags (`[thunder]` etc.) are experimental and voice-dependent — prefer post-production SFX.

---

## Production workflow (both models)

1. **One voice, one settings profile, for the whole book.** Consistency is the goal.
2. **Generate per scene-break (`---`), not one giant call.** More stable; lets you re-roll a single weak section without redoing everything. Stitch in Studio.
3. **Sound effects (rain, thunder, radio static) → layer in POST-PRODUCTION** over the finished narration. Cleaner and more reliable than asking the model, and won't destabilise the voice.
4. **Pronunciation:** if a word/name reads wrong, use a pronunciation dictionary (Studio) or phonetic respelling. (v3 supports IPA in /slashes/; v2 uses CMU Arpabet phoneme tags or alias/respelling.)
5. **Keep two files per story:** the clean *reading version* (for reading aloud yourself) and the *narration version* (model-specific). Don't narrate from the reading version.

---

## Device / world facts that must stay true in narration

- **The radios are Motorola TALKABOUT T82 Extreme.** Real capabilities: PMR446 licence-free, IPx4 weatherproof, 16 channels + 121 privacy codes, dual power (AA alkaline OR rechargeable NiMH, USB charge), LED torch, vibrate alert, up to 10km range (best-case, open ground). **Emergency button = loud alert tone on all paired radios; does NOT transmit location.** So the safety lesson is always *press-then-say-where-you-are*. Never imply it locates them.
- Don't voice anything that contradicts a series bible's established facts (check the relevant bible first).

---

## Cost note
Roughly £11 / 105k tokens; a ~1,500-word story ≈ 6,000 tokens. So a full 5-book set ≈ ~30k tokens of narration. **Cost is not the constraint — getting the script right before generating once is.** Do all iteration in text (cheap) and narrate each locked story a single time.

*Version 1.0 — from Bramble Wall Book 1 production.*
