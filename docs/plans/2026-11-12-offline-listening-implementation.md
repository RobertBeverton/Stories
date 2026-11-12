# Offline Listening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the kids' Samsung Galaxy Tab A9s (Chrome) play saved stories with no network: save one story, several, a world, or everything, with a free-space check and size totals, on a new Offline page.

**Architecture:** A module service worker (`sw.js`, logic in `site/assets/js/sw-logic.mjs`) caches the app shell and serves saved mp3s from the Cache API with Range support. A client store (`offline.mjs`) downloads audio with CORS `fetch`, keeps a localStorage index and runs one download job at a time. UI modules (`offline-save`, `offline-page`) and a Library "Saved" filter sit on top. `library.json` gains `audioUrl` and `audioBytes` so the client can plan sizes and bulk saves. Design: `docs/plans/2026-11-12-offline-listening-design.md`.

**Tech Stack:** 11ty 3, ES modules (no bundler), Vitest (node and jsdom), Playwright (Chromium), Cloudflare R2 (CORS rule via the `cf` CLI).

**Working directory:** `d:\GitHub\Stories\.claude\worktrees\offline-listening` (branch `feature/offline-listening`). `stories/` and `lore/` are already copied in. Do not run `fetch-content` here. Commit messages end with:
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

**Ground rules from CLAUDE.md:** contracts first (`docs/contracts.md`, schema, fixtures, `test/contracts.test.mjs`), no `innerHTML` with story/library/storage data, client code reads the base path from `<html data-base>` (`basePath()` in `dom.mjs`), no inline scripts, system fonts, Hearth tokens only (no new colours, so the contrast checks keep passing), 44px targets (`--tap`).

**Test commands:** `npx vitest run` (all unit/jsdom), `npx vitest run <file>` (one), `npm run test:e2e` (Playwright; the fixture site is built by `test/e2e/support/`).

---

## Task 0: Ask before touching R2 (no code)

The R2 CORS rule changes the live audio bucket. **Ask the user before running it.** Do it any time before Task 15's device test, but it must be live before the feature works in production.

- Needed because saving audio uses `fetch(audioUrl, { mode: "cors" })`. Without CORS the fetch fails, and an opaque (no-cors) cached response would count as about 7 MB each in Chrome's quota.
- Per the user's global instruction use the `cf` CLI (it needs the nvm Node 22 binary, see memory `cf-cli-needs-node22`). Find the exact command with `cf cli search "r2 cors"` and `cf schema`; do not guess flags.
- Bucket `stories-audio`. Rule to apply:

```json
[
  {
    "AllowedOrigins": ["https://robertbeverton.github.io"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["range"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

- Verify afterwards: `curl -sI -H "Origin: https://robertbeverton.github.io" "https://audio.kinly.download/isles-of-yum/marzipans-well.mp3?v=1b1eb345"` must show `access-control-allow-origin: https://robertbeverton.github.io`. If the custom domain caches an earlier response without the header, say so and ask before purging anything.

---

## Task 1: Contract first

**Files:**
- Modify: `docs/contracts.md`
- Modify: `scripts/schema/library.schema.json`
- Modify: `test/fixtures/library.json`
- Modify: `test/contracts.test.mjs`

**Step 1: Write the failing test** (append inside `describe("library.json contract", ...)` in `test/contracts.test.mjs`)

```js
  it("accepts audioUrl and audioBytes on a story", () => {
    const lib = json("library.json");
    lib.stories[0].audioUrl = "https://audio.example/test-world/first-tale.mp3?v=abc";
    lib.stories[0].audioBytes = 9_600_000;
    expect(checkLibrary(lib).ok).toBe(true);
  });

  it("rejects a zero, fractional or text audioBytes", () => {
    for (const bad of [0, 1.5, "9", -4]) {
      const lib = json("library.json");
      lib.stories[0].audioBytes = bad;
      expect(checkLibrary(lib).ok).toBe(false);
    }
  });
```

**Step 2:** `npx vitest run test/contracts.test.mjs` → FAIL (unknown fields rejected).

**Step 3: Implement**

In `scripts/schema/library.schema.json`, inside `definitions.story.properties` add after `"url"`:

```json
        "audioUrl": { "type": "string", "minLength": 1 },
        "audioBytes": { "type": "integer", "minimum": 1 },
```

In `test/fixtures/library.json` give the first two stories audio fields (keep the rest unchanged; the fixture is shared, so also check nothing else asserts equality on it):

```json
      "audioUrl": "https://audio.example/test-world/first-tale.mp3",
      "audioBytes": 9600000,
```
(after `"url"` of `test-world/first-tale`) and
```json
      "audioUrl": "https://audio.example/test-world/second-tale.mp3",
```
(after `"url"` of `test-world/second-tale`, no `audioBytes`, so the estimate path is exercised). The `lone-tale` story gets neither (no audio).

In `docs/contracts.md`:

- Section 1, `stories[]` line: append "optional `audioUrl` (the file the player plays; https on the audio origin, or the site's own mp3 path) and optional `audioBytes` (whole bytes of that file, from front matter)."
- Section 3 names list: add `offline-save`, `offline-page`.
- Section 4 events: add "`stories:offline` `{slug}` (a story was saved, removed or updated for offline; `slug` is `null` for a bulk change)".
- Section 5 front matter: add "Story: optional `audioBytes: <whole bytes>` beside `audioDuration`, written by `upload-audio`."
- Add a new section before "Test conventions":

```markdown
## 9. Offline listening

Design: [plans/2026-11-12-offline-listening-design.md](plans/2026-11-12-offline-listening-design.md).

- **Service worker** `<base>/sw.js` (module worker, scope `<base>/`), logic in `site/assets/js/sw-logic.mjs`
  and `offline-core.mjs`. Registered by `offline-register.mjs` from `main.js`. Kill switch:
  `?sw=off` (sets `localStorage["stories-sw"]="off"`, unregisters) and `?sw=on`.
- **Caches.** `shell-<buildId>`: pages, CSS, modules, `library.json`, saved story pages; old ones are deleted
  on activate. `audio-v1`: one entry per saved story, keyed by the exact `audioUrl` string including `?v=`;
  never versioned by build.
- **Index.** `localStorage["stories-offline"]` = `{ "<slug>": { url, bytes, savedAt } }`. `url` is the
  `audioUrl` that was saved; a story whose current `audioUrl` differs is "stale" (update available).
  The index is advisory: `reconcile()` drops entries whose cache entry is gone and re-adopts cache entries.
- **Audio is fetched with CORS** (`fetch(audioUrl, {mode: "cors"})`), so the R2 bucket needs the CORS rule in
  `docs/audio-hosting.md`. The CSP allows the audio origin in `connect-src` and `media-src`.
- **Sizes.** `audioBytes` when present, else `durationSec` x 16000 bytes, shown with "~".
- **Space check.** Free = `quota - usage` from `navigator.storage.estimate()`; a save needs `bytes x 1.1`
  to fit. `navigator.storage.persist()` is requested on the first save.
- **Downloads** run one job at a time, one story at a time; a story is cached only when complete.
```

**Step 4:** `npx vitest run test/contracts.test.mjs` → PASS. Run `npx vitest run` fully → still green (the fixture change must not break other tests; fix any test that depended on the exact fixture).

**Step 5: Commit**
```bash
git add docs/contracts.md scripts/schema/library.schema.json test/fixtures/library.json test/contracts.test.mjs
git commit -m "Offline: contract for audioUrl, audioBytes and the offline section" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 2: `library.json` carries `audioUrl` and `audioBytes`

**Files:**
- Modify: `scripts/world-data.mjs` (`sanitizeWorldData`, `buildLibrary`)
- Create: `scripts/world-data.offline.test.mjs`

`computeStories` already spreads front matter (`...data`), so `audioBytes` reaches `buildLibrary` unchanged, and `audioUrl` is already computed there.

**Step 1: Write the failing test** `scripts/world-data.offline.test.mjs`

```js
import { describe, expect, it } from "vitest";
import { buildLibrary, sanitizeWorldData } from "./world-data.mjs";
import { computeStories } from "./stories-lib.mjs";
import { checkLibrary } from "./schema/validate.mjs";

// Invented placeholder data only.
const source = { name: "alpha", title: "Alpha", tagline: "Invented.", accent: "sage", icon: "sun" };
const raw = (data) => ({ file: "stories/one.md", data: { title: "One", publishDate: "2026-10-01", ...data }, content: "Words." });
const run = (data) =>
  sanitizeWorldData({ rawStories: [raw(data)], manifest: { "one.md": "alpha" }, worldNames: ["alpha"], loreFiles: [] });

describe("audioBytes", () => {
  it("is kept when it is a positive whole number", () => {
    expect(run({ audioBytes: 9_600_000 }).rawStories[0].data.audioBytes).toBe(9_600_000);
  });

  it.each([0, -5, 1.5, "9", null])("is dropped with a warning when it is %s", (bad) => {
    const result = run({ audioBytes: bad });
    expect(result.rawStories[0].data.audioBytes).toBeUndefined();
    expect(result.warnings.some((w) => /audioBytes/.test(w.message))).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("buildLibrary audio fields", () => {
  const stories = (data) =>
    computeStories(sanitizeWorldData({ rawStories: [raw(data)], manifest: { "one.md": "alpha" }, worldNames: ["alpha"], loreFiles: [] }).rawStories);

  it("emits audioUrl and audioBytes and still validates", () => {
    const library = buildLibrary({
      stories: stories({ audioUrl: "https://audio.kinly.download/alpha/one.mp3?v=abc", audioBytes: 123456, audioDuration: 60 }),
      sources: [source],
      lore: [],
    });
    expect(library.stories[0].audioUrl).toBe("https://audio.kinly.download/alpha/one.mp3?v=abc");
    expect(library.stories[0].audioBytes).toBe(123456);
    expect(checkLibrary(library).ok).toBe(true);
  });

  it("omits both when the story has no audio", () => {
    const library = buildLibrary({ stories: stories({}), sources: [source], lore: [] });
    expect("audioUrl" in library.stories[0]).toBe(false);
    expect("audioBytes" in library.stories[0]).toBe(false);
  });
});
```

**Step 2:** `npx vitest run scripts/world-data.offline.test.mjs` → FAIL.

**Step 3: Implement** in `scripts/world-data.mjs`.

In `sanitizeWorldData`, in the per-story loop right after the `audioUrl` check:

```js
    if (s.data.audioBytes !== undefined && !(Number.isInteger(s.data.audioBytes) && s.data.audioBytes > 0)) {
      warn("audioBytes ignored: must be a whole number of bytes, 1 or more");
      delete s.data.audioBytes;
    }
```

In `buildLibrary`, in the story object after `publishDate: isoDate(s.publishDate),`:

```js
      ...(typeof s.audioUrl === "string" && s.audioUrl ? { audioUrl: s.audioUrl } : {}),
      ...(Number.isInteger(s.audioBytes) && s.audioBytes > 0 ? { audioBytes: s.audioBytes } : {}),
```

**Step 4:** `npx vitest run scripts/` → PASS.

**Step 5: Commit** `"Offline: library.json carries audioUrl and audioBytes"`.

---

## Task 3: `upload-audio` records `audioBytes`

**Files:**
- Modify: `scripts/upload-audio.mjs` (`updatedStoryText`)
- Modify: `scripts/upload-audio.test.mjs`

**Step 1: Write the failing test** (add to `scripts/upload-audio.test.mjs`, inside the existing `describe` that already imports `run`; also extend the existing `--apply` test's assertions)

```js
  it("--apply also writes the file size as audioBytes", async () => {
    const client = { isUploaded: vi.fn(async () => false), upload: vi.fn(async () => {}) };
    await run(["--apply", "--story", "one"], { ...out(), sources: [source], client });
    const written = fs.readFileSync(fileOf("one.md"), "utf8");
    expect(written).toContain(`audioBytes: ${fs.statSync(fileOf("one.mp3")).size}`);
  });
```
(`fileOf`, `out`, `source` already exist in that file's setup; use the same names as the neighbouring tests.)

**Step 2:** run it → FAIL.

**Step 3: Implement.** In `updatedStoryText`:

```js
export function updatedStoryText(raw, item) {
  let next = setFrontMatterField(raw, "audioUrl", item.url);
  next = setFrontMatterField(next, "audioDuration", item.durationSec);
  next = setFrontMatterField(next, "audioBytes", item.bytes);
  return next === raw ? null : next;
}
```
(`item.bytes` is already set in `planWorld`.) Also update the header comment and `narrator/README.md` line that lists the fields written (grep for `audioDuration` in both) to say `audioUrl`, `audioDuration` and `audioBytes`.

**Step 4:** `npx vitest run scripts/upload-audio.test.mjs` → PASS (the existing "second run changes nothing" test still passes because the write is idempotent).

**Step 5: Commit** `"Offline: upload-audio writes audioBytes"`.

---

## Task 4: Back-fill `audioBytes` for the 48 hosted stories

**Files:**
- Create: `scripts/backfill-audio-bytes.mjs`
- Create: `scripts/backfill-audio-bytes.test.mjs`
- Modify: `package.json` (script `backfill-audio-bytes`)

The hosted files are only in R2 (no local mp3s), so read each size from a HEAD request to its public `audioUrl`.

**Step 1: Write the failing test**

```js
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planBackfill, run } from "./backfill-audio-bytes.mjs";

// Invented placeholder stories.
function world() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-"));
  const stories = path.join(dir, "stories");
  fs.mkdirSync(stories);
  const write = (name, text) => fs.writeFileSync(path.join(stories, name), text);
  write("has.md", "---\ntitle: A\naudioUrl: https://audio.kinly.download/w/has.mp3?v=1\naudioBytes: 5\n---\nBody\n");
  write("needs.md", "---\ntitle: B\naudioUrl: https://audio.kinly.download/w/needs.mp3?v=2\naudioDuration: 60\n---\nBody\n");
  write("silent.md", "---\ntitle: C\n---\nBody\n");
  return { dir, source: { name: "w", localPath: dir, storiesPath: "stories" } };
}

describe("planBackfill", () => {
  it("lists only stories with an audioUrl and no audioBytes", () => {
    const { source } = world();
    expect(planBackfill(source).map((i) => i.rel)).toEqual(["needs.md"]);
  });
});

describe("run", () => {
  it("dry run changes nothing", async () => {
    const { source, dir } = world();
    const head = vi.fn(async () => 777);
    expect(await run([], { log: () => {}, error: () => {}, sources: [source], head })).toBe(0);
    expect(fs.readFileSync(path.join(dir, "stories", "needs.md"), "utf8")).not.toContain("audioBytes");
  });

  it("--apply writes audioBytes from the HEAD size", async () => {
    const { source, dir } = world();
    const head = vi.fn(async () => 777);
    expect(await run(["--apply"], { log: () => {}, error: () => {}, sources: [source], head })).toBe(0);
    expect(head).toHaveBeenCalledWith("https://audio.kinly.download/w/needs.mp3?v=2");
    expect(fs.readFileSync(path.join(dir, "stories", "needs.md"), "utf8")).toContain("audioBytes: 777");
  });

  it("reports a failed HEAD, leaves the file alone and exits 1", async () => {
    const { source, dir } = world();
    const head = vi.fn(async () => { throw new Error("404"); });
    const error = vi.fn();
    expect(await run(["--apply"], { log: () => {}, error, sources: [source], head })).toBe(1);
    expect(fs.readFileSync(path.join(dir, "stories", "needs.md"), "utf8")).not.toContain("audioBytes");
    expect(error).toHaveBeenCalled();
  });
});
```

**Step 2:** run → FAIL (module missing).

**Step 3: Implement** `scripts/backfill-audio-bytes.mjs`

```js
// One-off: writes `audioBytes` into the front matter of every world-repo story that has an
// `audioUrl` but no `audioBytes`, using the size the audio host reports (HEAD Content-Length).
//
//   node scripts/backfill-audio-bytes.mjs                  # dry run
//   node scripts/backfill-audio-bytes.mjs --apply [--world isles-of-yum]
//
// Reads the world repos from `localPath` in content-sources.json. Afterwards, review and commit
// the front matter change in each world repo. New narrations get audioBytes from upload-audio.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fg from "fast-glob";
import matter from "gray-matter";
import { isAudioUrl } from "./audio-origin.mjs";
import { setFrontMatterField } from "./front-matter.mjs";

export function planBackfill(source) {
  const root = path.join(source.localPath, source.storiesPath || "stories");
  const items = [];
  for (const rel of fg.sync("**/*.md", { cwd: root }).sort()) {
    const file = path.join(root, rel);
    const { data } = matter(fs.readFileSync(file, "utf8"));
    if (data.draft || !isAudioUrl(data.audioUrl) || data.audioBytes !== undefined) continue;
    items.push({ world: source.name, rel, file, url: data.audioUrl.trim() });
  }
  return items;
}

async function headBytes(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) throw new Error(`HEAD ${res.status}`);
  const bytes = Number(res.headers.get("content-length"));
  if (!Number.isInteger(bytes) || bytes < 1) throw new Error("no Content-Length");
  return bytes;
}

/** @returns the process exit code */
export async function run(argv, { log = console.log, error = console.error, sources = null, head = headBytes } = {}) {
  const apply = argv.includes("--apply");
  const worldIdx = argv.indexOf("--world");
  const world = worldIdx >= 0 ? argv[worldIdx + 1] : null;
  const all = sources ?? JSON.parse(fs.readFileSync("content-sources.json", "utf8"));
  const items = all
    .filter((s) => !world || s.name === world)
    .filter((s) => s.localPath && fs.existsSync(s.localPath))
    .flatMap(planBackfill);
  log(`${items.length} stor${items.length === 1 ? "y" : "ies"} need audioBytes.`);
  if (!apply) {
    for (const i of items) log(`  ${i.world}/${i.rel}`);
    log("Dry run: nothing changed. Add --apply to write.");
    return 0;
  }
  let failed = 0;
  for (const item of items) {
    try {
      const bytes = await head(item.url);
      const raw = fs.readFileSync(item.file, "utf8");
      fs.writeFileSync(item.file, setFrontMatterField(raw, "audioBytes", bytes));
      log(`  ${item.world}/${item.rel}: ${bytes}`);
    } catch (err) {
      failed++;
      error(`! ${item.world}/${item.rel}: ${err.message}`);
    }
  }
  log(`${items.length - failed} written, ${failed} failed. Review and commit the change in each world repo.`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(err.message); process.exit(1); });
}
```

Add to `package.json` scripts: `"backfill-audio-bytes": "node scripts/backfill-audio-bytes.mjs",`.

**Step 4:** `npx vitest run scripts/backfill-audio-bytes.test.mjs` → PASS.

**Step 5: Commit** `"Offline: back-fill script for audioBytes"`.

**Step 6 (needs user OK, touches the world repos):** run `npm run backfill-audio-bytes` (dry run) and show the user the count. Only with approval run `-- --apply`, then tell the user the front matter changes in `../isles-of-yum` and `../bramble-wall` need reviewing and committing there (this repo never commits story text), then `npm run fetch-content` in the **main checkout** and copy `stories/` into this worktree again.

---

## Task 5: CSP allows the audio fetch and the worker

**Files:**
- Modify: `scripts/page-security.mjs` (`contentSecurityPolicy`)
- Modify: `test/templates/security.test.mjs`

Page `fetch()` of the audio is governed by `connect-src`, which is currently `'self'` only.

**Step 1: Write the failing test** (add to `test/templates/security.test.mjs`, in a suitable `describe`; import `contentSecurityPolicy` from `../../scripts/page-security.mjs` if not already)

```js
  it("lets scripts fetch the audio origin and run the service worker", () => {
    const csp = contentSecurityPolicy({ importMapHash: "sha256-x", audioOrigin: AUDIO_ORIGIN });
    expect(csp).toContain(`connect-src 'self' ${AUDIO_ORIGIN}`);
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain(`media-src 'self' ${AUDIO_ORIGIN}`);
  });
