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
// Every source's stories are merged FLAT into one `stories/` folder, not
// nested under a per-world folder. That keeps each story's slug exactly what
// it was in its old repo/site, and slugs key reading progress in
// localStorage (`story-progress:<slug>`), which is shared across the whole
// robertbeverton.github.io origin. Nesting by world would silently reset
// everyone's progress. The cost: two worlds must never ship the same path,
// so the fetch fails loudly if they do (findCollisions below).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const OUT_DIR = "stories";
const CACHE_DIR = ".content";
// Copied alongside the stories but never part of the published site.
const SKIP = new Set([".narrate-cache"]);
// Harmless if several worlds ship one.
const PLACEHOLDERS = new Set([".gitkeep"]);

// filesBySource: { sourceName: ["relative/path.md", ...] }
export function findCollisions(filesBySource) {
  const owner = new Map();
  const errors = [];
  for (const [name, files] of Object.entries(filesBySource)) {
    for (const file of files) {
      if (PLACEHOLDERS.has(path.basename(file))) continue;
      if (owner.has(file)) errors.push(`stories/${file} is in both ${owner.get(file)} and ${name}`);
      else owner.set(file, name);
    }
  }
  return errors;
}

function listFiles(root, dir = root) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(root, full));
    else out.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return out;
}

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
  const resolved = sources.map((source) => {
    const { mode, dir } = resolveSourceDir(source, { isCI, exists: fs.existsSync });
    if (mode === "clone") cloneOrUpdate(source, dir);
    const from = path.join(dir, source.storiesPath || "stories");
    if (!fs.existsSync(from)) throw new Error(`${source.name}: no stories folder at ${from}`);
    return { source, mode, from, files: listFiles(from) };
  });

  const collisions = findCollisions(Object.fromEntries(resolved.map((r) => [r.source.name, r.files])));
  if (collisions.length) {
    throw new Error(`Story worlds overlap; rename one side:\n  ${collisions.join("\n  ")}`);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  for (const { source, mode, from } of resolved) {
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
