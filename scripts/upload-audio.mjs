// Uploads each world repo's narration mp3s to the R2 bucket (docs/audio-hosting.md) and
// writes `audioUrl` and `audioDuration` back into the story's front matter.
//
//   node scripts/upload-audio.mjs                       # dry run: what would happen, nothing changes
//   node scripts/upload-audio.mjs --apply               # upload and update front matter
//   node scripts/upload-audio.mjs --apply --world legend-lane --story fire-lady
//
// Reads the world repos from `localPath` in content-sources.json (sibling checkouts), never
// from stories/. It does not delete or commit anything: afterwards, review and commit the
// front matter change in each world repo, then remove the committed mp3 once the site plays
// from the new URL.
//
// Key:  <world>/<path of the story under its storiesPath>.mp3   (docs/audio-hosting.md)
// URL:  <AUDIO_ORIGIN>/<key>?v=<first 8 hex of the file's SHA-256>
// Upload headers: Content-Type audio/mpeg, Cache-Control public, max-age=31536000, immutable.
// The full SHA-256 is stored as object metadata, so a re-run skips files that are already up.
//
// Credentials (Windows user env vars, see docs/audio-hosting.md): R2_ACCOUNT_ID,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET. Not needed for the dry run.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fg from "fast-glob";
import matter from "gray-matter";
import { parseFile } from "music-metadata";
import { AUDIO_ORIGIN, isAudioUrl } from "./audio-origin.mjs";
import { setFrontMatterField } from "./front-matter.mjs";
import { resolveAudioFile } from "./validate-content.mjs";

export const CACHE_CONTROL = "public, max-age=31536000, immutable";

export function parseArgs(argv) {
  const opts = { apply: false, world: null, story: null };
  const value = (i, flag) => {
    if (i >= argv.length || argv[i].startsWith("--")) throw new Error(`${flag} needs a value`);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--world") opts.world = value(++i, arg);
    else if (arg === "--story") opts.story = value(++i, arg);
    else throw new Error(`Unknown argument '${arg}'`);
  }
  return opts;
}

/** `isles-of-yum` + `stories/a/b.md` under `stories` -> `isles-of-yum/a/b.mp3` (forward slashes). */
export function objectKey(world, storiesRoot, storyFile) {
  const rel = path.relative(storiesRoot, storyFile).split(path.sep).join("/");
  return `${world}/${rel.replace(/\.md$/, ".mp3")}`;
}