```

**Step 2:** run → FAIL.

**Step 3: Implement** in `contentSecurityPolicy`: replace `"connect-src 'self'",` with

```js
    `connect-src 'self' ${audioOrigin}`,
    "worker-src 'self'",
```

**Step 4:** `npx vitest run test/templates` → PASS (fix any test that asserted the old `connect-src 'self'` string exactly).

**Step 5: Commit** `"Offline: CSP lets the page fetch audio and run the worker"`.

---

## Task 6: Pure helpers (`offline-core.mjs`)

**Files:**
- Create: `site/assets/js/offline-core.mjs`
- Create: `test/js/offline-core.test.mjs`

Shared by the service worker and the page modules, so it must stay free of DOM and `window`.

**Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import {
  AUDIO_CACHE, SHELL_PREFIX, formatBytes, needsSave, parseRange, rangeResponse, spaceCheck, spaceMessage, storyBytes, totalBytes,
} from "../../site/assets/js/offline-core.mjs";

describe("storyBytes and totalBytes", () => {
  it("uses audioBytes when present", () => {
    expect(storyBytes({ audioBytes: 5_000_000, durationSec: 600 })).toEqual({ bytes: 5_000_000, exact: true });
  });
  it("estimates from the duration at 16 KB per second", () => {
    expect(storyBytes({ durationSec: 600 })).toEqual({ bytes: 9_600_000, exact: false });
  });
  it("is 0 and inexact with neither", () => {
    expect(storyBytes({})).toEqual({ bytes: 0, exact: false });
  });
  it("totals, and is exact only when every story is", () => {
    expect(totalBytes([{ audioBytes: 10 }, { audioBytes: 5 }])).toEqual({ bytes: 15, exact: true });
    expect(totalBytes([{ audioBytes: 10 }, { durationSec: 1 }])).toEqual({ bytes: 16_010, exact: false });
    expect(totalBytes([])).toEqual({ bytes: 0, exact: true });
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"], [480_000, "480 KB"], [4_200_000, "4.2 MB"], [28_400_000, "28 MB"], [1_500_000_000, "1.5 GB"],
  ])("formats %i as %s", (n, text) => expect(formatBytes(n)).toBe(text));
  it("marks an estimate with ~", () => expect(formatBytes(28_400_000, false)).toBe("~28 MB"));
});

describe("spaceCheck", () => {
  it("fits when need plus a 10% margin is within free space", () => {
    expect(spaceCheck({ needBytes: 1e9, quota: 2e9, usage: 5e8 })).toMatchObject({ fits: true, freeBytes: 1.5e9 });
  });
  it("does not fit, and says by how much", () => {
    const r = spaceCheck({ needBytes: 1.4e9, quota: 2.3e9, usage: 1.4e9 });
    expect(r.fits).toBe(false);
    expect(r.freeBytes).toBe(9e8);
    expect(spaceMessage(r)).toBe("Needs 1.4 GB, 900 MB free");
  });
  it("fits when the browser cannot say", () => {
    expect(spaceCheck({ needBytes: 1e9, quota: undefined, usage: undefined })).toMatchObject({ fits: true, freeBytes: null });
  });
  it("never reports negative free space", () => {
    expect(spaceCheck({ needBytes: 1, quota: 5, usage: 9 }).freeBytes).toBe(0);
  });
});

describe("needsSave", () => {
  it("is true for nothing saved and for a different saved url, false for the same", () => {
    const story = { audioUrl: "https://a/x.mp3?v=2" };
    expect(needsSave(story, undefined)).toBe(true);
    expect(needsSave(story, { url: "https://a/x.mp3?v=1" })).toBe(true);
    expect(needsSave(story, { url: "https://a/x.mp3?v=2" })).toBe(false);
  });
});

describe("parseRange", () => {
  it.each([
    ["bytes=0-9", 100, { start: 0, end: 9 }],
    ["bytes=90-", 100, { start: 90, end: 99 }],
    ["bytes=90-500", 100, { start: 90, end: 99 }],
    ["bytes=-10", 100, { start: 90, end: 99 }],
    ["bytes=100-", 100, "unsatisfiable"],
    ["bytes=-0", 100, "unsatisfiable"],
    ["bytes=9-2", 100, "unsatisfiable"],
    ["", 100, null],
    ["items=0-9", 100, null],
    ["bytes=0-9,20-30", 100, null],
  ])("%s of %i", (header, size, expected) => expect(parseRange(header, size)).toEqual(expected));
});

describe("rangeResponse", () => {
  const file = () => new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { headers: { "Content-Type": "audio/mpeg" } });

  it("serves the whole file with Accept-Ranges when no Range is asked", async () => {
    const r = await rangeResponse(file(), null);
    expect(r.status).toBe(200);
    expect(r.headers.get("Accept-Ranges")).toBe("bytes");
    expect((await r.arrayBuffer()).byteLength).toBe(10);
  });
  it("serves a 206 slice with Content-Range", async () => {
    const r = await rangeResponse(file(), "bytes=2-5");
    expect(r.status).toBe(206);
    expect(r.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([2, 3, 4, 5]);
  });
  it("answers 416 past the end", async () => {
    const r = await rangeResponse(file(), "bytes=50-");
    expect(r.status).toBe(416);
    expect(r.headers.get("Content-Range")).toBe("bytes */10");
  });
});

it("names the caches", () => {
  expect(AUDIO_CACHE).toBe("audio-v1");
  expect(SHELL_PREFIX).toBe("shell-");
});
```

**Step 2:** `npx vitest run test/js/offline-core.test.mjs` → FAIL (module missing).

**Step 3: Implement** `site/assets/js/offline-core.mjs`

```js
// Offline listening: pure helpers shared by the service worker and the page
// modules. No DOM, no window: it must load inside a worker and under Node.
// Rules: docs/contracts.md section 9.

export const AUDIO_CACHE = "audio-v1";
export const SHELL_PREFIX = "shell-";
/** Narration is about 128 kbit/s, 16000 bytes a second. Used only when a story has no audioBytes. */
export const EST_BYTES_PER_SEC = 16_000;
/** A save must fit with this much to spare. */
export const SPACE_MARGIN = 0.1;

/** @returns {{bytes: number, exact: boolean}} */
export function storyBytes(story) {
  if (Number.isInteger(story?.audioBytes) && story.audioBytes > 0) return { bytes: story.audioBytes, exact: true };
  if (Number.isFinite(story?.durationSec) && story.durationSec > 0) {
    return { bytes: Math.round(story.durationSec * EST_BYTES_PER_SEC), exact: false };
  }
  return { bytes: 0, exact: false };
}

export function totalBytes(stories) {
  let bytes = 0;
  let exact = true;
  for (const s of stories) {
    const b = storyBytes(s);
    bytes += b.bytes;
    if (!b.exact) exact = false;
  }
  return { bytes, exact };
}

/** "28 MB", "4.2 MB", "1.5 GB". Decimal units, as Android's settings show them. `~` when not exact. */
export function formatBytes(n, exact = true) {
  const v = Number.isFinite(n) && n > 0 ? n : 0;
  let text;
  if (v < 1e3) text = `${Math.round(v)} B`;
  else if (v < 1e6) text = `${Math.round(v / 1e3)} KB`;
  else if (v < 1e9) {
    const mb = v / 1e6;
    text = `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  } else text = `${(v / 1e9).toFixed(1)} GB`;
  return exact ? text : `~${text}`;
}

/** Does a selection of `needBytes` fit? `quota`/`usage` come from navigator.storage.estimate(). */
export function spaceCheck({ needBytes, quota, usage, margin = SPACE_MARGIN }) {
  if (!Number.isFinite(quota) || !Number.isFinite(usage)) {
    return { fits: true, freeBytes: null, needBytes, shortBy: 0 };
  }
  const freeBytes = Math.max(0, quota - usage);
  const wanted = needBytes * (1 + margin);
  return { fits: wanted <= freeBytes, freeBytes, needBytes, shortBy: Math.max(0, Math.ceil(wanted - freeBytes)) };
}

export function spaceMessage({ needBytes, freeBytes }) {
  return `Needs ${formatBytes(needBytes)}, ${formatBytes(freeBytes ?? 0)} free`;
}

/** True when `record` (an index entry) does not hold this story's current audio. */
export function needsSave(story, record) {
  return !record || record.url !== story.audioUrl;
}

