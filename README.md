# Story Shelf

**Site: https://robertbeverton.github.io/story-shelf/**

The reading and listening site for Felix and Alex's stories. This repo holds the site only: layout, styles, player, search and the build. The stories live in their own repos and are pulled in at build time.

The code started as the site inside [isles-of-yum](https://github.com/RobertBeverton/isles-of-yum) and was split out with its history, so `git log` and `docs/plans/` still explain why things are the way they are.

## How content gets in

`content-sources.json` lists the story repos. `npm run fetch-content` copies each one's `stories/` folder into a local `stories/` folder, which is gitignored. Everything after that works exactly as it did in isles-of-yum: `stories/some-story.md` plays `stories/some-story.mp3`.

- **Locally**, if a source's `localPath` exists (for example a sibling checkout at `../isles-of-yum`), it copies from there, so unpushed story edits show up.
- **In CI**, or when there's no local checkout, it shallow-clones the repo into `.content/<name>/`.

`npm run build` and `npm run serve` run the fetch first. `serve` copies a snapshot, so after editing a story re-run `npm run serve` (or `npm run fetch-content`) to see the change.

Only one source is supported for now. Adding a second world (for example the Stories repo) needs a decision on where its stories go (such as `stories/<world>/`) and how that changes slugs and URLs.

## Local development

```bash
npm install
npm run serve      # fetch content, then local dev server with live reload
npm run validate   # check story content (missing audio is a warning, not a failure)
npx vitest run     # run the test suite
npm run build      # fetch, validate, contrast checks, icons, build into _site/
```

## Deploying

Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/build.yml`. Pull requests build without deploying. A story repo changing doesn't redeploy the site on its own yet. Run the workflow by hand from the Actions tab, or wire the content repo up to send a `repository_dispatch` event of type `content-updated`.

## Open follow-ups

- **Audio hosting.** The mp3s still come from the content repos' git history (about 200 MB for Isles of Yum). They should move to external storage, and the site should build `audioUrl` from a base URL instead of copying files.
- **Multiple worlds.** Settle the layout for more than one content source, then add the Stories repo.
- **Branding.** The templates still say "Isles of Yum" in the title, heading, search placeholder and media-session artist.
- **Content-triggered rebuilds.** Wire up `repository_dispatch` from the story repos.
