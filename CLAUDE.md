# Stories

The app for Felix & Alex's stories: static 11ty site (and, soon, the narration
tool), deployed to GitHub Pages at https://robertbeverton.github.io/Stories/
(path prefix `/Stories`, set in `scripts/stories-lib.mjs` and
`eleventy.config.js`).

**This repo has no stories.** `npm run fetch-content` pulls them from the world
repos in `content-sources.json` (`../isles-of-yum`, `../bramble-wall`) into a
gitignored `stories/` folder. Never commit story text or mp3s here. Writing,
canon and process live in each world repo, under its own CLAUDE.md. Keep world
canon out of this repo's docs.

Worlds are merged flat into `stories/` on purpose. Slugs key reading progress
in localStorage (`story-progress:<slug>`) across the whole
robertbeverton.github.io origin, so changing a story's path or filename resets
progress. Don't nest by world without migrating those keys.

`git log` and `docs/plans/` record UI problems already solved, from both the
original Stories site and the isles-of-yum redesigns. Check them before
re-solving something.

```bash
npm install
npm run serve      # fetch content + dev server
npx vitest run     # tests
npm run build      # full build into _site/
```