/** One `bytes=a-b` range. Returns {start, end}, "unsatisfiable", or null (no usable range: serve it all). */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start;
  let end;
  if (m[1] === "") {
    const last = Number(m[2]);
    if (last === 0) return "unsatisfiable";
    start = Math.max(0, size - last);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

/** Answers a (possibly ranged) request from a cached full response. */
export async function rangeResponse(cached, rangeHeader) {
  const blob = await cached.blob();
  const size = blob.size;
  const type = cached.headers.get("Content-Type") || "audio/mpeg";
  const range = parseRange(rangeHeader, size);
  if (range === null) {
    return new Response(blob, { status: 200, headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  }
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const slice = blob.slice(range.start, range.end + 1);
  return new Response(slice, {
    status: 206,
    headers: {
      "Content-Type": type,
      "Content-Length": String(slice.size),
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}
```

**Step 4:** `npx vitest run test/js/offline-core.test.mjs` → PASS.

**Step 5: Commit** `"Offline: size, space and range helpers"`.

---

## Task 7: Service worker logic

**Files:**
- Create: `site/assets/js/sw-logic.mjs`
- Create: `test/js/fake-caches.mjs` (test helper, an in-memory CacheStorage)
- Create: `test/js/sw-logic.test.mjs`

`createWorker` takes everything it touches as arguments, so it runs under Node with fakes.

**Step 1: Write the helper** `test/js/fake-caches.mjs`

```js
// An in-memory stand-in for CacheStorage, enough for the offline tests.
const keyOf = (k) => (typeof k === "string" ? k : k.url);
const bare = (u) => u.split("?")[0];

function makeCache() {
  const entries = new Map();
  return {
    entries,
    async put(k, res) { entries.set(keyOf(k), res); },
    async match(k, { ignoreSearch = false } = {}) {
      const u = keyOf(k);
      for (const [key, res] of entries) if (key === u || (ignoreSearch && bare(key) === bare(u))) return res.clone();
      return undefined;
    },
    async delete(k) { return entries.delete(keyOf(k)); },
    async keys() { return [...entries.keys()].map((url) => ({ url })); },
  };
}

export function fakeCaches() {
  const stores = new Map();
  return {
    stores,
    async open(name) { if (!stores.has(name)) stores.set(name, makeCache()); return stores.get(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async has(name) { return stores.has(name); },
  };
}
```

**Step 2: Write the failing test** `test/js/sw-logic.test.mjs`

```js
import { describe, expect, it, vi } from "vitest";
import { createWorker } from "../../site/assets/js/sw-logic.mjs";
import { fakeCaches } from "./fake-caches.mjs";

const ORIGIN = "https://site.example";
const SCOPE = "/Stories/";
const AUDIO = "https://audio.example/w/one.mp3?v=1";

const page = (path) => `${ORIGIN}${SCOPE}${path}`;
const html = (text) => new Response(text, { headers: { "Content-Type": "text/html" } });
const req = (url, init = {}) => new Request(url, init);

function setup({ fetch = vi.fn(async () => html("net")), precache = [page(""), page("library/")], timeoutMs = 20 } = {}) {
  const caches = fakeCaches();
  const worker = createWorker({ caches, fetch, origin: ORIGIN, scope: SCOPE, buildId: "b2", precache, timeoutMs });
  return { caches, fetch, worker };
}

describe("install and activate", () => {
  it("precaches the shell into shell-<buildId>", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async (u) => html(`page ${u}`)) });
    await worker.install();
    const shell = await caches.open("shell-b2");
    expect([...shell.entries.keys()].sort()).toEqual([page(""), page("library/")].sort());
  });

  it("fails the install when a precache file is missing, so the old worker stays", async () => {
    const { worker } = setup({ fetch: vi.fn(async () => new Response("no", { status: 404 })) });
    await expect(worker.install()).rejects.toThrow();
  });

  it("activate deletes old shell caches and keeps the audio cache", async () => {
    const { caches, worker } = setup();
    await caches.open("shell-b1");
    await caches.open("shell-b2");
    await caches.open("audio-v1");
    await worker.activate();
    expect(await caches.keys()).toEqual(["shell-b2", "audio-v1"]);
  });
});

describe("shouldHandle", () => {
  const { worker } = setup();
  it("handles in-scope GETs and any mp3, not POSTs or other origins' pages", () => {
    expect(worker.shouldHandle(req(page("library/")))).toBe(true);
    expect(worker.shouldHandle(req(AUDIO))).toBe(true);
    expect(worker.shouldHandle(req(page("library/"), { method: "POST" }))).toBe(false);
    expect(worker.shouldHandle(req("https://other.example/x.html"))).toBe(false);
    expect(worker.shouldHandle(req(`${ORIGIN}/elsewhere/`))).toBe(false);
  });
});

describe("audio", () => {
  it("serves a saved story from the cache with Range support, without the network", async () => {
    const { caches, worker, fetch } = setup();
    const audio = await caches.open("audio-v1");
    await audio.put(AUDIO, new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { headers: { "Content-Type": "audio/mpeg" } }));
    const res = await worker.respond(req(AUDIO, { headers: { Range: "bytes=4-6" } }));
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 4-6/10");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([4, 5, 6]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes an unsaved story to the network", async () => {
    const net = vi.fn(async () => new Response("AUDIO", { status: 200 }));
    const { worker } = setup({ fetch: net });
    const res = await worker.respond(req(AUDIO));
    expect(await res.text()).toBe("AUDIO");
    expect(net).toHaveBeenCalledTimes(1);
  });

  it("does not match a different ?v= of the same file", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => new Response("NEW")) });
    const audio = await caches.open("audio-v1");
    await audio.put("https://audio.example/w/one.mp3?v=0", new Response("OLD"));
    expect(await (await worker.respond(req(AUDIO))).text()).toBe("NEW");
  });
});

describe("pages", () => {
  it("goes to the network first and keeps a copy", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => html("fresh")) });
    const res = await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }));
    expect(await res.text()).toBe("fresh");
    const shell = await caches.open("shell-b2");
    expect(await (await shell.match(page("library/"))).text()).toBe("fresh");
  });

  it("falls back to the copy when the network fails", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => { throw new TypeError("offline"); }) });
    const shell = await caches.open("shell-b2");
    await shell.put(page("library/"), html("cached"));
    const res = await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }));
    expect(await res.text()).toBe("cached");
  });

  it("falls back to the copy when the network is too slow", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(() => new Promise(() => {})), timeoutMs: 10 });
    const shell = await caches.open("shell-b2");
    await shell.put(page("library/"), html("cached"));
    const res = await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }));
    expect(await res.text()).toBe("cached");
  });

  it("shows the Offline page for a page that was never saved", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => { throw new TypeError("offline"); }) });
    const shell = await caches.open("shell-b2");
    await shell.put(page("offline/"), html("offline page"));
    const res = await worker.respond(req(page("stories/never/"), { headers: { Accept: "text/html" } }));
    expect(await res.text()).toBe("offline page");
  });

  it("does not keep a redirected response (a navigation cannot use one)", async () => {
    const redirected = html("moved");
    Object.defineProperty(redirected, "redirected", { value: true });
    const { caches, worker } = setup({ fetch: vi.fn(async () => redirected) });
    await worker.respond(req(page("library/"), { headers: { Accept: "text/html" } }));
    const shell = await caches.open("shell-b2");
    expect(await shell.match(page("library/"))).toBeUndefined();
  });
});

describe("assets and library.json", () => {
  it("serves an asset from the cache first, ignoring a different ?v= when the exact one is missing", async () => {
    const { caches, worker, fetch } = setup();
    const shell = await caches.open("shell-b2");
    await shell.put(page("assets/css/base.css?v=b2"), new Response("css"));
    expect(await (await worker.respond(req(page("assets/css/base.css?v=b2")))).text()).toBe("css");
    expect(await (await worker.respond(req(page("assets/css/base.css?v=old")))).text()).toBe("css");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches and keeps an asset it has not seen", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => new Response("new")) });
    expect(await (await worker.respond(req(page("assets/js/x.mjs?v=b2")))).text()).toBe("new");
    const shell = await caches.open("shell-b2");
    expect(await shell.match(page("assets/js/x.mjs?v=b2"))).toBeDefined();
  });

  it("library.json is network first and falls back to any cached version", async () => {
    const { caches, worker } = setup({ fetch: vi.fn(async () => { throw new TypeError("offline"); }) });
    const shell = await caches.open("shell-b2");
    await shell.put(page("library.json?v=b2"), new Response("{}"));
    expect(await (await worker.respond(req(page("library.json?v=zzz")))).text()).toBe("{}");
  });
});
```

**Step 3:** `npx vitest run test/js/sw-logic.test.mjs` → FAIL (module missing).

**Step 4: Implement** `site/assets/js/sw-logic.mjs`

```js
// The service worker's logic, with everything it touches passed in so it can be
// tested under Node. sw.js (generated by site/sw.js.11ty.js) wires it to the
// real worker. Rules: docs/contracts.md section 9.
import { AUDIO_CACHE, SHELL_PREFIX, rangeResponse } from "./offline-core.mjs";

export function createWorker({ caches, fetch, origin, scope, buildId, precache, timeoutMs = 4000 }) {
  const shellName = `${SHELL_PREFIX}${buildId}`;

  const isAudio = (request, url) => request.destination === "audio" || /\.mp3$/i.test(url.pathname);
  const isLibrary = (url) => url.pathname.endsWith("/library.json");
  const isPage = (request) => request.mode === "navigate" || (request.headers.get("accept") ?? "").includes("text/html");

  function shouldHandle(request) {
    if (request.method !== "GET") return false;
    const url = new URL(request.url);
    if (isAudio(request, url)) return true;
    return url.origin === origin && url.pathname.startsWith(scope);
  }

  async function install() {
    const cache = await caches.open(shellName);
    await Promise.all(
      precache.map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`precache ${url}: ${res.status}`);
        await cache.put(url, res);
      }),
    );
  }

  async function activate() {
    for (const name of await caches.keys()) {
      if (name.startsWith(SHELL_PREFIX) && name !== shellName) await caches.delete(name);
    }
  }

  async function audioResponse(request) {
    const audio = await caches.open(AUDIO_CACHE);
    const hit = await audio.match(request.url);
    if (hit) return rangeResponse(hit, request.headers.get("range"));
    return fetch(request);
  }

  function withTimeout(promise) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("slow")), timeoutMs);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  async function networkFirst(request, { page = false, ignoreSearch = false } = {}) {
    const cache = await caches.open(shellName);
    try {
      const res = await withTimeout(fetch(request));
      // A redirected response cannot answer a navigation, so it is never kept.
      if (res.ok && !res.redirected) await cache.put(request.url, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(request.url, { ignoreSearch });
      if (hit) return hit;
      if (page) {
        const offline = await cache.match(`${origin}${scope}offline/`);
        if (offline) return offline;
      }
      throw err;
    }
  }

  async function cacheFirst(request) {
    const cache = await caches.open(shellName);
    const hit = (await cache.match(request.url)) ?? (await cache.match(request.url, { ignoreSearch: true }));
    if (hit) return hit;
    const res = await fetch(request);
    if (res.ok && !res.redirected) await cache.put(request.url, res.clone());
    return res;
  }

  function respond(request) {
    const url = new URL(request.url);
    if (isAudio(request, url)) return audioResponse(request);
    if (isLibrary(url)) return networkFirst(request, { ignoreSearch: true });
    if (isPage(request)) return networkFirst(request, { page: true });
    return cacheFirst(request);
  }

  return { install, activate, shouldHandle, respond, shellName };
}
```

**Step 5:** `npx vitest run test/js/sw-logic.test.mjs` → PASS. (If the "too slow" test is flaky, raise nothing: the timer is 10 ms and the promise never settles.)

**Step 6: Commit** `"Offline: service worker logic"`.

---

## Task 8: Emit `sw.js` and register it

**Files:**
- Create: `scripts/sw-manifest.mjs`
- Create: `scripts/sw-manifest.test.mjs`
- Create: `site/sw.js.11ty.js`
- Create: `site/assets/js/offline-register.mjs`
- Create: `test/js/offline-register.test.mjs`
- Modify: `site/assets/js/main.js`
- Modify: `eleventy.config.js` (only if Eleventy does not emit `sw.js`, see Step 6)

**Step 1: Write the failing tests**

`scripts/sw-manifest.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { precacheList } from "./sw-manifest.mjs";

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swm-"));
  const put = (rel) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), "x");
  };
  put("site/assets/css/base.css");
  put("site/assets/css/tokens.css");
  put("site/assets/js/main.js");
  put("site/assets/js/dock.mjs");
  put("site/assets/js/dock.test.mjs");
  put("site/assets/js/offline-core.mjs");
  put("site/assets/js/sw-logic.mjs");
  put("site/assets/app-icon-192.png");
  return root;
}

describe("precacheList", () => {
  const list = precacheList({ buildId: "b2", prefix: "/Stories", origin: "https://s.example", root: project() });

  it("has the pages, library.json and manifest", () => {
    for (const p of ["/Stories/", "/Stories/library/", "/Stories/offline/", "/Stories/manifest.webmanifest"]) {
      expect(list).toContain(`https://s.example${p}`);
    }
    expect(list).toContain("https://s.example/Stories/library.json?v=b2");
  });

  it("has css and modules with the build id exactly as the pages ask for them", () => {
    expect(list).toContain("https://s.example/Stories/assets/css/base.css?v=b2");
    expect(list).toContain("https://s.example/Stories/assets/js/main.js?v=b2");
    expect(list).toContain("https://s.example/Stories/assets/js/dock.mjs?v=b2");
  });

  it("keeps the worker's own modules without a version, and skips tests", () => {
    expect(list).toContain("https://s.example/Stories/assets/js/sw-logic.mjs");
    expect(list).toContain("https://s.example/Stories/assets/js/offline-core.mjs");
    expect(list.some((u) => u.includes("dock.test"))).toBe(false);
  });

  it("includes an icon that exists", () => {
    expect(list).toContain("https://s.example/Stories/assets/app-icon-192.png");
  });
});
```

`test/js/offline-register.test.mjs`:

```js
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerOffline } from "../../site/assets/js/offline-register.mjs";

function fakeNav() {
  const registration = { unregister: vi.fn(async () => true) };
  return {
    registration,
    serviceWorker: {
      register: vi.fn(async () => registration),
      getRegistrations: vi.fn(async () => [registration]),
    },
  };
}

