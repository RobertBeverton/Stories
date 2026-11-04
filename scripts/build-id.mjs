// The build id: a content hash of everything that shapes the built site, so a
// build with unchanged inputs gets the SAME id and a build with any change gets
// a different one. It goes into <meta name="build-id">, the `?v=` on CSS and
// main.js, and the import map (and therefore the CSP hash); see page-security.mjs.
//
// Why not a timestamp: the nightly build (.github/workflows/build.yml) would then
// mint a new id every night with no change, and a page left open in a tab would
// see a "different build" on its next navigation. The router answers that with a
// full page load, which destroys the persistent audio element. An id that only
// moves when the content moves keeps that to real deploys.
//
// Inputs: stories (markdown and the world manifest), lore, everything in site/
// (templates, modules, CSS, data files, static assets), the build scripts, the
// world list, the Eleventy config and the lockfile. library.json is derived
// from those, so it is covered. Not inputs: story audio (its URL carries its own
// ?v= in front matter), tests, generated art (derived from the scripts), and
// node_modules.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

const PATTERNS = [
  "stories/**/*.md",
  "stories/.worlds.json",
  "lore/**/*",
  "site/**/*",
  "scripts/**/*.{mjs,json}",
  "content-sources.json",
  "eleventy.config.js",
  "package-lock.json",
];
const IGNORE = [
  "**/*.test.mjs",
  "stories/.narrate-cache/**",
  "site/assets/generated/**",
  "site/assets/app-icon-*.png",
];

/**
 * @param {string} [root] project folder (default: the current directory)
 * @returns {string} 12 hex characters, the same for the same input bytes and paths
 */
export function computeBuildId(root = process.cwd()) {
  const files = fg.sync(PATTERNS, { cwd: root, dot: true, ignore: IGNORE, onlyFiles: true }).sort();
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, file));
    hash.update(`${file}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest("hex").slice(0, 12);
}

// Fixed for the life of the process so the meta tag, the `?v=` values, the import
// map and the CSP hash always agree.
export const BUILD_ID = computeBuildId();
