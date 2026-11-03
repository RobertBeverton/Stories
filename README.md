# Stories

**Site: https://robertbeverton.github.io/Stories/**

The reading and listening app for Felix and Alex's stories. This repo holds the site (layout, styles, player, search, build) and will hold the narration tool. The stories themselves live in one repo per story world and are pulled in at build time:

| World | Repo |
|---|---|
| Isles of Yum | [isles-of-yum](https://github.com/RobertBeverton/isles-of-yum) |
| Bramble Wall, Trio Force and shared-canon standalones | [bramble-wall](https://github.com/RobertBeverton/bramble-wall) |

## History

This repo started as the original Stories site with its content alongside. The isles-of-yum site was scaffolded from it and then redesigned. That newer UI was split out of isles-of-yum with its history and merged back in here, and this repo's own story content moved to bramble-wall. `git log` and `docs/plans/` cover both lines of UI work.

## How content gets in

`content-sources.json` lists the world repos. `npm run fetch-content` copies each one's `stories/` folder into a local, gitignored `stories/` folder.

- **Locally**, if a source's `localPath` exists (sibling checkouts at `../isles-of-yum` and `../bramble-wall`), it copies from there, so unpushed story edits show up.
- **In CI**, or with no local checkout, it shallow-clones each repo into `.content/<name>/`.

All worlds are merged **flat** into `stories/`, not nested by world. That keeps every story's slug (and so its URL and saved reading progress) exactly as it was before the split. The catch is that two worlds can't ship the same path, so the fetch stops with an error if they do.

`npm run build` and `npm run serve` run the fetch first. `serve` copies a snapshot, so after editing a story re-run it (or `npm run fetch-content`).

A story's audio is the `.mp3` next to it with the same name (`some-story.md` plays `some-story.mp3`) until audio moves to Cloudflare R2.

## Local development

```bash
npm install
npm run serve      # fetch content, then local dev server with live reload
npm run validate   # check story content (missing audio is a warning, not a failure)
npx vitest run     # run the test suite
npm run build      # fetch, validate, contrast checks, icons, build into _site/
```

## Deploying

Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/build.yml`. Pull requests build without deploying. A world repo changing doesn't redeploy the site on its own yet. Run the workflow by hand from the Actions tab, or have the world repo send a `repository_dispatch` event of type `content-updated`.

## Next up

- **Audio on Cloudflare R2.** One bucket, a folder per world, behind a custom domain. Each story's front matter carries its `audioUrl` and `audioDuration`. A narrator tool in this repo narrates via ElevenLabs at 64 kbps mono, uploads to R2 and writes the URL back. Then strip the mp3s from every repo's history. The bucket, domain, CORS, cache policy and credentials are set up; see [docs/audio-hosting.md](docs/audio-hosting.md).
- **Content-triggered rebuilds** via `repository_dispatch` from the world repos.
- **The new UI design.**
