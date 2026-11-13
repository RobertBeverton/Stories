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
