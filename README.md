# Stories

**Site: https://robertbeverton.github.io/Stories/**

The reading and listening app for Felix and Alex's stories. This repo holds the site (layout, styles, player, search, build) and will hold the narration tool. The stories themselves live in one repo per story world and are pulled in at build time:

| World | Repo |
|---|---|
| Isles of Yum | [isles-of-yum](https://github.com/RobertBeverton/isles-of-yum) |
| Bramble Wall, Trio Force and shared-canon standalones | [bramble-wall](https://github.com/RobertBeverton/bramble-wall) |
| Legend Lane (The Staff Room Gods) | [Stories_Gods](https://github.com/RobertBeverton/Stories_Gods) |

## History

This repo started as the original Stories site with its content alongside. The isles-of-yum site was scaffolded from it and then redesigned. That newer UI was split out of isles-of-yum with its history and merged back in here, and this repo's own story content moved to bramble-wall. `git log` and `docs/plans/` cover both lines of UI work.

## How content gets in

`content-sources.json` lists the world repos. `npm run fetch-content` copies each one's `stories/` folder into a local, gitignored `stories/` folder.

- **Locally**, if a source's `localPath` exists (sibling checkouts at `../isles-of-yum`, `../bramble-wall` and `../Gods-PrimarySchool`), it copies from there, so unpushed story edits show up.
- **In CI**, or with no local checkout, it shallow-clones each repo into `.content/<name>/`.

All worlds are merged **flat** into `stories/`, not nested by world. That keeps every story's slug (and so its URL and saved reading progress) exactly as it was before the split. The catch is that two worlds can't ship the same path, so the fetch stops with an error if they do.

`npm run build` and `npm run serve` run the fetch first. `serve` copies a snapshot, so after editing a story re-run it (or `npm run fetch-content`).

A story's audio is its front matter `audioUrl` (an `https://audio.kinly.download/...` link, see [docs/audio-hosting.md](docs/audio-hosting.md)) when present, otherwise the `.mp3` next to it with the same name.

A world repo may also ship `lore/` (one markdown file per entry) via `lorePath` in `content-sources.json`. The Library shows a Lore segment only for a world that has entries. A story can carry `parts: [{title, start}]` (written by the narrator) to power the part list and highlighting.

## Local development

```bash
npm install
npm run serve      # fetch content, then local dev server with live reload
npm run validate   # check story content (missing audio is a warning, not a failure)
npx vitest run     # run the test suite
npm run build      # fetch, validate, contrast checks, icons, build into _site/
```

## Deploying

Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/build.yml`. Pull requests build without deploying. The build also runs nightly. To rebuild when a world repo changes, add the small workflow in [docs/world-repo-dispatch.md](docs/world-repo-dispatch.md) to that repo, or run the workflow by hand from the Actions tab.

## Status

Built on `feature/app-redesign`: Hearth restyle, world switcher and accents, `library.json`, Home, Library and Story from the index, finished, new and end-of-story states, lore pages and part list, CSP and cache-busted modules, Node 24 CI with a nightly build.

Waiting on a human:

- **Device spike** ([docs/spikes/audio-spike.md](docs/spikes/audio-spike.md)). Its result decides the router and persistent player (WP-D), or the fallback of a player on each story page.
- **Narrator run with real audio** on one story (see the audio-pipeline README in Stories_Gods), to produce `parts` and `audioUrl`.
- **Lore text** in the world repos, and the custom-domain decision.

Design, plans and contracts: [docs/plans/](docs/plans/), [docs/contracts.md](docs/contracts.md).