describe("registerOffline", () => {
  beforeEach(() => localStorage.clear());

  it("registers a module worker at <base>/sw.js with the base as scope", async () => {
    const nav = fakeNav();
    await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "" });
    expect(nav.serviceWorker.register).toHaveBeenCalledWith("/Stories/sw.js", { scope: "/Stories/", type: "module", updateViaCache: "none" });
  });

  it("does nothing without service worker support", async () => {
    expect(await registerOffline({ nav: {}, base: "/Stories", storage: localStorage, search: "" })).toBeNull();
  });

  it("?sw=off turns it off, unregisters and remembers", async () => {
    const nav = fakeNav();
    await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "?sw=off" });
    expect(nav.serviceWorker.register).not.toHaveBeenCalled();
    expect(nav.registration.unregister).toHaveBeenCalled();
    expect(localStorage.getItem("stories-sw")).toBe("off");
  });

  it("stays off on the next page, and ?sw=on turns it back on", async () => {
    localStorage.setItem("stories-sw", "off");
    const nav = fakeNav();
    await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "" });
    expect(nav.serviceWorker.register).not.toHaveBeenCalled();
    await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "?sw=on" });
    expect(nav.serviceWorker.register).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("stories-sw")).toBeNull();
  });

  it("swallows a registration failure", async () => {
    const nav = fakeNav();
    nav.serviceWorker.register = vi.fn(async () => { throw new Error("blocked"); });
    expect(await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "" })).toBeNull();
  });
});
```

**Step 2:** run both → FAIL.

**Step 3: Implement**

`scripts/sw-manifest.mjs`:

```js
// The list of files the service worker caches when it installs (the app shell).
// URLs are exactly what the pages ask for: css and modules carry ?v=<buildId>,
// the worker's own modules are plain (a module worker imports them unversioned).
import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

const WORKER_MODULES = new Set(["sw-logic.mjs", "offline-core.mjs"]);

export function precacheList({ buildId, prefix, origin = "", root = process.cwd() }) {
  const at = (p) => `${origin}${prefix}${p}`;
  const v = `?v=${buildId}`;
  const list = [at("/"), at("/library/"), at("/offline/"), at(`/library.json${v}`), at("/manifest.webmanifest")];
  const under = (pattern) => fg.sync(pattern, { cwd: path.join(root, "site/assets"), ignore: ["**/*.test.mjs"] }).sort();
  for (const f of under("css/*.css")) list.push(at(`/assets/css/${f.replace(/^css\//, "")}${v}`));
  for (const f of under("js/*.{js,mjs}")) {
    const name = f.replace(/^js\//, "");
    list.push(at(`/assets/js/${name}${WORKER_MODULES.has(name) ? "" : v}`));
  }
  for (const name of ["app-icon-192.png", "app-icon-512.png"]) {
    if (fs.existsSync(path.join(root, "site/assets", name))) list.push(at(`/assets/${name}`));
  }
  return list;
}
```

`site/sw.js.11ty.js` (note `.11ty.js` templates are ES modules here, like `library.json.11ty.js`):

```js
import { BUILD_ID } from "../scripts/build-id.mjs";
import { PATH_PREFIX } from "../scripts/stories-lib.mjs";
import { precacheList } from "../scripts/sw-manifest.mjs";

// Emits /sw.js. A module worker whose logic lives in assets/js/sw-logic.mjs.
// The build id is in its text, so every real deploy installs a new worker and a
// build with no change keeps the same one.
export const data = { permalink: "sw.js" };

export function render() {
  // The page origin is only known in the browser, so the worker reads it from itself.
  const list = precacheList({ buildId: BUILD_ID, prefix: PATH_PREFIX });
  return `// Generated by site/sw.js.11ty.js. Do not edit.
import { createWorker } from "./assets/js/sw-logic.mjs";

const worker = createWorker({
  caches,
  fetch: (request) => fetch(request),
  origin: self.location.origin,
  scope: ${JSON.stringify(`${PATH_PREFIX}/`)},
  buildId: ${JSON.stringify(BUILD_ID)},
  precache: ${JSON.stringify(list)}.map((p) => self.location.origin + p),
});

self.addEventListener("install", (event) => {
  event.waitUntil(worker.install().then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(worker.activate().then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (worker.shouldHandle(event.request)) event.respondWith(worker.respond(event.request));
});
`;
}
```

`site/assets/js/offline-register.mjs`:

```js
// Registers the service worker (docs/contracts.md section 9). Never throws: the
// site works the same without it. ?sw=off unregisters it and keeps it off on this
// device; ?sw=on clears that.
import { basePath } from "./dom.mjs";

const KEY = "stories-sw";

export async function registerOffline({
  nav = typeof navigator === "undefined" ? {} : navigator,
  base = basePath(),
  storage = typeof localStorage === "undefined" ? null : localStorage,
  search = typeof location === "undefined" ? "" : location.search,
} = {}) {
  if (!nav.serviceWorker) return null;
  const guard = (fn) => { try { return fn(); } catch { return undefined; } };
  const flag = new URLSearchParams(search).get("sw");
  if (flag === "off") guard(() => storage?.setItem(KEY, "off"));
  if (flag === "on") guard(() => storage?.removeItem(KEY));
  if (guard(() => storage?.getItem(KEY)) === "off") {
    try {
      for (const registration of await nav.serviceWorker.getRegistrations()) await registration.unregister();
    } catch { /* nothing to undo */ }
    return null;
  }
  try {
    return await nav.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/`, type: "module", updateViaCache: "none" });
  } catch (err) {
    console.warn("offline unavailable", err);
    return null;
  }
}
```

In `site/assets/js/main.js`, after `startRouter(...)` inside the `if (typeof document !== "undefined")` block:

```js
  // Offline listening: a failure here must never touch the page.
  const startOffline = () => import("./offline-register.mjs").then((m) => m.registerOffline()).catch(() => {});
  if (document.readyState === "complete") startOffline();
  else window.addEventListener("load", startOffline, { once: true });
```

**Step 4:** `npx vitest run scripts/sw-manifest.test.mjs test/js/offline-register.test.mjs` → PASS. Also `npx vitest run test/js/main.test.mjs` (main.js is imported by tests; the guard `typeof document` keeps node safe).

**Step 5: Check the build emits the worker.** The build needs `stories/` (present). Run `npm run build` (this runs fetch-content, which must NOT run in a worktree; instead run the steps without it):
`npm run validate && npm run validate-world-data && npm run check-token-contrast && npm run check-solid-fill-contrast && npm run generate-icons && npx @11ty/eleventy`.
Then `ls _site/sw.js _site/assets/js/sw-logic.mjs` and `head -20 _site/sw.js`; the precache array must list the offline page.

**Step 6:** If `_site/sw.js` is missing, 11ty did not pick up the template: confirm the file is named `sw.js.11ty.js` under `site/` and exports `data`/`render` like `library.json.11ty.js`. The Offline page does not exist yet (Task 11), so precache of `/offline/` would 404 at install time in production: **do not deploy before Task 11**.

**Step 7: Commit** `"Offline: emit and register the service worker"`.

---

## Task 9: The offline store

**Files:**
- Create: `site/assets/js/offline.mjs`
- Create: `test/js/offline-store.test.mjs`

**Step 1: Write the failing test** `test/js/offline-store.test.mjs`

```js
import { describe, expect, it, vi } from "vitest";
import { createStore } from "../../site/assets/js/offline.mjs";
import { fakeCaches } from "./fake-caches.mjs";

// Invented placeholder stories.
const story = (n, extra = {}) => ({
  slug: `w/tale-${n}`, title: `Tale ${n}`, world: "w", url: `/Stories/stories/tale-${n}/`,
  audioUrl: `https://audio.example/w/tale-${n}.mp3?v=1`, audioBytes: 4, durationSec: 60, ...extra,
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function audioFetch({ fail = new Set(), short = new Set() } = {}) {
  return vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith(".mp3") || u.includes(".mp3?")) {
      if (fail.has(u)) return new Response("no", { status: 500 });
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const body = short.has(u) ? bytes.slice(0, 2) : bytes;
      return new Response(body, { status: 200, headers: { "content-length": "4" } });
    }
    return new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
  });
}

function make(opts = {}) {
  const caches = fakeCaches();
  const events = [];
  const fetch = opts.fetch ?? audioFetch();
  const store = createStore({
    caches, fetch, storage: opts.storage ?? memoryStorage(), buildId: "b2",
    navigator: opts.navigator ?? { storage: { estimate: async () => ({ quota: 1e9, usage: 1e8 }), persist: vi.fn(async () => true) } },
    dispatch: (slug) => events.push(slug),
  });
  return { caches, events, fetch, store };
}

describe("save and remove", () => {
  it("caches the audio under its exact url, indexes it and caches the story page", async () => {
    const { store, caches, fetch } = make();
    await store.save(story(1));
    const audio = await caches.open("audio-v1");
    expect([...audio.entries.keys()]).toEqual(["https://audio.example/w/tale-1.mp3?v=1"]);
    expect(store.status(story(1))).toBe("saved");
    expect(store.index()["w/tale-1"]).toMatchObject({ url: story(1).audioUrl, bytes: 4 });
    expect(fetch).toHaveBeenCalledWith(story(1).audioUrl, expect.objectContaining({ mode: "cors" }));
    const shell = await caches.open("shell-b2");
    expect(await shell.match("/Stories/stories/tale-1/")).toBeDefined();
  });

  it("does not index a download that came up short", async () => {
    const s = story(1);
    const { store, caches } = make({ fetch: audioFetch({ short: new Set([s.audioUrl]) }) });
    await expect(store.save(s)).rejects.toThrow(/incomplete/);
    expect(store.status(s)).toBe("none");
    expect((await caches.open("audio-v1")).entries.size).toBe(0);
  });

  it("rejects on an http error", async () => {
    const s = story(1);
    const { store } = make({ fetch: audioFetch({ fail: new Set([s.audioUrl]) }) });
    await expect(store.save(s)).rejects.toThrow();
    expect(store.status(s)).toBe("none");
  });

  it("shows a story whose audioUrl changed as stale, and an update replaces the old file", async () => {
    const { store, caches } = make();
    await store.save(story(1));
    const newer = story(1, { audioUrl: "https://audio.example/w/tale-1.mp3?v=2" });
    expect(store.status(newer)).toBe("stale");
    await store.save(newer);
    const audio = await caches.open("audio-v1");
    expect([...audio.entries.keys()]).toEqual([newer.audioUrl]);
    expect(store.status(newer)).toBe("saved");
  });

  it("removes the audio and the index entry", async () => {
    const { store, caches } = make();
    await store.save(story(1));
    await store.remove("w/tale-1");
    expect(store.status(story(1))).toBe("none");
    expect((await caches.open("audio-v1")).entries.size).toBe(0);
  });

  it("announces each change", async () => {
    const { store, events } = make();
    await store.save(story(1));
    await store.remove("w/tale-1");
    expect(events).toEqual(["w/tale-1", "w/tale-1"]);
  });

  it("survives a broken index in storage", () => {
    const storage = memoryStorage();
    storage.setItem("stories-offline", "{not json");
    expect(make({ storage }).store.index()).toEqual({});
  });
});

describe("jobs", () => {
  it("saves each story that is not saved yet, in order, and reports progress", async () => {
    const { store } = make();
    await store.save(story(1));
    const seen = [];
    store.subscribe(() => seen.push(store.getJob()?.current ?? null));
    const job = await store.startJob([story(1), story(2), story(3)]);
    expect(job).toMatchObject({ state: "done", total: 2, done: 2, failed: [] });
    expect(store.status(story(2))).toBe("saved");
    expect(store.status(story(3))).toBe("saved");
    expect(seen).toContain("w/tale-2");
  });

  it("asks the browser to keep the storage, once", async () => {
    const navigator = { storage: { estimate: async () => ({ quota: 1e9, usage: 0 }), persist: vi.fn(async () => true) } };
    const { store } = make({ navigator });
    await store.startJob([story(1)]);
    await store.startJob([story(2)]);
    expect(navigator.storage.persist).toHaveBeenCalledTimes(1);
  });

  it("keeps going past a failure and lists it", async () => {
    const bad = story(2);
    const { store } = make({ fetch: audioFetch({ fail: new Set([bad.audioUrl]) }) });
    const job = await store.startJob([story(1), bad, story(3)]);
    expect(job).toMatchObject({ state: "error", done: 2, failed: ["w/tale-2"] });
    expect(store.status(story(3))).toBe("saved");
  });

  it("can be cancelled between stories", async () => {
    const { store } = make();
    const started = store.startJob([story(1), story(2), story(3)]);
    store.cancel();
    const job = await started;
    expect(job.state).toBe("cancelled");
    expect(store.status(story(3))).toBe("none");
  });

  it("ignores a second job while one runs", async () => {
    const { store } = make();
    const first = store.startJob([story(1), story(2)]);
    const second = await store.startJob([story(3)]);
    expect(second.slugs).toEqual(["w/tale-1", "w/tale-2"]);
    await first;
    expect(store.status(story(3))).toBe("none");
  });
});

describe("storageInfo and totals", () => {
  it("reads quota and usage", async () => {
    const { store } = make();
    expect(await store.storageInfo()).toEqual({ quota: 1e9, usage: 1e8 });
  });
  it("copes with a browser that cannot estimate", async () => {
    const { store } = make({ navigator: {} });
    expect(await store.storageInfo()).toEqual({ quota: undefined, usage: undefined });
  });
  it("adds up what is saved", async () => {
    const { store } = make();
    await store.save(story(1));
    await store.save(story(2));
    expect(store.saved()).toEqual({ count: 2, bytes: 8 });
  });
});

describe("reconcile", () => {
  it("drops an index entry whose audio vanished", async () => {
    const { store, caches } = make();
    await store.save(story(1));
    await (await caches.open("audio-v1")).delete(story(1).audioUrl);
    await store.reconcile([story(1)]);
    expect(store.status(story(1))).toBe("none");
  });

  it("re-adopts audio found in the cache when the index was lost, and deletes audio no story owns", async () => {
    const storage = memoryStorage();
    const { store, caches } = make({ storage });
    await store.save(story(1));
    storage.removeItem("stories-offline");
    await (await caches.open("audio-v1")).put("https://audio.example/w/orphan.mp3?v=1", new Response("x"));
    await store.reconcile([story(1)]);
    expect(store.status(story(1))).toBe("saved");
    expect((await caches.open("audio-v1")).entries.has("https://audio.example/w/orphan.mp3?v=1")).toBe(false);
  });

  it("re-caches the page of a saved story when it is missing from this build's shell", async () => {
    const { store, caches } = make();
    await store.save(story(1));
    (await caches.open("shell-b2")).entries.clear();
    await store.reconcile([story(1)]);
    expect(await (await caches.open("shell-b2")).match("/Stories/stories/tale-1/")).toBeDefined();
  });
});
```

**Step 2:** run → FAIL.

**Step 3: Implement** `site/assets/js/offline.mjs`

```js
// The offline store: saves story audio into the Cache API, keeps a small index in
// localStorage, and runs one download job at a time. One instance per page
// context (the router keeps it alive across navigation, so a download keeps going).
// Rules: docs/contracts.md section 9.
import { AUDIO_CACHE, SHELL_PREFIX, needsSave, storyBytes } from "./offline-core.mjs";

