# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Felix and Alex, two boys in Year 2 (age 6 to 7), listen to and read their own stories on a phone, at any time of day: a run of stories from 6am, or one set playing at bedtime. They are used to screens, read slowly but for themselves, and can already tap play in the story list, type a few letters and pick from a dropdown. The app should help them read more and grow in confidence, and keep working as they get older (a five-year horizon). A parent currently does most of the finding and setup, and the Library is mainly the parent's tool today; children use it more as their reading and typing grow. A parent (the repo owner) sets everything up: writes the stories in world repos, narrates them, and publishes. Other family may occasionally open the unlisted link; no other audience is confirmed.

## Product Purpose

A reading and listening app for original stories written for Felix and Alex. It pulls stories from one repo per story world at build time and serves them as a static site with a persistent audio player, resume-where-you-left-off, sleep timer, part-level reading sync and per-world lore. Success: a child can find a story, start it and keep listening without help, and a parent never has to touch the app to keep it current.

## Positioning

The stories are personal canon: original tales written for two specific children, in persistent shared worlds (Isles of Yum, Bramble Wall, Legend Lane) with their own lore, narrated in a consistent voice. A general audiobook or story app could not truthfully offer that.

## Operating Context

- Content lives in world repos (`../isles-of-yum`, `../bramble-wall`, `../Gods-PrimarySchool`), fetched into a gitignored `stories/` folder. This repo holds no story text or mp3s.
- Narration is produced locally with `narrator/` and hosted on R2 (`audioUrl`); never in CI.
- Deployed to GitHub Pages at https://robertbeverton.github.io/Stories/, rebuilt nightly and on push.
- Progress is per device in localStorage (`story-progress:<slug>`), shared across the whole robertbeverton.github.io origin. No accounts or sync.

## Capabilities and Constraints

- Static 11ty site plus small ES modules; router keeps one persistent `<audio>` and dock alive across navigation.
- Worlds are merged flat into `stories/`; slugs are progress keys, so paths and filenames must not change without migrating keys.
- Public but unlisted: `noindex`, `robots.txt`, no sitemap. CSP with no inline scripts or handlers; system fonts only, no external requests.
- Dark only for v1. Streaming only, no offline. Contracts in `docs/contracts.md` are machine-checked and change before code.
- No raw `innerHTML` with story, library or storage data. Client code reads the base path from `<html data-base>`.
- Terms: world, series, lore, part, Continue, Played lately, New (published in last 14 days, no progress).
- Not yet verified on iOS.

## Brand Commitments

World names, taglines and accent names come from `content-sources.json` and each world's palette entry. World canon and voice live in the world repos, not here. No other brand commitments were stated.

## Evidence on Hand

Real stories exist in three worlds (about 10, 10 and 19 stories). Planning and prior UI solutions are in `docs/plans/` and `git log`. One real narrator run has been verified. No analytics, user testing or testimonials exist; do not invent any.

## Product Principles

- Built for readers: the children read the titles and text themselves, so type, spacing and wording help slow readers and never talk down. No design aimed at pre-readers or toddlers.
- Calm at any hour: nothing autoplays the next story and nothing shouts. Often the phone's screen is off and a story plays to the end through a Bluetooth speaker, so listening must work without looking at the screen.
- Pictures and stories lead; chrome stays out of the way.
- Never lose the listener's place: progress and playback survive navigation and reloads.
- Canon belongs to the world repos; the app presents it and never stores or invents it.

## Accessibility & Inclusion

Body text at least 16px, UI labels at least 12px, targets at least 44px (56px for primary controls such as play), 4.5:1 text and 3:1 non-text contrast enforced by `scripts/check-token-contrast.mjs`, visible focus, reduced-motion honoured, usable at 200% zoom. No further product-specific needs were stated.
