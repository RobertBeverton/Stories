# Story Shelf

The site (UI and build) for Felix & Alex's stories. Static 11ty, deployed to
GitHub Pages at https://robertbeverton.github.io/story-shelf/ (path prefix
`/story-shelf`, set in `scripts/stories-lib.mjs` and `eleventy.config.js`).

**This repo has no stories.** They're pulled in from the repos listed in
`content-sources.json` by `npm run fetch-content` into a gitignored `stories/`
folder. Never commit story text or mp3s here. Story writing, world canon and
narration live in the content repos (e.g. `../isles-of-yum`) and their own
CLAUDE.md files.

History was split out of isles-of-yum with `git filter-repo`, so earlier
commits and `docs/plans/` are the record of UI problems already solved. Check
them before re-solving something.

```bash
npm install
npm run serve      # fetch content + dev server
npx vitest run     # tests
npm run build      # full build into _site/
```

Story/audio convention (inherited): `stories/x.md` plays `stories/x.mp3` from
the same folder by default.