export const INDEX_KEY = "stories-offline";

export function createStore({ caches, fetch, storage, navigator: nav, buildId, dispatch = () => {}, now = () => Date.now() }) {
  const listeners = new Set();
  let job = null;
  let controller = null;
  let asked = false;

  // ---- the index (advisory; the cache is the truth) ----
  const index = () => {
    try {
      const value = JSON.parse(storage.getItem(INDEX_KEY) ?? "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  };
  const writeIndex = (value) => {
    try { storage.setItem(INDEX_KEY, JSON.stringify(value)); } catch { /* full or blocked: the cache still holds the audio */ }
  };
  const notify = (slug = null) => {
    dispatch(slug);
    for (const fn of listeners) fn();
  };

  const status = (story) => {
    const record = index()[story.slug];
    if (!record) return "none";
    return needsSave(story, record) ? "stale" : "saved";
  };
  const saved = () => {
    const records = Object.values(index());
    return { count: records.length, bytes: records.reduce((n, r) => n + (Number(r.bytes) || 0), 0) };
  };
  const savedSlugs = () => new Set(Object.keys(index()));

  async function storageInfo() {
    try {
      const { quota, usage } = (await nav.storage?.estimate?.()) ?? {};
      return { quota, usage };
    } catch {
      return { quota: undefined, usage: undefined };
    }
  }

  async function cachePage(story) {
    if (!buildId || !story.url) return;
    const cache = await caches.open(`${SHELL_PREFIX}${buildId}`);
    if (await cache.match(story.url)) return;
    const res = await fetch(story.url, { headers: { Accept: "text/html" } });
    if (res.ok && !res.redirected) await cache.put(story.url, res);
  }

  // ---- save and remove ----
  async function save(story, { signal, onBytes } = {}) {
    const res = await fetch(story.audioUrl, { mode: "cors", signal });
    if (!res.ok) throw new Error(`audio ${res.status}`);
    const declared = Number(res.headers.get("content-length")) || 0;
    const chunks = [];
    let got = 0;
    if (res.body?.getReader) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        onBytes?.(got, declared);
      }
    } else {
      const buffer = new Uint8Array(await res.arrayBuffer());
      chunks.push(buffer);
      got = buffer.length;
    }
    if (declared && got !== declared) throw new Error(`incomplete download (${got} of ${declared} bytes)`);

    const blob = new Blob(chunks, { type: "audio/mpeg" });
    const cache = await caches.open(AUDIO_CACHE);
    await cache.put(
      story.audioUrl,
      new Response(blob, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(blob.size) } }),
    );
    const next = index();
    const previous = next[story.slug];
    next[story.slug] = { url: story.audioUrl, bytes: blob.size, savedAt: now() };
    writeIndex(next);
    if (previous && previous.url !== story.audioUrl) await cache.delete(previous.url);
    try { await cachePage(story); } catch { /* the audio is saved; the page is a bonus */ }
    notify(story.slug);
  }

  async function remove(slug) {
    const next = index();
    const record = next[slug];
    if (!record) return;
    const cache = await caches.open(AUDIO_CACHE);
    await cache.delete(record.url);
    delete next[slug];
    writeIndex(next);
    notify(slug);
  }

  async function removeMany(slugs) {
    for (const slug of slugs) await remove(slug);
  }

  // ---- jobs ----
  const getJob = () => job;

  async function startJob(stories) {
    if (job?.state === "running") return job;
    const list = stories.filter((s) => s.audioUrl && status(s) !== "saved");
    controller = new AbortController();
    const { signal } = controller;
    job = {
      state: "running",
      slugs: list.map((s) => s.slug),
      total: list.length,
      done: 0,
      failed: [],
      current: null,
      bytesTotal: list.reduce((n, s) => n + storyBytes(s).bytes, 0),
      bytesDone: 0,
      currentBytes: 0,
    };
    notify();
    if (!asked) {
      asked = true;
      try { await nav.storage?.persist?.(); } catch { /* a refusal changes nothing */ }
    }
    let lastTick = 0;
    for (const story of list) {
      if (signal.aborted) break;
      job.current = story.slug;
      job.currentBytes = 0;
      notify();
      try {
        await save(story, {
          signal,
          onBytes: (got) => {
            job.currentBytes = got;
            const t = now();
            if (t - lastTick > 250) { lastTick = t; notify(); }
          },
        });
        job.done += 1;
        job.bytesDone += storyBytes(story).bytes;
      } catch (err) {
        if (signal.aborted) break;
        job.failed.push(story.slug);
      }
    }
    job.current = null;
    job.currentBytes = 0;
    job.state = signal.aborted ? "cancelled" : job.failed.length ? "error" : "done";
    notify();
    return job;
  }

  function cancel() {
    controller?.abort();
  }

  // ---- housekeeping ----
  /** Makes the index agree with the cache, and re-caches saved stories' pages. Call when online with the library loaded. */
  async function reconcile(stories) {
    const cache = await caches.open(AUDIO_CACHE);
    const cached = new Set((await cache.keys()).map((r) => r.url));
    const next = index();
    const owned = new Set();
    for (const [slug, record] of Object.entries(next)) {
      if (cached.has(record.url)) owned.add(record.url);
      else delete next[slug];
    }
    for (const story of stories) {
      if (!next[story.slug] && story.audioUrl && cached.has(story.audioUrl)) {
        next[story.slug] = { url: story.audioUrl, bytes: storyBytes(story).bytes, savedAt: now() };
        owned.add(story.audioUrl);
      }
    }
    for (const url of cached) if (!owned.has(url)) await cache.delete(url);
    writeIndex(next);
    for (const story of stories) {
      if (next[story.slug]) { try { await cachePage(story); } catch { /* offline: try next time */ } }
    }
    notify();
  }

  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  return { index, status, saved, savedSlugs, storageInfo, save, remove, removeMany, startJob, getJob, cancel, reconcile, subscribe };
}

// ---- the real one ----
let instance = null;

/** True when this browser can save for offline (Cache API and service workers). */
export function offlineSupported(env = globalThis) {
  return Boolean(env.caches && env.navigator?.serviceWorker);
}

export function getStore() {
  if (!instance) {
    instance = createStore({
      caches: globalThis.caches,
      fetch: (...args) => globalThis.fetch(...args),
      storage: globalThis.localStorage,
      navigator: globalThis.navigator,
      buildId: document.querySelector('meta[name="build-id"]')?.content,
      dispatch: (slug) => document.dispatchEvent(new CustomEvent("stories:offline", { detail: { slug } })),
    });
    // Across tabs: another tab saved or removed something.
    window.addEventListener("storage", (event) => {
      if (event.key === INDEX_KEY) document.dispatchEvent(new CustomEvent("stories:offline", { detail: { slug: null } }));
    });
  }
  return instance;
}

export function resetStore() {
  instance = null;
}
```

Note the test "ignores a second job while one runs" depends on `startJob` returning the running `job` object synchronously-enough: the second call happens before the first awaits anything past `notify()`; `job.state` is already `running`.

**Step 4:** `npx vitest run test/js/offline-store.test.mjs` → PASS. Fix by reading failures, not by loosening assertions. In particular `Response` bodies built from `Uint8Array` are streams in Node, so the reader path is the one under test; add one more test for the non-stream branch only if coverage matters.

**Step 5: Commit** `"Offline: the store (save, remove, jobs, reconcile)"`.

---

## Task 10: "Save for offline" on the story page

**Files:**
- Create: `site/assets/js/offline-save.mjs`
- Create: `test/js/offline-save.test.mjs`
- Modify: `site/assets/js/main.js` (add `"offline-save"` to `NAMES`)
- Modify: `site/_includes/story.njk`
- Modify: `site/assets/css/pages.css` (or the new `offline.css`, Task 11, whichever exists first; see Step 6)
- Modify: `site/assets/js/README.md`, `site/assets/css/README.md`

**Step 1: Write the failing test** `test/js/offline-save.test.mjs`

```js
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { mount } from "../../site/assets/js/offline-save.mjs";
import { createStore, resetStore } from "../../site/assets/js/offline.mjs";
import * as offline from "../../site/assets/js/offline.mjs";
import { fakeCaches } from "./fake-caches.mjs";
import { library, stubLibraryFetch, tick } from "./helpers.mjs";

const STORY = { ...library.stories[0], audioUrl: "https://audio.example/first.mp3", audioBytes: 4 };
const lib = { ...library, stories: [STORY, ...library.stories.slice(1)] };

function fakeStore(overrides = {}) {
  const listeners = new Set();
  const store = {
    status: vi.fn(() => "none"),
    getJob: vi.fn(() => null),
    startJob: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    cancel: vi.fn(),
    storageInfo: vi.fn(async () => ({ quota: 1e9, usage: 0 })),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    emit: () => listeners.forEach((fn) => fn()),
    ...overrides,
  };
  return store;
}

async function mountWith(store) {
  vi.spyOn(offline, "getStore").mockReturnValue(store);
  vi.spyOn(offline, "offlineSupported").mockReturnValue(true);
  document.documentElement.dataset.base = "/Stories";
  document.body.innerHTML = `<div data-mount="offline-save" data-slug="${STORY.slug}"></div>`;
  const el = document.querySelector("[data-mount]");
  stubLibraryFetch(lib);
  resetLibrary();
  const unmount = mount(el);
  await tick();
  await tick();
  return { el, unmount };
}

const button = (el) => el.querySelector("button");
const note = (el) => el.querySelector('[data-role="note"]');

afterEach(() => vi.restoreAllMocks());

describe("offline-save", () => {
  it("offers to save, with the size", async () => {
    const { el } = await mountWith(fakeStore());
    expect(button(el).textContent).toBe("Save for offline · 4 B");
  });

  it("marks an estimated size with ~", async () => {
    const store = fakeStore();
    const noBytes = { ...lib, stories: [{ ...STORY, audioBytes: undefined, durationSec: 600 }] };
    vi.spyOn(offline, "getStore").mockReturnValue(store);
    vi.spyOn(offline, "offlineSupported").mockReturnValue(true);
    document.body.innerHTML = `<div data-mount="offline-save" data-slug="${STORY.slug}"></div>`;
    stubLibraryFetch(noBytes);
    resetLibrary();
    mount(document.querySelector("[data-mount]"));
    await tick(); await tick();
    expect(document.querySelector("button").textContent).toBe("Save for offline · ~9.6 MB");
  });

  it("starts a save when pressed and there is room", async () => {
    const store = fakeStore();
    const { el } = await mountWith(store);
    button(el).click();
    await tick();
    expect(store.startJob).toHaveBeenCalledWith([expect.objectContaining({ slug: STORY.slug })]);
  });

  it("says why when there is no room, and saves nothing", async () => {
    const store = fakeStore({ storageInfo: vi.fn(async () => ({ quota: 5, usage: 4 })) });
    const { el } = await mountWith(store);
    button(el).click();
    await tick();
    expect(store.startJob).not.toHaveBeenCalled();
    expect(note(el).textContent).toBe("Needs 4 B, 1 B free");
  });

  it("shows progress while this story is being saved, and a press cancels", async () => {
    const store = fakeStore({
      status: vi.fn(() => "none"),
      getJob: vi.fn(() => ({ state: "running", slugs: [STORY.slug], current: STORY.slug, currentBytes: 1, bytesTotal: 4, bytesDone: 0 })),
    });
    const { el } = await mountWith(store);
    expect(button(el).textContent).toBe("Saving 25% · tap to cancel");
    button(el).click();
    expect(store.cancel).toHaveBeenCalled();
  });

  it("says waiting for a queued story", async () => {
    const store = fakeStore({
      getJob: vi.fn(() => ({ state: "running", slugs: ["other", STORY.slug], current: "other", currentBytes: 0, bytesTotal: 8, bytesDone: 0 })),
    });
    const { el } = await mountWith(store);
    expect(button(el).textContent).toBe("Waiting to save");
  });

  it("is a pressed toggle once saved, and a press removes it", async () => {
    const store = fakeStore({ status: vi.fn(() => "saved") });
    const { el } = await mountWith(store);
    expect(button(el).textContent).toBe("Saved for offline");
    expect(button(el).getAttribute("aria-pressed")).toBe("true");
    button(el).click();
    expect(store.remove).toHaveBeenCalledWith(STORY.slug);
  });

  it("offers an update when stale", async () => {
    const { el } = await mountWith(fakeStore({ status: vi.fn(() => "stale") }));
    expect(button(el).textContent).toBe("Update available · 4 B");
  });

  it("says so when the last attempt failed", async () => {
    const store = fakeStore({ getJob: vi.fn(() => ({ state: "error", slugs: [STORY.slug], failed: [STORY.slug], current: null })) });
    const { el } = await mountWith(store);
    expect(note(el).textContent).toBe("Could not save. Try again.");
  });

  it("follows the store", async () => {
    const store = fakeStore();
    const { el } = await mountWith(store);
    store.status.mockReturnValue("saved");
    store.emit();
    expect(button(el).textContent).toBe("Saved for offline");
  });

  it("hides itself where offline is not supported", async () => {
    vi.spyOn(offline, "offlineSupported").mockReturnValue(false);
    document.body.innerHTML = `<div data-mount="offline-save" data-slug="${STORY.slug}"></div>`;
    const el = document.querySelector("[data-mount]");
    mount(el);
    expect(el.hidden).toBe(true);
  });

  it("stops listening when unmounted", async () => {
    const store = fakeStore();
    const { el, unmount } = await mountWith(store);
    unmount();
    store.status.mockReturnValue("saved");
    store.emit();
    expect(button(el)?.textContent ?? "").not.toBe("Saved for offline");
  });
});
```
(Keep imports tidy: remove `createStore`, `resetStore`, `beforeEach` if unused. `vi.spyOn` on ES module namespace exports works with Vitest for the module's own exports when the consumer imports the same module instance; if it does not, make `offline-save.mjs` call `offline.getStore()` through a `import * as offline` namespace import, which is what the code below does.)

**Step 2:** run → FAIL.

**Step 3: Implement** `site/assets/js/offline-save.mjs`

```js
// data-mount="offline-save" data-slug="<slug>": the story page's "Save for offline" button.
// States: Save for offline · 28 MB, Saving 40% · tap to cancel, Waiting to save,
// Saved for offline (a pressed toggle; a press removes it), Update available · 28 MB.
// Title, size and audio URL come from library.json, never from the page or storage.
import { h } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import * as offline from "./offline.mjs";
import { formatBytes, spaceCheck, spaceMessage, storyBytes } from "./offline-core.mjs";

