# Adversarial review, round 4: the merged code

Date: 2026-11-03. Target: `feature/app-redesign` after wave 1, the integration gate, WP-E and hardening. Reviewed against the code, not the plan. Written for the repo owner.

## Findings and what was done

| Persona | Finding (evidence) | Result |
|---|---|---|
| Security | No CSP and no `robots.txt` although the design promised both (`base.njk` had only `noindex`) | Fixed: CSP meta with an import-map hash, `robots.txt`, and a test that fails on inline scripts, `on*` handlers, `javascript:` URLs and external references. Verified in a real browser: an injected inline script is blocked |
| Developer | Only `main.js` carried `?v=`; its imported modules did not, so a deploy could mix cached old modules with new `main.js` | Fixed: build-generated import map; verified 19 of 19 module requests versioned (dock excepted, see below) |
| Developer | `library.json` could come from a different build than the page | Fixed: fetched with the page's build id |
| Parent at bedtime | A remembered `stories-world` for a renamed world would filter the Library to nothing | Fixed: unknown world means All, and the key is cleared |
| Author | Front matter `audioUrl` (what the narrator will write) was overwritten with null, so R2 audio would never play | Fixed with origin validation and a warning |
| Integrator | WP-A modules emitted `data-role` hooks while WP-B CSS styled classes; rows lacked the hook search needs | Fixed at integration; an integration test now mounts the real templates in jsdom and lists the only unresolved hooks |
| Integrator | Narrator part titles vs validator headings differed on emphasis | Fixed in the validator, with tests |
| Cold-start executor | Agent worktrees started on the wrong commit and `fetch-content` fails inside them | Handled by prompts; documented in `CLAUDE.md` |
| Child | Row play buttons keep the Play icon in Resume and Play again states; the "All" world tile has no icon; Home heading "Up next" over a "Continue" kicker | Open, cosmetic |
| Accessibility | Not exercised on a screen reader; focus management on navigation does not exist yet because there is no router | Open until WP-D; manual pass needed |
| Content | Lore launches empty, so the Lore code path has only been exercised with throwaway invented entries | Expected |
| Cross-device | Lock-screen and screen-locked behaviour is unverified | Blocked on the spike |

## Pre-mortem (12 months on)

| # | What happened | Early warning | Prevention |
|---|---|---|---|
| 1 | Nightly build silently stopped (60 days of inactivity) and the world-repo dispatch token expired | Library lacks last month's stories | Quarterly check; token expiry on the calendar (`docs/world-repo-dispatch.md`) |
| 2 | A world repo changed `parts` or lore and its stories lost them, unnoticed, because problems only warn | Build log warnings nobody reads | Run `validate-world-data --strict --world <name>` in each world repo's CI |
| 3 | Router shipped on a spike that passed in Safari but not the installed icon | Audio stops after lock | Spike table forces both modes; the kill switch ships with WP-D |
| 4 | Narration re-run re-billed whole stories | Unexpected ElevenLabs invoice | README cost note; do not re-narrate without need; fix the heading-split bug deliberately |
| 5 | Bucket or audio origin changed and the CSP `media-src` blocked playback | Silent player failures | `AUDIO_BASE_URL` is one setting; the CSP test reads it |
| 6 | Stale-module mixes after a deploy | Console errors on old tabs | Import map versions every module; keep new modules inside `site/assets/js/` |
| 7 | Progress reset after a domain move | Complaints about lost places | Decide the custom domain deliberately; the design covers the handoff options |
| 8 | Contracts drifted as packages were added | Hook tests fail | Contracts are machine-checked; change the contract first |

## What is left

1. Run the device spike and report the result (WP-D depends on it).
2. Run the narrator on one story with real audio, then check part starts by ear.
3. Write lore in the world repos, and decide the custom domain.
4. Fix the three cosmetic items above when convenient.
