# Stories

A small family project: a static site for hosting original children's stories as text and ElevenLabs-narrated audio, with search, series navigation, and resume-from-where-you-left-off for both reading and listening.

**Live site:** https://robertbeverton.github.io/Stories/

## What this is

Built for reading (and listening) to bedtime stories on a phone or PC — pick a story, either read it or tap play and have it narrated, and pick up right where you left off next time. The library groups stories into series, each with its own accent color, and every card has an always-visible Play button so starting a story never takes more than one tap.

## How it's built

- **[11ty](https://www.11ty.dev/)** static site generator — no server, no database, just markdown in, HTML out.
- Stories live as markdown files with frontmatter (title, series, description, audio file, publish date) under `stories/`.
- Audio is narrated via [ElevenLabs](https://elevenlabs.io/) and committed alongside each story.
- Reading/listening progress is tracked client-side in `localStorage` — nothing is sent to a server.
- Deployed automatically to GitHub Pages on every push to `main` via GitHub Actions.

## Interesting bits

- **Per-series accent colors** are deterministically derived from the series name (hashed into a small, pre-vetted palette), so new series automatically get a distinct look without any manual color-picking, and every pairing is checked for WCAG AA contrast in both light and dark mode.
- **A cross-page "mini-player" bar** simulates continuous playback across a fully static, multi-page site — there's no single-page app here, so it hands off player state through `localStorage` between page loads instead of holding audio in memory.
- **Tapping a card's Play button vs. its title** are two independent, non-nested click targets — an early version accidentally nested them, which browsers silently "fix" by breaking the DOM structure, so this was rebuilt and verified against the real rendered output rather than just the template source.
- Content is validated on every PR (required frontmatter, duplicate slugs, matching audio files, repo size) before it's allowed to merge.

## Writing workflow

Story drafting, review, and canon/lore reference docs live under `docs/process/` and `reference/` — see [docs/process/README.md](docs/process/README.md) for the full index. These are working notes, never built into the site.

## Local development

```bash
npm install
npm run serve     # local dev server with live reload
npm run validate   # check story content for common mistakes
npx vitest run     # run the test suite
```
