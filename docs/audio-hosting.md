# Audio hosting (Cloudflare R2)

Story audio lives in one Cloudflare R2 bucket, served from a custom domain. Each story's front matter points at its file with `audioUrl` (plus `audioDuration`). `npm run narrate` makes a story's mp3 and `npm run upload-audio` hosts it and writes those fields back (see [narrator/README.md](../narrator/README.md)). Every narrated story is served from here.

## At a glance

| | |
|---|---|
| Bucket | `stories-audio` |
| Location hint | `WEUR` (Western Europe), Standard storage class |
| Public URL | `https://audio.kinly.download` (zone `kinly.download`, minimum TLS 1.2) |
| r2.dev public access | **Off**. It's rate-limited and meant for development, so don't turn it on. |

## Key layout

One folder per world, named after that world's `name` in `content-sources.json`. Under it, the key mirrors the story's path under the world's `stories/` folder, with `.md` swapped for `.mp3`:

| Story file | Object key |
|---|---|
| `isles-of-yum` → `stories/marzipans-well.md` | `isles-of-yum/marzipans-well.mp3` |
| `bramble-wall` → `stories/bramble-wall/book-1.md` | `bramble-wall/bramble-wall/book-1.mp3` |

Keys are case-sensitive and use forward slashes. Don't percent-encode the slashes.

## URLs and caching

Re-narrating a story **overwrites the same key**. To make sure listeners get the new file, the URL in front matter carries a version query:

```yaml
audioUrl: https://audio.kinly.download/isles-of-yum/marzipans-well.mp3?v=3f9a2c1e
audioDuration: 412
audioBytes: 6592000
```

- `v` is a short hash of the file's contents (for example, the first 8 hex characters of its SHA-256). A new narration gives a new hash, so a new URL.
- Objects are uploaded with `Cache-Control: public, max-age=31536000, immutable`. Browsers and Cloudflare's edge can keep a URL forever, because the file behind a given `?v=` never changes in any way that matters.
- No cache purges are needed. After a re-narration, the new URL goes live with the next site deploy. The old `?v=` URL still works, but it may serve the new file once the edge copy expires, which is harmless.
- `Content-Type` must be `audio/mpeg`.

The `cf` CLI's object upload can't set `Cache-Control`. A file uploaded with it gets Cloudflare's default caching (a couple of hours at the edge). That's fine for a one-off, but the narrator tool and Wrangler uploads should set the header.

## CORS

The bucket allows:

| | |
|---|---|
| Origins | `https://robertbeverton.github.io`, `http://localhost:8080` |
| Methods | `GET`, `HEAD` |
| Allowed headers | `Range` |
| Exposed headers | `Content-Length`, `Content-Range`, `Accept-Ranges`, `ETag` |
| Preflight max age | 86400 s |

A plain `<audio src>` doesn't need CORS, but offline saving does. "Save for offline" reads the whole file with `fetch(audioUrl, { mode: "cors" })` and stores it in the Cache API (see [contracts.md](contracts.md) section 9). The rule required on `stories-audio` is:

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

The table above also lists `http://localhost:8080` for local testing; keep it in `AllowedOrigins` if it is already there.

**Why it is needed.** Without CORS the `fetch` is blocked and saving fails with "Could not save"; nothing else breaks and streaming still works. A `no-cors` fetch would succeed but give an opaque response, which Chrome pads to about 7 MB each against the storage quota and which the app cannot size-check, so the app does not use it.

**Applying it.** Use the `cf` CLI (it needs the Node 22 binary). Find the exact commands with `cf cli search "r2 cors"` and `cf schema`; the update replaces every rule, so read the current rules first and include them all.

**Verify** (the header must come back; the `?v=` is any real audio URL):

```bash
curl -sI -H "Origin: https://robertbeverton.github.io" "https://audio.kinly.download/isles-of-yum/marzipans-well.mp3?v=1b1eb345"
# expect: access-control-allow-origin: https://robertbeverton.github.io
```

If the custom domain's edge cached an earlier response without the header, try another `?v=` value or wait for expiry before purging anything.

## Credentials

The narrator tool reads these Windows **user** environment variables. They're set with `setx`, never written to a file.

| Variable | What |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID. The S3 endpoint is `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`. |
| `R2_ACCESS_KEY_ID` | Access key ID of an R2 API token |
| `R2_SECRET_ACCESS_KEY` | Secret access key of that token |
| `R2_BUCKET` | `stories-audio` |
| `AUDIO_BASE_URL` | `https://audio.kinly.download` (no trailing slash) |
| `ELEVENLABS_API_KEY` | ElevenLabs key for narration |

The R2 token has **Object Read & Write** on `stories-audio` only. Create a replacement in the dashboard: **R2 Object Storage → Manage API tokens → Create Account API token**. Rotating the token means updating `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, then opening a new terminal.

## Upload everything from the world repos

`npm run upload-audio` finds every narrated story in the sibling checkouts (`localPath` in `content-sources.json`), uploads its mp3 to the key above with the cache header, and writes `audioUrl` (with the `?v=` hash) and `audioDuration` into the story's front matter.

```bash
npm run upload-audio                                       # dry run: lists what it would do
npm run upload-audio -- --apply                            # upload and update front matter
npm run upload-audio -- --apply --world legend-lane --story fire-lady
```

- It needs the `R2_*` variables from Credentials (not for the dry run).
- A file already in the bucket with the same SHA-256 is not uploaded again, so re-running is safe. A re-narrated file gets a new `?v=`.
- Drafts, `audio: false` stories and stories with no mp3 are skipped.
- It never deletes or commits. Afterwards, check the site plays from the new URL, commit the front matter change in each world repo, then remove the committed mp3 there.

## Upload or delete one file by hand

### With Wrangler

Wrangler needs Node 22 or later and `npx wrangler login` once. `--remote` targets the real bucket rather than a local simulation.

```bash
# Upload (key = world/path-under-stories.mp3)
npx wrangler r2 object put stories-audio/isles-of-yum/marzipans-well.mp3 \
  --file ./marzipans-well.mp3 \
  --content-type audio/mpeg \
  --cache-control "public, max-age=31536000, immutable" \
  --remote

# Delete
npx wrangler r2 object delete stories-audio/isles-of-yum/marzipans-well.mp3 --remote
```

### With the `cf` CLI

`cf` also needs Node 22 or later and `cf auth login`. It can't set `Cache-Control` (see above).

```bash
cf r2 objects put isles-of-yum/marzipans-well.mp3 --bucket-name stories-audio \
  --content-type audio/mpeg --file ./marzipans-well.mp3
cf r2 objects list --bucket-name stories-audio
cf r2 objects delete isles-of-yum/marzipans-well.mp3 --bucket-name stories-audio --force
```

After uploading by hand, update the story's `audioUrl` (with a new `?v=`) and `audioDuration` in its world repo.

## Checking it works

```bash
URL=https://audio.kinly.download/<key>
curl -sI "$URL"                                   # 200, Content-Type: audio/mpeg
curl -s -o /dev/null -w "%{http_code}\n" -H "Range: bytes=0-99" "$URL"   # 206
curl -sI -H "Origin: https://robertbeverton.github.io" "$URL" | grep -i access-control
```
