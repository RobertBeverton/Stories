# Stories

**Site: https://robertbeverton.github.io/Stories/**

The reading and listening app for Felix and Alex's stories. This repo holds the site (layout, styles, player, search, build) and the one narration tool that serves every world (`narrator/`). The stories themselves live in one repo per story world and are pulled in at build time:

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

Built on `feature/app-redesign`: Hearth restyle, world switcher and accents, `library.json`, Home, Library and Story from the index, finished, new and end-of-story states, lore pages and part list, a router with a persistent player, dock, player sheet and sleep timer, CSP and content-hashed, cache-busted modules, and Node 24 CI with a nightly build. Unit tests (`npx vitest run`) and the Playwright smoke test (`npm run test:e2e`) both gate the deploy.

The device spike passed on an Android phone (Firefox, installed) and a desktop browser. Not yet run on iOS. The lock-screen title can stay stale on Firefox for Android after next or previous; the player re-sets it after `playing` and this is a browser limitation.

Waiting on a human:

- **Publishing the narrated audio.** A real narrator run on one story worked (parts land within 0.06 s of the spoken heading). `npm run narrate` makes the mp3 and part times, `npm run upload-audio` hosts it on R2 and writes `audioUrl` (see [narrator/README.md](narrator/README.md)).
- **Review of the lore text** in the Stories_Gods repo (branch `wp/lore`), and the custom-domain decision (not recommended: it would reset everyone's saved progress).

Design, plans and contracts: [docs/plans/](docs/plans/), [docs/contracts.md](docs/contracts.md).
