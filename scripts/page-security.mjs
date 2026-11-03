// Build-time page security: the import map (cache-busts every ES module with the
// build id) and the Content-Security-Policy that goes with it. GitHub Pages
// sets no headers, so the policy is a <meta> tag (which cannot carry
// frame-ancestors; Pages cannot frame-protect the site either way).
import crypto from "node:crypto";
import path from "node:path";
import fg from "fast-glob";
import { AUDIO_ORIGIN } from "./audio-origin.mjs";
import { PATH_PREFIX } from "./stories-lib.mjs";

// Fixed for the life of the process so buildTime, the import map and the CSP hash always agree.
export const BUILD_TIME = Date.now();

// JSON for an inline <script>: "<" is escaped so no string can close the tag.
function serialise(value) {
  return JSON.stringify(value).replace(/</g, "\u003c");
}

/** Maps every site/assets/js/*.mjs URL to itself plus ?v=<buildTime>. Keys are sorted, so output is deterministic. */
export function buildImportMap(buildTime, jsDir = "site/assets/js") {
  const files = fg.sync("*.mjs", { cwd: jsDir }).sort();
  const imports = {};
  for (const file of files) {
    const url = `${PATH_PREFIX}/assets/js/${path.posix.basename(file)}`;
    imports[url] = `${url}?v=${buildTime}`;
  }
  const json = serialise({ imports });
  return { json, hash: scriptHash(json) };
}

export function scriptHash(text) {
  return `sha256-${crypto.createHash("sha256").update(text, "utf8").digest("base64")}`;
}

export function contentSecurityPolicy({ importMapHash, audioOrigin = AUDIO_ORIGIN }) {
  return [
    "default-src 'self'",
    `script-src 'self' '${importMapHash}'`,
    "style-src 'self' 'unsafe-inline'", // templates set inline style="--accent-bg:..."; scripts stay locked down
    "img-src 'self' data:",
    `media-src 'self' ${audioOrigin}`,
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** What base.njk renders: the import map script body and the full CSP string. */
export function pageSecurity(buildTime = BUILD_TIME, options = {}) {
  const { json, hash } = buildImportMap(buildTime, options.jsDir);
  return { json, hash, csp: contentSecurityPolicy({ importMapHash: hash, audioOrigin: options.audioOrigin }) };
}