export function mount(el) {
  const slug = el.dataset.slug;
  if (!slug || !offline.offlineSupported()) {
    el.hidden = true;
    return () => {};
  }
  const store = offline.getStore();
  const button = h("button", { type: "button", class: "btn offline-save-button", "data-role": "save" });
  const note = h("p", { class: "offline-note", role: "status", "data-role": "note" });
  el.replaceChildren(button, note);
  let story = null;
  let message = "";
  let disposed = false;

  function size() {
    const b = storyBytes(story);
    return b.bytes ? ` · ${formatBytes(b.bytes, b.exact)}` : "";
  }

  function render() {
    if (disposed || !story) return;
    const status = store.status(story);
    const job = store.getJob();
    const queued = job?.state === "running" && job.slugs.includes(slug) && status !== "saved";
    const failed = job?.state === "error" && job.failed?.includes(slug) && status !== "saved";
    button.removeAttribute("aria-pressed");
    button.dataset.state = "none";
    if (queued && job.current === slug) {
      const total = job.bytesTotal ? storyBytes(story).bytes : 0;
      const pct = total ? Math.min(99, Math.round((job.currentBytes / total) * 100)) : 0;
      button.dataset.state = "saving";
      button.textContent = `Saving ${pct}% · tap to cancel`;
    } else if (queued) {
      button.dataset.state = "queued";
      button.textContent = "Waiting to save";
    } else if (status === "saved") {
      button.dataset.state = "saved";
      button.setAttribute("aria-pressed", "true");
      button.textContent = "Saved for offline";
    } else if (status === "stale") {
      button.dataset.state = "stale";
      button.textContent = `Update available${size()}`;
    } else {
      button.textContent = `Save for offline${size()}`;
    }
    note.textContent = message || (failed ? "Could not save. Try again." : "");
  }

  async function onClick() {
    const status = store.status(story);
    const job = store.getJob();
    if (job?.state === "running" && job.slugs.includes(slug) && status !== "saved") return store.cancel();
    if (status === "saved") return store.remove(slug);
    message = "";
    const info = await store.storageInfo();
    const check = spaceCheck({ needBytes: storyBytes(story).bytes, ...info });
    if (!check.fits) {
      message = spaceMessage(check);
      render();
      return;
    }
    render();
    store.startJob([story]);
  }

  button.addEventListener("click", onClick);
  const stop = store.subscribe(() => { message = ""; render(); });
  loadLibrary().then((lib) => {
    if (disposed) return;
    story = lib?.bySlug.get(slug) ?? null;
    if (!story?.audioUrl) el.hidden = true;
    else render();
  });

  return () => {
    disposed = true;
    button.removeEventListener("click", onClick);
    stop();
  };
}
```

`main.js`: add `"offline-save"` to `NAMES`.

`site/_includes/story.njk`: inside `.story-actions`, right after the Play `<button>` block's `{% endif %}`, add

```njk
      {% if audioUrl %}<div class="offline-save" data-mount="offline-save" data-slug="{{ slug }}"></div>{% endif %}
```

**Step 4:** `npx vitest run test/js/offline-save.test.mjs test/templates test/js/main.test.mjs` → PASS. If a template test counts `data-mount` roots or checks the main.js `NAMES` list against `docs/contracts.md`, update that expectation (and the contract list in Task 1 already names `offline-save`).

**Step 5: Docs.** In `site/assets/js/README.md` add a section:

```markdown
## `offline-save`

`<div class="offline-save" data-mount="offline-save" data-slug>` on a story with audio. Builds one
`button.btn[data-role="save"]` (`data-state="none|saving|queued|saved|stale"`, `aria-pressed="true"`
when saved) and `p.offline-note[role="status"][data-role="note"]`. Hides itself (`hidden`) where the
browser has no Cache API or service worker, or the story has no audio. Everything comes from
`library.json` and `offline.mjs`.
```
and one line for `offline-page` (Task 11) after it is built.

**Step 6: Styles** (put in `site/assets/css/offline.css`, created in Task 11 Step 5; if you reach this first, create the file now and link it in `base.njk` straight after `lore.css`):

```css
/* Offline listening (Save for offline button, notes) */
.offline-save { display: flex; flex-direction: column; gap: 0.35rem; }
.offline-save-button { min-height: var(--tap); }
.offline-save-button[aria-pressed="true"] { border-color: var(--accent); }
.offline-note { margin: 0; color: var(--muted); font-size: var(--text-small); }
.offline-note:empty { display: none; }
```
(`[aria-pressed="true"]` already gets accent styling from `base.css`. All colours are existing tokens.)

**Step 7: Commit** `"Offline: Save for offline button on the story page"`.

---

## Task 11: The Offline page

**Files:**
- Create: `site/offline.njk`
- Create: `site/assets/js/offline-page.mjs`
- Create: `site/assets/css/offline.css` (if not made in Task 10)
- Create: `test/js/offline-page.test.mjs`
- Modify: `site/_includes/base.njk` (stylesheet link)
- Modify: `site/_includes/dock-static.njk` (third dock link)
- Modify: `site/assets/js/main.js` (`NAMES` += `"offline-page"`)
- Modify: `test/templates/hooks.test.mjs` (dock links)
- Modify: `site/assets/js/README.md`, `site/assets/css/README.md`

**Step 1: Template** `site/offline.njk`

```njk
---
layout: base.njk
title: Offline
permalink: /offline/
---
<header class="page-head">
  <p class="eyebrow">Listen without a connection</p>
  <h1 class="page-title">Offline</h1>
</header>