export function versionedUrl(key, sha256, origin = AUDIO_ORIGIN) {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${origin}/${encoded}?v=${sha256.slice(0, 8)}`;
}

const sha256Of = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/**
 * Finds every narrated story of one world. A story with no mp3, a draft, or `audio: false`
 * is skipped, with the reason. Returns { items, skipped }.
 */
export async function planWorld(source, { readDuration = defaultDuration, origin = AUDIO_ORIGIN, only = null } = {}) {
  const storiesRoot = path.join(source.localPath, source.storiesPath || "stories");
  const items = [];
  const skipped = [];
  for (const rel of fg.sync("**/*.md", { cwd: storiesRoot }).sort()) {
    const storyFile = path.join(storiesRoot, rel);
    if (only && !rel.includes(only)) continue;
    const { data } = matter(fs.readFileSync(storyFile, "utf8"));
    if (data.draft) { skipped.push({ rel, reason: "draft" }); continue; }
    const audioName = resolveAudioFile({ file: storyFile, data });
    if (!audioName) { skipped.push({ rel, reason: "audio: false" }); continue; }
    const audioPath = path.join(path.dirname(storyFile), audioName);
    if (!fs.existsSync(audioPath)) { skipped.push({ rel, reason: "no mp3" }); continue; }
    const sha256 = sha256Of(audioPath);
    const key = objectKey(source.name, storiesRoot, storyFile);
    items.push({
      world: source.name,
      rel,
      storyFile,
      audioPath,
      key,
      sha256,
      url: versionedUrl(key, sha256, origin),
      durationSec: Math.round(await readDuration(audioPath)),
      currentUrl: typeof data.audioUrl === "string" ? data.audioUrl : null,
      currentDuration: data.audioDuration ?? null,
      bytes: fs.statSync(audioPath).size,
    });
  }
  return { items, skipped };
}

async function defaultDuration(file) {
  const metadata = await parseFile(file);
  return metadata.format.duration ?? 0;
}

/** Front matter text for one planned item (audioUrl and audioDuration), or null when it is already right. */
export function updatedStoryText(raw, item) {
  let next = setFrontMatterField(raw, "audioUrl", item.url);
  next = setFrontMatterField(next, "audioDuration", item.durationSec);
  return next === raw ? null : next;
}

export async function createClient(env = process.env) {
  const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Set ${missing.join(", ")} (see docs/audio-hosting.md, Credentials). Open a new terminal after setx.`);
  const { S3Client, HeadObjectCommand, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  const Bucket = env.R2_BUCKET;
  return {
    /** True when the object already holds a file with this SHA-256. */
    async isUploaded(key, sha256) {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
        return head.Metadata?.sha256 === sha256;
      } catch (err) {
        if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return false;
        throw err;
      }
    },
    async upload(key, file, sha256) {
      await s3.send(new PutObjectCommand({
        Bucket,
        Key: key,
        Body: fs.readFileSync(file),
        ContentType: "audio/mpeg",
        CacheControl: CACHE_CONTROL,
        Metadata: { sha256 },
      }));
    },
  };

}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** @returns the process exit code */
export async function run(argv, { log = console.log, error = console.error, sources = null, client = null } = {}) {
  const opts = parseArgs(argv);
  const all = sources ?? JSON.parse(fs.readFileSync("content-sources.json", "utf8"));
  const chosen = all.filter((s) => !opts.world || s.name === opts.world);
  if (opts.world && chosen.length === 0) {
    error(`No world '${opts.world}' in content-sources.json (${all.map((s) => s.name).join(", ")}).`);
    return 1;
  }

  const plans = [];
  for (const source of chosen) {
    if (!source.localPath || !fs.existsSync(source.localPath)) {
      log(`${source.name}: no local checkout at ${source.localPath ?? "(no localPath)"}, skipped.`);
      continue;
    }
    plans.push({ source, ...(await planWorld(source, { only: opts.story })) });
  }

  const items = plans.flatMap((p) => p.items);
  for (const { source, items: list, skipped } of plans) {
    log(`\n${source.name}: ${list.length} to host, ${skipped.length} skipped`);
    for (const item of list) {
      const state = item.currentUrl === item.url ? "up to date" : item.currentUrl ? "new narration" : "new";
      log(`  ${item.key}  ${mb(item.bytes)}  ${item.durationSec}s  [${state}]`);
    }
    for (const s of skipped) log(`  - ${s.rel}: ${s.reason}`);
  }
  if (items.some((i) => i.currentUrl && !isAudioUrl(i.currentUrl))) {
    log("\nNote: a story has an audioUrl that is not on the audio origin; it will be replaced.");
  }

  if (!opts.apply) {
    log(`\nDry run: ${items.length} file(s). Nothing uploaded or changed. Add --apply to do it.`);
    return 0;
  }

  let r2;
  try {
    r2 = client ?? (await createClient());
  } catch (err) {
    error(err.message);
    return 1;
  }

  let failed = 0;
  for (const item of items) {
    try {
      if (await r2.isUploaded(item.key, item.sha256)) {
        log(`= ${item.key} already uploaded`);
      } else {
        await r2.upload(item.key, item.audioPath, item.sha256);
        log(`^ ${item.key} uploaded`);
      }
      const raw = fs.readFileSync(item.storyFile, "utf8");
      const next = updatedStoryText(raw, item);
      if (next) {
        fs.writeFileSync(item.storyFile, next);
        log(`  ${item.rel}: audioUrl and audioDuration written`);
      }
    } catch (err) {
      failed++;
      error(`! ${item.key}: ${err.message}`);
    }
  }
  log(`\n${items.length - failed} done, ${failed} failed. Review the front matter change in each world repo and commit it.`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(err.message); process.exit(1); });
}
