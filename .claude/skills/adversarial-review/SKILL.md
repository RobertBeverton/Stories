---
name: adversarial-review
description: Use when a design, plan or spec for the Stories app (or its world repos) needs stress-testing before building. Runs a persona-based adversarial review, then a 12-month pre-mortem, and ends with concrete plan changes. Trigger on "adversarial review", "poke holes", "pre-mortem", or before committing to a design doc.
---

# Adversarial review

Try to break the plan before the code does. Each persona reads the document from one angle and attacks it. The goal is a better plan, not a long list.

## Process

1. **Read the target in full**, plus whatever it depends on. For this project that means the design doc, `CLAUDE.md`, the relevant `site/`, `scripts/` and `docs/` files, and the world repos' `CLAUDE.md` and front matter when the plan touches content. A claim you have not checked against a file or a computed number is a guess: label it, or verify it.
2. **Pick personas.** Use the core set below and add the optional ones that the plan's subject earns. Four to eight is plenty. Skip a persona with nothing to say rather than inventing an attack.
3. **Run each persona.** Two to five points each, specific, tied to a file, a number or a step in the plan. No generic advice.
4. **Check your own earlier advice.** If a previous answer from this session is shaky, say so and correct it. Do not defend earlier recommendations.
5. **Pre-mortem** (below).
6. **Close with changes**: a short numbered list of edits to the plan, ordered by value. Say which findings are new since any earlier round and which earlier findings are now resolved.

Run it inline. Spawn subagents only if the user asks.

## Core personas

| Persona | Lens | Typical attacks |
|---|---|---|
| **Senior UX/UI designer** | Hierarchy, density, navigation stability, states, contrast, tap targets | Stacked fixed bars, shifting nav, duplicate entry points, missing empty, loading, error and finished states, arbitrary accent colours failing contrast |
| **Senior developer** | Build, runtime, tests, failure modes, maintenance | Scripts that don't re-run after a swap, version skew, cache and hashing claims that aren't true yet, no DOM in tests, unvalidated cross-repo contracts, CSP |
| **The child (5 to 6, pre-reader)** | Pictures, big targets, accidents, repetition | Can't read labels, drags sliders, hits nav by mistake, replays the same story, what happens when it ends |
| **Parent at bedtime** | Low light, tired, one hand, bad signal | Offline, which stories are new or finished, accidental external links, filters that block the site, anything that can fail at 7pm |
| **Accessibility user** | Screen reader, low vision, motor, zoom | Focus after route changes, live regions, 200% zoom with fixed bars, slider semantics, reduced motion |
| **Author / maintainer** | Solo workflow across repos | Extra front matter per story, backlog of old stories, three repos to coordinate, time taken from writing |
| **Skeptical product owner** | YAGNI, ordering, value per effort | Does the feature earn its cost? Is the riskiest step first for the least gain? What is the smallest version that delivers the promise? |

## Optional personas

Add when the plan touches the area.

- **Security / privacy reviewer**: public content with real names and ages, `innerHTML`, shared origins, tokens and their blast radius, CSP, external links on a child's device, `noindex` being a request not a lock.
- **Ops / SRE**: single points of failure (domain, DNS, tokens, bucket), expiry, DNS and TLS, rollback, what happens at 7pm when it is down.
- **Content / editorial**: living traditions, tone and age-appropriateness of lore text, canon belonging in the world repos.
- **Cross-device / platform tester**: iOS standalone PWA audio and Media Session quirks, Safari private mode, Android Chrome, the old tablet.
- **Grandparent / relative**: no setup, big text, install prompts, a link someone texts them.
- **Performance**: first load, page weight, audio start latency, slow mobile networks.
- **Migration / data**: what is lost or duplicated in a move, keys, URLs, bookmarks, installed PWAs.
- **Cost / licence**: free-tier limits, narration quota, per-request charges, anything that bills.
- **Future-self at 12 months**: can I still understand and change this?
- **Cold-start executor**: an agent or new session that receives only the plan. Can it act without asking? Are decisions, file ownership, commands, acceptance checks and stop conditions explicit? What happens if it guesses?
- **Integrator / merge owner**: when parts are built in parallel, where do they collide (shared files, contracts that drift, fixtures that go stale, merge order)? What check proves the pieces fit before the next wave?

## Pre-mortem

Assume it is 12 months later and the plan failed. Give six to ten causes, most likely times most painful first, as a table:

| # | What happened | Early warning | Prevention |
|---|---|---|---|

Mix kinds: people and time (burnout, scope creep), technical (breakage, drift), dependencies (expiry, platform changes), data and trust (loss, exposure), and changed circumstances (the audience grows up). End with the prevention items that should become plan changes.

## Output format

1. One line naming the audience, as the user's system prompt requires.
2. Persona sections: heading, then bullets. Bold the claim, then the evidence.
3. "Where my earlier advice was wrong", if anything.
4. Pre-mortem table.
5. "What I'd change in the plan": numbered, concrete, ordered.

## Rules

- Ground every point. Cite a file, a computed number or a step in the plan.
- Be specific about the failure ("the router swaps `#view`, but `resume.js` reads `document.currentScript`") rather than the category ("JS may break").
- Separate verified from assumed. If you assume, say what would verify it.
- Do not pad. A persona with one sharp point beats five soft ones.
- Do not re-litigate decisions the user has made and has the context for. Flag a risk once, state the cheap mitigation, move on.
- Keep canon out: this repo does not hold world lore or story text.
