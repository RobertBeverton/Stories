# Session prompt: build the Stories app redesign

Paste this file's contents (or just: "Read and follow docs/plans/2026-11-03-stories-app-redesign-session-prompt.md") into a new Claude Code session opened in `D:\GitHub\Stories`.

---

You are the **lead** for the Stories app redesign. I authorise you to use subagents (the Agent tool) and git worktrees for the parallel work below.

## Read first, in this order

1. `CLAUDE.md` (project rules: no story text or mp3s in this repo, flat slugs key progress, check `git log` and `docs/plans/` before re-solving a UI problem).
2. `docs/plans/2026-11-03-stories-app-redesign-design.md` (every decision and why; revision 4).
3. `docs/plans/2026-11-03-stories-app-redesign-implementation.md` (waves, file ownership, contracts, acceptance criteria).
4. `.claude/skills/adversarial-review/SKILL.md` (used at the end).

Use the `superpowers:using-git-worktrees`, `superpowers:dispatching-parallel-agents` and `superpowers:verification-before-completion` skills. Do not reopen decisions in the design doc. If you find a real problem with one, stop and report it.

## Operating rules

- Work on branch `feature/app-redesign`, cut from `main`. **Never push, never merge to `main`, never open a PR** unless I say so. Commits on the feature branch and the `wp/*` branches are fine.
- Only the lead edits shared files: `package.json`, `eleventy.config.js`, `site/_includes/base.njk` outside its slots, `CLAUDE.md`, `README.md`, `docs/contracts.md`.
- Each package edits only the files it owns in the implementation plan. If a package needs a change outside its list, it stops and reports it instead of making it.
- Subagents run in `isolation: "worktree"`. Before anything else, each one runs `npm ci` in its worktree and copies the `stories/` folder from `D:\GitHub\Stories\stories` (it is gitignored). **Do not run `npm run fetch-content` inside a worktree**: `content-sources.json` uses `../isles-of-yum`, which resolves wrongly there.
- Cap concurrent subagents at 4 to 5.
- Commit messages end with the attribution line from the harness's system reminder, if one is given.
- Report faithfully. A failing test, a skipped step or a guess is reported as such. Do not claim success without running the acceptance commands and showing their output.
- The ElevenLabs API, Cloudflare, DNS and any paid or outward-facing action are **mine**. Do not call them. WP-F is dry-run and mocked only.
- `D:\GitHub\Gods-PrimarySchool` is not a git repo. Before WP-F edits it, copy `audio-pipeline/` to `audio-pipeline.bak-<date>/`. Edit nothing there except `audio-pipeline/`.
- Worlds' story and lore text stays in the world repos. Do not copy story text into this repo's docs or fixtures (use invented placeholder text in fixtures).

## Order of work

1. **Wave 0, scaffold (you, serial).** Follow "Wave 0" in the implementation plan exactly, including running `npm run fetch-content` once in the main checkout. Commit, and tell me the commit hash.
2. **Wave 1 (parallel).** Launch the packages WP-A, WP-B, WP-C, WP-F, WP-G and WP-S as subagents in a single message (4 to 5 at a time, the rest as slots free up). Give each subagent: its package section from the implementation plan verbatim, the contracts section, the operating rules above, and this report format:
   - What changed (files).
   - Commands run and their real output (tests, build).
   - Deviations from the plan and why.
   - Open questions or anything blocked.
3. **Integration gate (you).** Merge in the order the plan gives, run `npm run build` and `npx vitest run`, write the integration test described in the plan, and fix mismatches at the contract. Show me the results.
4. **Stop and ask me for the spike results** (WP-S, run on my phone and tablet). Tell me exactly what to run and how to merge WP-S so it is deployed. Do not start WP-D until I report. If the spike fails, propose the amended plan instead.
5. **Wave 2.** WP-D (if the spike passed) and WP-E in parallel, same rules.
6. **Final.** Update `CLAUDE.md` and `README.md`, run the `adversarial-review` skill on the merged code (not the plan), summarise findings, and tell me what is left.

## Definition of done for the session

- `npm run build` and `npx vitest run` pass on `feature/app-redesign`, with their output shown.
- Every package's acceptance criteria are met, each with evidence.
- Nothing is pushed, nothing is merged to `main`.
- A short report lists: what shipped, what was deferred, what needs me (spike run, narrator run with real audio, lore text, domain decision).

If anything in these instructions conflicts with the design doc, the design doc wins for decisions and this file wins for how to work. Ask me only when blocked on a decision that is mine.
