# Offline listening: design

Date: 2026-11-12. Status: approved in conversation, not yet built.

## Goal

Let the kids' tablets (two Samsung Galaxy Tab A9, Chrome on Android) play stories with no network, for example on a flight. The user can save one story, several stories, a whole world, or everything. The app checks free space on the device and shows the size of what is selected and what is already saved. The UI follows the Hearth design system (`DESIGN.md`): dark only, system fonts, 4.5:1 text and 3:1 control contrast, 44px touch targets.

Budget: about 2 GB. The library is 48 narrated stories, about 25 hours, roughly 1.5 GB in full (estimate at about 1 MB per minute).

## Decisions

- **Storage:** service worker plus Cache API. The persistent `<audio>` element, router and dock are unchanged. OPFS with blob URLs and plain file downloads were rejected: they need a second storage system or leave the app.
- **Management UI:** a dedicated Offline page in the nav, plus a per-story button on story pages, a Saved filter chip and a Saved badge in the Library.
- **Platform:** Chrome on Android only. No iOS-specific work.

## Architecture

- `site/sw.js`, emitted at the site root so its scope is `/Stories/`. The build injects the build id (content hash) and the shell file list.
  - Shell cache `shell-<buildId>`: pages, CSS, JS modules, import map, `library.json`, icons. Precached on install, old caches deleted on activate. A rebuild with no changes keeps the same id, so nothing re-downloads.
  - Navigation: network first with a short timeout, falling back to the cached page.
  - Audio cache `audio-v1` (not tied to the build id): one entry per story, keyed by the exact `audioUrl` including `?v=`. A re-narration changes the URL, so a saved story shows "Update available".
  - Audio requests for a saved URL are answered from the cache, including `Range` (a 206 slice) so seeking and resuming work. Anything else goes to the network.
- `site/assets/js/offline.mjs`: client store (save, remove, list, size estimates, storage checks). Emits `stories:offline {slug}` on `document`.
- `site/assets/js/offline-page.mjs` (`data-mount="offline-page"`): the Offline page.
- A button module for story pages ("Save for offline"). Library filter chip and card badge.
- Registration in `main.js`, using `<html data-base>`, never `/Stories`.
- Contracts first: a new section in `docs/contracts.md` (cache names, key format, events, `audioBytes`). CSP gains `worker-src 'self'`.
- R2 bucket gets a CORS rule so audio can be fetched with `mode: cors`. Cached opaque cross-origin responses are padded to about 7 MB each in Chrome, which would break the size meter and eat quota.

## Sizes and storage checks

- `library.json` gets `audioBytes` per story. `upload-audio` records the byte size in front matter beside `audioDuration`; the schema and `world-data` carry it. Stories without it fall back to duration x 16 KB/s, shown with "~".
- `navigator.storage.estimate()` supplies quota and usage. Before a save the app compares the selected total with free space plus a 10% margin. The first save calls `navigator.storage.persist()`.
- If the selection does not fit, Save is disabled and the meter says why ("Needs 1.4 GB, 900 MB free").

## Offline page

- Meter at the top: "Saved on this tablet 620 MB, 1.1 GB free", with a bar.
- An "Everything" row with the total size, Save all, and Remove all once anything is saved.
- One row per world: accent icon, "12 of 20 saved, 310 MB", Save or Remove. Expanding shows its stories as a checklist: title, size, state (Not saved, Saving 40%, Saved, Update available).
- Ticking stories shows a sticky bar, "Save 6 stories, 240 MB", with the space check.
- Downloads run one at a time with one overall progress bar and Cancel. A story is marked saved only when complete. Failures show Retry. Downloads pause when the tablet goes offline.
- Removing a world or everything asks for confirmation.

## Story page and Library

- Story page: a quiet "Save for offline, 28 MB" button under Play with the same states.
- Library: "Saved" filter chip, badge on saved cards. Offline, unsaved stories are dimmed and tapping one says "Not saved on this tablet".

## Edge cases

- Interrupted download: nothing is cached until complete; the Offline page shows the state on reopen and retries.
- Update: fetch the new file first, delete the old one after it succeeds.
- Eviction: on open, reconcile the cache against the saved list and drop missing entries so the UI never claims a story that is gone.
- Progress and the sleep timer are client-side localStorage and are unaffected. Keys unchanged.
- Kill switch: replacing `sw.js` with a stub that unregisters itself returns the site to normal.

## Testing

- Vitest and jsdom: size maths, space check and margin, selection totals, Range slicing in the worker with an injected cache, staleness by `?v=`, contract and schema checks for `audioBytes`.
- Playwright e2e (gates deploy in `build.yml`): save a story, go offline, reload, play and seek, remove.
- `scripts/check-token-contrast.mjs` covers any new tokens.
- Manual A9 checklist: install, save two stories, airplane mode, seek, lock the screen, reopen.

## Rollout

1. R2 CORS rule via the `cf` CLI.
2. Contracts and `audioBytes` in narrator/upload; back-fill the 48 stories from bucket object sizes (no re-narration).
3. Service worker and client store.
4. Offline page, story button, Library chip and badge.
5. Deploy and test on the tablets at home before the flight.

## Out of scope

iOS support, background sync, automatic downloads, text-only offline reading beyond what the shell cache already gives.