{# Filled by script from library.json and what this tablet has saved. #}
<div class="offline-root" data-mount="offline-page">
  <p class="empty">Saving stories for offline needs scripts turned on.</p>
</div>
```

**Step 2: Dock link.** In `dock-static.njk` add a third `<li>` after Library:

```njk
      <li>
        <a class="dock-link" href="{{ '/offline/' | url }}"{% if page.url == '/offline/' %} aria-current="page"{% endif %}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>
          <span>Offline</span>
        </a>
      </li>
```
In `base.njk` add after the `lore.css` link: `<link rel="stylesheet" href="{{ '/assets/css/offline.css' | url }}?v={{ buildId }}">`.
In `test/templates/hooks.test.mjs` change the dock expectation to `["/Stories/", "/Stories/library/", "/Stories/offline/"]`. Check `site/assets/css/dock.css` still lays three links out (they are `flex: 1 1 0`, so yes) and that the dock module (`dock.mjs`) does not assume two links (`grep -n "dock-link\|dock-nav" site/assets/js/dock.mjs`).

**Step 3: Write the failing test** `test/js/offline-page.test.mjs`. It drives the page against a fake store and the fixture library. Use `library` from `helpers.mjs` after giving every story with `audioUrl` a size (the fixture has two worlds: `test-world` with two stories, `other-world` with one that has no audio).

```js
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { mount } from "../../site/assets/js/offline-page.mjs";
import * as offline from "../../site/assets/js/offline.mjs";
import { library, stubLibraryFetch, tick } from "./helpers.mjs";

// Fixture library: test-world has two stories with audio (first 9.6 MB, second estimated), other-world has none.
const lib = structuredClone(library);
lib.stories[0].audioUrl = "https://audio.example/a.mp3";
lib.stories[0].audioBytes = 9_600_000;
lib.stories[1].audioUrl = "https://audio.example/b.mp3";
lib.stories[1].durationSec = 1000; // estimated 16 MB
const [A, B] = lib.stories;

function fakeStore({ saved = [], job = null } = {}) {
  const listeners = new Set();
  const store = {
    ids: new Set(saved),
    job,
    status: (story) => (store.ids.has(story.slug) ? "saved" : "none"),
    saved: () => ({ count: store.ids.size, bytes: store.ids.size * 9_600_000 }),
    storageInfo: vi.fn(async () => ({ quota: 2e9, usage: 5e8 })),
    startJob: vi.fn(async () => {}),
    removeMany: vi.fn(async () => {}),
    cancel: vi.fn(),
    reconcile: vi.fn(async () => {}),
    getJob: () => store.job,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    emit: () => listeners.forEach((fn) => fn()),
  };
  return store;
}
// The page may use only these members of the store: status, saved, storageInfo, startJob,
// removeMany, cancel, reconcile, getJob, subscribe. Do not add others to the fake.

async function render(store, { online = true } = {}) {
  vi.spyOn(offline, "getStore").mockReturnValue(store);
  vi.spyOn(offline, "offlineSupported").mockReturnValue(true);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  document.documentElement.dataset.base = "/Stories";
  document.body.innerHTML = '<div data-mount="offline-page"></div>';
  stubLibraryFetch(lib);
  resetLibrary();
  const el = document.querySelector("[data-mount]");
  const unmount = mount(el);
  await tick(); await tick(); await tick();
  return { el, unmount };
}
const text = (el, role) => el.querySelector(`[data-role="${role}"]`)?.textContent;
const click = (el, role) => el.querySelector(`[data-role="${role}"]`).click();

it("shows what is saved and how much room is left", ...)       // text(el,"meter-text") === "Saved on this tablet 19 MB · 1.5 GB free" for two saved stories
it("has an Everything row with the total still to save", ...)   // text(el,"all-detail") includes "2 stories", and the save button label includes "Save all"
it("lists only worlds that have stories with audio, with counts", ...) // one world section; its detail "0 of 2 saved"
it("Save all asks the store to save every unsaved story, after a space check", ...)
it("Save all is refused with the reason when it will not fit", ...) // storageInfo quota 1e7 usage 0 -> startJob not called, text(el,"notice") === "Needs 26 MB, 10 MB free"
it("a world expands to a checklist, and ticking stories shows the selection bar", ...)
it("the selection bar saves just the ticked stories", ...)
it("a saved story shows Remove instead of a checkbox", ...)
it("Remove all needs a second tap", ...)                        // first click changes the label to "Remove all? Tap again" and calls nothing; second click calls removeMany with all saved slugs
it("shows job progress with Cancel while saving", ...)           // job {state:"running", total:2, done:1, current: A.slug, bytesTotal:2.56e7, bytesDone:9.6e6, currentBytes:4.8e6}: text(el,"job-text") === "Saving 2 of 2 · 56%"; click "job-cancel" -> store.cancel
it("offers Retry after a failure", ...)                          // job {state:"error", failed:[B.slug]} -> text "1 could not be saved"; click "job-retry" -> startJob([B])
it("disables saving and says so while offline", ...)            // online=false -> save buttons disabled, text(el,"notice") === "You are offline. Saved stories still play."
it("rebuilds the lists only when something changes, not on every progress tick", ...) // grab a world toggle button, emit() with only job bytes changed -> the same element is still in the document and still the activeElement if focused
it("reconciles with the library when it loads", ...)             // store.reconcile called with the stories that have audio
it("stops listening when unmounted", ...)
```
Write each body concretely (use `expect(...)` against the DOM hooks listed below); the hooks are the contract between test and module.

**DOM hooks `offline-page.mjs` must emit** (`data-role` values): `meter-text`, `meter-bar` (`<progress>`), `notice` (`role="status"`), `job` (container, hidden when no job), `job-text`, `job-bar` (`<progress>`), `job-cancel`, `job-retry`, `all` (the Everything row), `all-detail`, `all-save`, `all-remove`, `world` (one per world, `data-world`), `world-toggle` (`aria-expanded`), `world-detail`, `world-save`, `world-remove`, `story` (`li`, `data-slug`), `story-pick` (checkbox), `story-state`, `story-remove`, `selection` (the bar, `hidden` when nothing ticked), `selection-save`, `selection-clear`.

**Step 4:** run → FAIL (module missing).

**Step 5: Implement** `site/assets/js/offline-page.mjs`

```js
// data-mount="offline-page": the Offline page. A storage meter, an Everything row,
// one row per world that expands to a checklist of its stories, a selection bar and
// the progress of the running download. Titles, worlds and sizes come from
// library.json; what is saved comes from the offline store.
import { h, renderIfChanged } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import * as offline from "./offline.mjs";
import { formatBytes, spaceCheck, spaceMessage, totalBytes } from "./offline-core.mjs";
import { paletteByName } from "./accent-colors.mjs";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** First press asks, second press (within 4 seconds) does it. */
function twoStep(button, ask, action) {
  const label = button.textContent;
  let timer = null;
  button.addEventListener("click", () => {
    if (timer === null) {
      button.textContent = ask;
      timer = setTimeout(() => { timer = null; button.textContent = label; }, 4000);
      return;
    }
    clearTimeout(timer);
    timer = null;
    button.textContent = label;
    action();
  });
}

export function mount(el) {
  if (!offline.offlineSupported()) {
    el.replaceChildren(h("p", { class: "empty" }, "This browser cannot save stories for offline."));
    return () => {};
  }
  const store = offline.getStore();
  let library = null;
  let info = { quota: undefined, usage: undefined };
  let notice = "";
  let disposed = false;
  const open = new Set();
  const picked = new Set();

  const meter = h("section", { class: "offline-meter", "aria-label": "Storage on this tablet" });
  const jobBox = h("div", { class: "offline-job", "data-role": "job", hidden: true });
  const noticeEl = h("p", { class: "offline-note", role: "status", "data-role": "notice" });
  const lists = h("div", { class: "offline-lists" });
  const selection = h("div", { class: "offline-selection", "data-role": "selection", hidden: true });
  el.replaceChildren(meter, jobBox, noticeEl, lists, selection);

  const online = () => navigator.onLine !== false;
  const withAudio = () => (library?.stories ?? []).filter((s) => s.audioUrl);
  const unsaved = (stories) => stories.filter((s) => store.status(s) !== "saved");
  const savedSlugs = (stories) => stories.filter((s) => store.status(s) === "saved").map((s) => s.slug);

  async function refreshInfo() {
    info = await store.storageInfo();
    if (!disposed) renderMeter();
  }

  async function saveStories(list) {
    if (list.length === 0) return;
    if (!online()) { setNotice("You are offline. Saved stories still play."); return; }
    info = await store.storageInfo();
    const check = spaceCheck({ needBytes: totalBytes(list).bytes, ...info });
    if (!check.fits) { setNotice(spaceMessage(check)); renderMeter(); return; }
    setNotice("");
    picked.clear();
    store.startJob(list);
  }

  function setNotice(text) {
    notice = text;
    noticeEl.textContent = online() ? notice : "You are offline. Saved stories still play.";
  }

  // ---- meter ----
  function renderMeter() {
    const saved = store.saved();
    const free = Number.isFinite(info.quota) && Number.isFinite(info.usage) ? Math.max(0, info.quota - info.usage) : null;
    const parts = [`Saved on this tablet ${formatBytes(saved.bytes)}`];
    if (free !== null) parts.push(`${formatBytes(free)} free`);
    const bar = free !== null
      ? h("progress", { class: "offline-bar", "data-role": "meter-bar", max: saved.bytes + free || 1, value: saved.bytes, "aria-label": "Storage used by saved stories" })
      : null;
    meter.replaceChildren(h("p", { class: "offline-meter-text", "data-role": "meter-text" }, parts.join(" · ")), bar);
  }

  // ---- job ----
  function renderJob() {
    const job = store.getJob();
    jobBox.hidden = !job;
    if (!job) return;
    const pct = job.bytesTotal ? Math.min(99, Math.round(((job.bytesDone + job.currentBytes) / job.bytesTotal) * 100)) : 0;
    let textNode;
    const controls = [];
    if (job.state === "running") {
      textNode = `Saving ${Math.min(job.total, job.done + 1)} of ${job.total} · ${pct}%`;
      controls.push(
        h("progress", { class: "offline-bar", "data-role": "job-bar", max: 100, value: pct, "aria-label": "Download progress" }),
        h("button", { type: "button", class: "btn", "data-role": "job-cancel" }, "Cancel"),
      );
    } else if (job.state === "done") textNode = job.total ? `Saved ${plural(job.done, "story", "stories")}.` : "Everything chosen is already saved.";
    else if (job.state === "cancelled") textNode = `Cancelled. ${plural(job.done, "story", "stories")} saved.`;
    else {
      textNode = `${job.failed.length} could not be saved`;
      controls.push(h("button", { type: "button", class: "btn btn-primary", "data-role": "job-retry" }, "Retry"));
    }
    jobBox.replaceChildren(h("p", { "data-role": "job-text" }, textNode), ...controls);
    jobBox.querySelector('[data-role="job-cancel"]')?.addEventListener("click", () => store.cancel());
    jobBox.querySelector('[data-role="job-retry"]')?.addEventListener("click", () => {
      const failed = new Set(job.failed);
      saveStories(withAudio().filter((s) => failed.has(s.slug)));
    });
  }

  // ---- the lists (rebuilt only when the saved set, the open worlds or the ticks change) ----
  function signature() {
    return JSON.stringify([
      withAudio().map((s) => [s.slug, store.status(s)]),
      [...open].sort(),
      [...picked].sort(),
      online(),
      store.getJob()?.state === "running",
    ]);
  }

  function renderLists() {
    const all = withAudio();
    renderIfChanged(lists, signature(), () => {
      if (all.length === 0) return [h("p", { class: "empty" }, "No stories with audio yet.")];
      const busy = store.getJob()?.state === "running";
      const left = unsaved(all);
      const savedAll = savedSlugs(all);
      const leftSize = totalBytes(left);

      const everything = h(
        "section",
        { class: "offline-row offline-all", "data-role": "all" },
        h("div", { class: "offline-row-text" },
          h("h2", { class: "offline-row-title" }, "Everything"),
          h("p", { class: "offline-row-detail", "data-role": "all-detail" },
            `${plural(all.length, "story", "stories")} · ${savedAll.length} saved${left.length ? ` · ${formatBytes(leftSize.bytes, leftSize.exact)} left to save` : ""}`)),
        h("div", { class: "offline-row-actions" },
          h("button", { type: "button", class: "btn btn-primary", "data-role": "all-save", disabled: busy || !online() || left.length === 0 }, "Save all"),
          savedAll.length ? h("button", { type: "button", class: "btn", "data-role": "all-remove", disabled: busy }, "Remove all") : null),
      );
      everything.querySelector('[data-role="all-save"]').addEventListener("click", () => saveStories(left));
      const removeAll = everything.querySelector('[data-role="all-remove"]');
      if (removeAll) twoStep(removeAll, "Remove all? Tap again", () => store.removeMany(savedAll));

      const worlds = (library.worlds ?? []).map((world) => worldSection(world, all.filter((s) => s.world === world.name), busy)).filter(Boolean);
      return [everything, ...worlds];
    });
    renderSelection();
  }

  function worldSection(world, stories, busy) {
    if (stories.length === 0) return null;
    const left = unsaved(stories);
    const savedIn = savedSlugs(stories);
    const size = totalBytes(left);
    const accent = paletteByName?.(world.accent) ?? null;
    const expanded = open.has(world.name);
    const section = h(
      "section",
      { class: "offline-row offline-world", "data-role": "world", "data-world": world.name, style: accent ? `--tile: ${accent.background}; --tile-ink: ${accent.text};` : null },
      h("button", { type: "button", class: "offline-world-toggle", "data-role": "world-toggle", "aria-expanded": String(expanded) },
        h("span", { class: "offline-row-title" }, world.title),
        h("span", { class: "offline-row-detail", "data-role": "world-detail" },
          `${savedIn.length} of ${stories.length} saved${left.length ? ` · ${formatBytes(size.bytes, size.exact)} to save` : ""}`)),
      h("div", { class: "offline-row-actions" },
        left.length ? h("button", { type: "button", class: "btn btn-primary", "data-role": "world-save", disabled: busy || !online() }, "Save") : null,
        savedIn.length ? h("button", { type: "button", class: "btn", "data-role": "world-remove", disabled: busy }, "Remove") : null),
    );
    section.querySelector('[data-role="world-toggle"]').addEventListener("click", () => {
      if (open.has(world.name)) open.delete(world.name); else open.add(world.name);
      renderLists();
    });
    section.querySelector('[data-role="world-save"]')?.addEventListener("click", () => saveStories(left));
    const remove = section.querySelector('[data-role="world-remove"]');
    if (remove) twoStep(remove, "Remove? Tap again", () => store.removeMany(savedIn));
    if (expanded) section.append(storyList(stories, busy));
    return section;
  }

  function storyList(stories, busy) {
    return h("ul", { class: "offline-stories" }, stories.map((story) => {
      const status = store.status(story);
      const bytes = totalBytes([story]);
      const label = `${story.title}, ${formatBytes(bytes.bytes, bytes.exact)}`;
      const state = status === "saved" ? "Saved" : status === "stale" ? "Update available" : "Not saved";
      const control = status === "saved"
        ? h("button", { type: "button", class: "btn", "data-role": "story-remove", "aria-label": `Remove ${story.title}`, disabled: busy }, "Remove")
        : h("input", { type: "checkbox", "data-role": "story-pick", "aria-label": `Select ${label}`, checked: picked.has(story.slug), disabled: busy || !online() });
      const li = h("li", { class: "offline-story", "data-role": "story", "data-slug": story.slug },
        control,
        h("span", { class: "offline-story-title" }, story.title),
        h("span", { class: "offline-story-size" }, formatBytes(bytes.bytes, bytes.exact)),
        h("span", { class: "offline-story-state", "data-role": "story-state" }, state));
      li.querySelector('[data-role="story-pick"]')?.addEventListener("change", (e) => {
        if (e.target.checked) picked.add(story.slug); else picked.delete(story.slug);
        renderLists();
      });
      li.querySelector('[data-role="story-remove"]')?.addEventListener("click", () => store.removeMany([story.slug]));
      return li;
    }));
  }

  function renderSelection() {
    const chosen = withAudio().filter((s) => picked.has(s.slug) && store.status(s) !== "saved");
    selection.hidden = chosen.length === 0;
    if (chosen.length === 0) { selection.replaceChildren(); return; }
    const size = totalBytes(chosen);
    const save = h("button", { type: "button", class: "btn btn-primary", "data-role": "selection-save" }, `Save ${plural(chosen.length, "story", "stories")} · ${formatBytes(size.bytes, size.exact)}`);
    const clear = h("button", { type: "button", class: "btn", "data-role": "selection-clear" }, "Clear");
    save.addEventListener("click", () => saveStories(chosen));
    clear.addEventListener("click", () => { picked.clear(); renderLists(); });
    selection.replaceChildren(save, clear);
  }

  function renderAll() {
    if (disposed) return;
    noticeEl.textContent = online() ? notice : "You are offline. Saved stories still play.";
    renderMeter();
    renderJob();
    renderLists();
  }

  const stop = store.subscribe(() => { renderAll(); refreshInfo(); });
  const onNet = () => renderAll();
  window.addEventListener("online", onNet);
  window.addEventListener("offline", onNet);

  renderMeter();
  loadLibrary().then(async (lib) => {
    if (disposed || !lib) return;
    library = lib;
    if (online()) { try { await store.reconcile(withAudio()); } catch { /* try again next visit */ } }
    renderAll();
    refreshInfo();
  });

  return () => {
    disposed = true;
    stop();
    window.removeEventListener("online", onNet);
    window.removeEventListener("offline", onNet);
  };
}
```

Notes for the implementer: `paletteByName` may not be exported by the client `accent-colors.mjs` (the build-time one is `scripts/accent-colors.mjs`). Check `grep -n "export" site/assets/js/accent-colors.mjs` and how `world-switcher.mjs` resolves a world's accent; use that same function and drop the `?.` guard. A job in `error` state must not be hidden by a later `renderLists` signature check (the signature includes the running flag only; the job box re-renders every time).

Add `"offline-page"` to `NAMES` in `main.js`.

**Step 6: CSS** (`site/assets/css/offline.css`; extends the file from Task 10). Tokens only; every control `min-height: var(--tap)`:

```css
.offline-root { display: flex; flex-direction: column; gap: 1rem; padding-bottom: calc(var(--dock-h) + 5rem); }

.offline-meter { background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 1rem; }
.offline-meter-text { margin: 0 0 0.6rem; font-weight: 700; }
.offline-bar { display: block; width: 100%; height: 8px; border: 0; border-radius: 8px; background: var(--raised); overflow: hidden; appearance: none; }
.offline-bar::-webkit-progress-bar { background: var(--raised); border-radius: 8px; }
.offline-bar::-webkit-progress-value { background: var(--accent); border-radius: 8px; }
.offline-bar::-moz-progress-bar { background: var(--accent); border-radius: 8px; }

.offline-job { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
.offline-job[hidden], .offline-selection[hidden] { display: none; }
.offline-job p { margin: 0; }

.offline-row { background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 1rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.offline-world { border-left: 6px solid var(--tile, var(--accent)); }
.offline-row-text, .offline-world-toggle { flex: 1 1 14rem; min-width: 0; }
.offline-row-title { margin: 0; font-family: var(--font-display); font-size: 1.35rem; font-weight: 500; }
.offline-row-detail { display: block; margin: 0.15rem 0 0; color: var(--muted); font-size: var(--text-small); }
.offline-row-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.offline-world-toggle { display: flex; flex-direction: column; align-items: flex-start; min-height: var(--tap); padding: 0; background: none; border: 0; color: var(--text); text-align: left; cursor: pointer; font: inherit; }
.offline-world-toggle[aria-expanded="true"] .offline-row-title::after { content: " ▾"; }
.offline-world-toggle[aria-expanded="false"] .offline-row-title::after { content: " ▸"; }

.offline-stories { flex: 1 1 100%; list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.offline-story { display: grid; grid-template-columns: var(--tap) minmax(0, 1fr) auto; align-items: center; column-gap: 0.75rem; min-height: var(--tap); padding: 0.4rem 0; border-top: 1px solid var(--line-soft); }
.offline-story input[type="checkbox"] { width: 24px; height: 24px; margin: 0 auto; accent-color: var(--accent); }
.offline-story-title { overflow-wrap: anywhere; }
.offline-story-size, .offline-story-state { color: var(--muted); font-size: var(--text-small); white-space: nowrap; }
.offline-story-state { grid-column: 2 / 4; }

.offline-selection { position: sticky; bottom: calc(var(--dock-h) + 0.75rem); display: flex; gap: 0.5rem; align-items: center; justify-content: space-between; background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius); padding: 0.75rem; box-shadow: 0 6px 24px rgb(0 0 0 / 0.45); }
```

Check there is no stray `--tile` fallback issue and that `.offline-note:empty` exists (Task 10). Run `npm run check-token-contrast` and `npm run check-solid-fill-contrast` (they read `tokens.css` only; no new tokens were added).

**Step 7:** `npx vitest run test/js/offline-page.test.mjs test/templates test/js` → PASS. Then rebuild (Task 8 Step 5 commands) and open `_site/offline/index.html` through `npm run serve`-equivalent only if a browser check is wanted; the e2e covers it (Task 14).

**Step 8: Docs.** README entry for `offline-page` (root, hooks above, that it never uses `innerHTML`); CSS README table row; `docs/contracts.md` section 3 already lists the name.

**Step 9: Commit** `"Offline: the Offline page, dock link and styles"`.

---

## Task 12: Library "Saved" filter and badge

**Files:**
- Modify: `site/assets/js/selectors.mjs` (`matchesFilters`)
- Modify: `site/assets/js/library-state.mjs` (`readView`/`writeView`)
- Modify: `site/assets/js/filters.mjs`
- Modify: `site/_includes/story-row.njk`
- Modify: `site/assets/css/offline.css`
- Modify: `test/js/library-selectors.test.mjs`, `test/js/library-browse.test.mjs` (or the files that already cover filters)

Read `filters.mjs` first: the "Has audio" chip (`state.audio`) is the pattern to copy end to end (state field, `readView`/`writeView` persistence, the chip in the sheet, the active-filter chip, the count badge, `matchesFilters`).

**Step 1: Write the failing tests**

In `test/js/library-selectors.test.mjs` (follow the file's existing style and helpers):

```js
it("filters to saved stories when f.saved is on", () => {
  const stories = library.stories;
  const f = { saved: true, savedSlugs: new Set([stories[0].slug]) };
  expect(stories.filter((s) => matchesFilters(s, undefined, f)).map((s) => s.slug)).toEqual([stories[0].slug]);
});

it("ignores f.saved when it is off or has no set", () => {
  expect(library.stories.every((s) => matchesFilters(s, undefined, { saved: false }))).toBe(true);
  expect(library.stories.every((s) => matchesFilters(s, undefined, { saved: true }))).toBe(false);
});
```
In the Library browse test file: mount `filters` with a fake offline store whose `savedSlugs()` returns one slug and assert (a) a "Saved" chip exists in the Filters sheet (`aria-pressed`), (b) pressing it shows only that story, (c) the saved row carries `data-offline="saved"`, (d) the chip is absent when `offlineSupported()` is false, (e) while `navigator.onLine` is false, rows that are not saved carry `data-offline="unavailable"`.

**Step 2:** run → FAIL.

**Step 3: Implement**

- `selectors.mjs` `matchesFilters`: after the `f.audio` line add
  `if (f.saved && !f.savedSlugs?.has(story.slug)) return false;`
- `library-state.mjs`: add `saved: raw.saved === true` in `readView` (and in its returned shape/JSDoc) and persist `saved` in `writeView` exactly as `audio` is.
- `filters.mjs`: mirror `audio` with `saved` (state field, chip labelled "Saved on this tablet", active-filter chip "Saved", counts as an active filter, passes `saved` and `savedSlugs: store.savedSlugs()` into `matchesFilters`). Only add the chip when `offline.offlineSupported()`. Re-run the filter when `stories:offline` fires (and on `online`/`offline` window events). For each row set `row.dataset.offline = "saved"` when saved, `"unavailable"` when `navigator.onLine === false` and not saved, else delete the attribute. Import the store as `import * as offline from "./offline.mjs"` so tests can spy.
- A press on a row's Play or title link while it is `data-offline="unavailable"` should not strand the user: the link navigates (the service worker shows the Offline page), and the Play button already no-ops without audio. Do not add click handlers for this.
- `story-row.njk`: after `<span class="badge-new">New</span>` add `<span class="badge-saved" data-role="saved-badge">Saved</span>`.
- `offline.css`:

```css
.badge-saved { display: none; margin-left: 0.4rem; padding: 0.1rem 0.5rem; border: 1px solid var(--line); border-radius: var(--radius-pill); color: var(--text); font-size: 0.75rem; font-weight: 700; }
.row[data-offline="saved"] .badge-saved { display: inline-block; }
.row[data-offline="unavailable"] { opacity: 0.55; }
```
Use the same colours/shape logic as `.badge-new` in `base.css`; text is `--text` on `--surface`, which passes. (Opacity dims the whole row, which is the point; the title stays readable because dimming is a hint, not the only signal. Also set `aria-description="Not saved on this tablet"` on the row title link while unavailable, in `filters.mjs`.)

**Step 4:** `npx vitest run test/js` → PASS.

**Step 5: Docs.** Add `stories:offline` re-run note and the `data-offline` attribute to `site/assets/js/README.md` (`filters` section) and the CSS README.

**Step 6: Commit** `"Offline: Saved filter, badge and dimming in the Library"`.

---

## Task 13: Reconcile on every page and keep the saved pages fresh

**Files:**
- Modify: `site/assets/js/offline-register.mjs` (or a tiny new call in `main.js`)
- Test: add to `test/js/offline-register.test.mjs`

The Offline page reconciles when it opens (Task 11). Also reconcile once per full page load while online, so a deploy that cleared the shell cache re-fetches saved stories' pages without the user opening the Offline page.

**Step 1: Failing test** (append to `offline-register.test.mjs`):

```js
import * as offline from "../../site/assets/js/offline.mjs";
import * as library from "../../site/assets/js/library.mjs";

it("reconciles the saved stories once the worker is registered and the library loads", async () => {
  const nav = fakeNav();
  const store = { reconcile: vi.fn(async () => {}) };
  vi.spyOn(offline, "getStore").mockReturnValue(store);
  vi.spyOn(library, "loadLibrary").mockResolvedValue({ stories: [{ slug: "a", audioUrl: "https://x/a.mp3" }, { slug: "b" }] });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "", reconcile: true });
  expect(store.reconcile).toHaveBeenCalledWith([{ slug: "a", audioUrl: "https://x/a.mp3" }]);
});
```
(If `vi.spyOn` on module exports is not allowed, inject `reconcile` as a function option instead: `registerOffline({..., reconcileLibrary})`, defaulting to the real one. Prefer injection.)

**Step 2:** run → FAIL.

**Step 3: Implement.** After a successful `register(...)`, when `navigator.onLine !== false`:

```js
    if (reconcile) {
      Promise.all([import("./library.mjs"), import("./offline.mjs")])
        .then(async ([{ loadLibrary }, { getStore, offlineSupported }]) => {
          if (!offlineSupported()) return;
          const lib = await loadLibrary();
          if (lib) await getStore().reconcile(lib.stories.filter((s) => s.audioUrl));
        })
        .catch(() => {});
    }
```
with `reconcile = true` as a default option (tests pass `false` where they do not want it).

**Step 4:** `npx vitest run test/js` → PASS.

**Step 5: Commit** `"Offline: reconcile saved stories after registering"`.

---

## Task 14: End-to-end test

**Files:**
- Create: `test/e2e/offline.e2e.mjs`
- Modify: `playwright.config.mjs` (only if Step 3 says so)

The fixture site (`test/e2e/support/`) already has two stories with `audioUrl` on the audio origin (`audioUrlOf`), the audio is served by `routeAudio(context)`, and the build includes the new template, page and worker automatically (it copies `site/` and `scripts/`).

**Step 1: Write the test**

```js
// Offline listening, in a real browser: save a story, go offline, reload, play and seek it, remove it.
import { expect, test } from "@playwright/test";
import { routeAudio } from "./support/audio.mjs";
import { expectNoViolations, watchForViolations } from "./support/guards.mjs";

const HOME = "/Stories/";
const OFFLINE = "/Stories/offline/";
const ONE = "/Stories/stories/e2e-series/tale-one/";

test.beforeEach(async ({ page, context }) => {
  await routeAudio(context);
  await watchForViolations(page);
});
test.afterEach(async ({ page }) => expectNoViolations(page));

async function controlled(page, url) {
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // the first load is not controlled by the new worker
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

const audio = (page) => page.evaluate(() => {
  const a = document.querySelector("audio");
  return { time: a.currentTime, paused: a.paused, error: a.error?.code ?? null, slug: a.dataset.slug ?? null };
});

test("a saved story plays and seeks with no network, and can be removed", async ({ page, context }) => {
  await controlled(page, ONE);

  const save = page.getByRole("button", { name: /^Save for offline/ });
  await expect(save).toBeVisible();
  await save.click();
  const saved = page.getByRole("button", { name: "Saved for offline" });
  await expect(saved).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);
  await page.goto(ONE); // served by the worker from the shell cache
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tale One");
  await page.getByRole("button", { name: /^Play/ }).first().click();
  await expect.poll(async () => (await audio(page)).time, { timeout: 10_000 }).toBeGreaterThan(0.5);
  await page.evaluate(() => { document.querySelector("audio").currentTime = 20; });
  await expect.poll(async () => (await audio(page)).time, { timeout: 10_000 }).toBeGreaterThanOrEqual(20);
  expect((await audio(page)).error).toBeNull();

  await context.setOffline(false);
  await page.getByRole("button", { name: "Saved for offline" }).click();
  await expect(page.getByRole("button", { name: /^Save for offline/ })).toBeVisible();
});

test("the Offline page shows the meter, saves a world and reports it", async ({ page }) => {
  await controlled(page, OFFLINE);
  await expect(page.getByRole("heading", { level: 1, name: "Offline" })).toBeVisible();
  await expect(page.locator('[data-role="meter-text"]')).toContainText("Saved on this tablet");
  await page.locator('[data-role="all-save"]').click();
  await expect(page.locator('[data-role="job-text"]')).toContainText(/Saved 2 stories|Saving/, { timeout: 20_000 });
  await expect(page.locator('[data-role="all-detail"]')).toContainText("2 saved", { timeout: 20_000 });
  await page.locator('[data-role="all-remove"]').click();
  await page.locator('[data-role="all-remove"]').click(); // second tap confirms
  await expect(page.locator('[data-role="all-detail"]')).toContainText("0 saved");
});

test("offline, an unsaved page shows the Offline page rather than a browser error", async ({ page, context }) => {
  await controlled(page, HOME);
  await context.setOffline(true);
  await page.goto("/Stories/stories/e2e-series/tale-two/");
  await expect(page.getByRole("heading", { level: 1, name: "Offline" })).toBeVisible();
  await context.setOffline(false);
});

test("?sw=off unregisters the worker", async ({ page }) => {
  await controlled(page, HOME);
  await page.goto(`${HOME}?sw=off`);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await page.goto(`${HOME}?sw=on`);
});
```
(The fixture story count on the Offline page: `FIXTURE_STORIES` has two stories with audio, so "2 saved". If the fixture changes, derive from `FIXTURE_STORIES.filter(s => s.audio).length`.) If `watchForViolations` flags the service worker's own console output or a CSP report, read `support/guards.mjs` to see what it catches and fix the cause rather than loosening the guard.

**Step 2:** `npm run test:e2e -- offline.e2e.mjs` → FAIL first (nothing built), then iterate until PASS.

**Step 3: If audio is not intercepted.** `context.route` should also catch the worker's own requests in Chromium. If saving fails because the worker's audio fetch reached the real network, set `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` at the top of `playwright.config.mjs` (`process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= "1";`) and re-run. Do not add real network access to the e2e.

**Step 4:** `npm run test:e2e` (the whole suite) → PASS. The existing smoke tests must still pass: in particular "the router keeps the same `<audio>` element" must not be disturbed by the worker's `skipWaiting`/`claim`. If it is, the cause is the worker taking over mid-test; fix by registering on `load` only (already done) rather than weakening the test.

**Step 5: Commit** `"Offline: end-to-end test"`.

---

## Task 15: Docs, full verification and the device test

**Files:**
- Modify: `docs/audio-hosting.md` (CORS section)
- Modify: `CLAUDE.md` (project): one paragraph under "App layout and contracts"
- Modify: `site/assets/js/README.md`, `site/assets/css/README.md` (if not finished)

**Step 1: `docs/audio-hosting.md`.** Add a section "CORS (offline saving)": the rule from Task 0, why (offline saves fetch the audio with CORS; opaque responses are padded to about 7 MB each in Chrome), how it was applied with the `cf` CLI, and the verify `curl`. Add `audioBytes` to the front matter example next to `audioDuration`.

**Step 2: `CLAUDE.md`** add (keep it short, no story text or world canon):

```markdown
- **Offline**: `sw.js` (emitted by `site/sw.js.11ty.js`, logic in `site/assets/js/sw-logic.mjs`) caches the
  shell and serves saved mp3s with Range support; `offline.mjs` is the store, the Offline page and the
  story page button sit on top. Rules in `docs/contracts.md` section 9, design in
  `docs/plans/2026-11-12-offline-listening-design.md`. `?sw=off` is the kill switch. The audio host
  needs the CORS rule in `docs/audio-hosting.md`. Do not deploy a build with a precache entry that 404s:
  the worker's install fails and offline silently never turns on.
```

**Step 3: Full verification** (use @superpowers:verification-before-completion; paste real output, never assume):
```bash
npx vitest run
npm run check-token-contrast && npm run check-solid-fill-contrast
npm run validate && npm run validate-world-data
npm run generate-icons && npx @11ty/eleventy
npm run test:e2e
node -e "const l=JSON.parse(require('fs').readFileSync('_site/library.json','utf8'));console.log(l.stories.filter(s=>s.audioUrl).length,'with audioUrl;',l.stories.filter(s=>s.audioBytes).length,'with audioBytes')"
grep -c "offline" _site/sw.js
```
Expected: all tests pass; the story counts match (every story with audio has `audioBytes` once Task 4 Step 6 ran, otherwise the second number is lower and the UI shows `~` sizes); `sw.js` lists `/Stories/offline/`.

**Step 4: Real-device checklist** (the user does this on a Galaxy Tab A9, over wifi, after deploy; tell them exactly this):
1. Open `https://robertbeverton.github.io/Stories/` in Chrome, menu → **Add to Home screen**, open it from the icon.
2. Offline tab: the meter reads a sensible free space (GBs, not 0).
3. Save two stories. Watch the progress; lock the screen for a minute mid-download and unlock (a partial story must resume as "Retry" or restart, never show as saved).
4. Turn on airplane mode. Close the app fully, reopen from the icon: Home, Library and Offline load; saved stories show the Saved badge and the others look dimmed.
5. Play a saved story with headphones, seek around, lock the screen, resume from the lock screen controls, let the sleep timer run.
6. Try an unsaved story: the Offline page appears instead of an error.
7. Turn wifi back on, remove one story, confirm the meter drops.

**Step 5: Finish.** Use @superpowers:finishing-a-development-branch. Remind the user of the two deploy prerequisites: the R2 CORS rule is live (Task 0) and the world repos' `audioBytes` front matter is committed (Task 4 Step 6). Without CORS, saving fails with a clear "Could not save" and nothing else breaks.

**Step 6: Commit** `"Offline: docs and verification"`.

---

## Notes and known risks

- **Opaque vs CORS:** the whole size meter depends on the CORS rule. Task 0 is therefore a blocker for production use, not for the tests (they stub the audio origin).
- **Module service worker** needs Chrome 91+ (the A9 is far newer). `updateViaCache: "none"` keeps the worker and its imports from sticking in the HTTP cache on GitHub Pages (`max-age=600`).
- **Storage eviction** is mitigated by `navigator.storage.persist()` and by installing to the home screen; `reconcile()` repairs the index if it happens anyway.
- **Screen lock** can pause a download. The job reports the failed stories and Retry restarts only those. A Wake Lock is deliberately out of scope (YAGNI) until the device test shows it matters.
- **Router kill switch** and the **worker kill switch** are independent; either leaves the site working.
- **Build id stays stable** for unchanged inputs: `sw.js.11ty.js` uses the same `BUILD_ID`, so the nightly build does not install a new worker.
