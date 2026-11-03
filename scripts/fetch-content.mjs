// Pulls story content from the repos listed in content-sources.json into
// the local `stories/` folder, which the rest of the build reads exactly as
// it did when stories lived in this repo. `stories/` is gitignored here:
// this repo holds the site only, and each story world keeps its own repo.
//
// For each source:
//   - outside CI, if `localPath` exists (e.g. a sibling checkout at
//     ../isles-of-yum), copy from it, so local edits show up without a push;
//   - otherwise shallow-clone `repo` at `ref` into .content/<name>/ and copy
//     from there.
//
// Right now there is one source and its stories are copied straight into
// `stories/`, which keeps every existing URL unchanged. A second source would
// need a decision about where its stories land (e.g. `stories/<name>/`) and
// what that does to slugs and URLs. See README.md.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const OUT_DIR = "stories";
const CACHE_DIR = ".content";
// Copied alongside the stories but never part of the published site.
const SKIP = new Set([".narrate-cache"]);

export function resolveSourceDir(source, { isCI, exists }) {
  if (!isCI && source.localPath && exists(source.localPath)) {
    return { mode: "local", dir: source.localPath };
  }
  return { mode: "clone", dir: path.join(CACHE_DIR, source.name) };
}

function cloneOrUpdate(source, dir) {
  const ref = source.ref || "main";
  if (fs.existsSync(path.join(dir, ".git"))) {
    execFileSync("git", ["-C", dir, "fetch", "--depth", "1", "origin", ref], { stdio: "inherit" });
    execFileSync("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"], { stdio: "inherit" });
  } else {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    execFileSync("git", ["clone", "--depth", "1", "--branch", ref, source.repo, dir], { stdio: "inherit" });
  }
}

export function fetchContent(sources, { isCI = Boolean(process.env.CI) } = {}) {
  if (sources.length !== 1) {
    throw new Error(
      `content-sources.json lists ${sources.length} sources; only one is supported until multi-source layout is designed.`,
    );
  }
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  for (const source of sources) {
    const { mode, dir } = resolveSourceDir(source, { isCI, exists: fs.existsSync });
    if (mode === "clone") cloneOrUpdate(source, dir);
    const from = path.join(dir, source.storiesPath || "stories");
    if (!fs.existsSync(from)) throw new Error(`${source.name}: no stories folder at ${from}`);
    fs.cpSync(from, OUT_DIR, {
      recursive: true,
      filter: (src) => !SKIP.has(path.basename(src)),
    });
    console.log(`${source.name}: copied stories from ${from} (${mode})`);
  }
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  const sources = JSON.parse(fs.readFileSync("content-sources.json", "utf8"));
  fetchContent(sources);
}
