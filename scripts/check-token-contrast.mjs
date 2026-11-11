import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PALETTE } from "./accent-colors.mjs";
import { contrastRatio, hexToRgb } from "./check-solid-fill-contrast.mjs";

// Enforces the contrast claims behind the Hearth tokens in
// site/assets/css/tokens.css (design doc section 3, Accessibility):
//   - text pairs        >= 4.5:1
//   - non-text pairs    >= 3:1 (borders, seek tracks, focus ring, accent fills)
//   - accent fills      the world accent (any PALETTE entry) carries --accent-ink
//                       at 4.5:1 and stands out from every surface at 3:1
//   - series accent     --series-ink on every PALETTE entry at 4.5:1
// Colours must be plain #rrggbb custom properties on :root so this can parse
// them. Dark only: there is no light scheme to check.
export const TEXT_FLOOR = 4.5;
export const NON_TEXT_FLOOR = 3;

const SURFACES = ["bg", "surface", "raised"];

export function parseTokens(css) {
  const tokens = {};
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

export function checkTokenContrast(tokens, palette = PALETTE) {
  const violations = [];
  const need = (names) => {
    for (const n of names) {
      if (!tokens[n]) violations.push(`token --${n} missing or not a plain #rrggbb value`);
    }
    return names.every((n) => tokens[n]);
  };
  const pair = (fgName, fg, bgName, bg, floor) => {
    const ratio = contrastRatio(hexToRgb(fg), hexToRgb(bg));
    if (ratio < floor) {
      violations.push(`${fgName} ${fg} on ${bgName} ${bg}: ${ratio.toFixed(2)}:1 (needs ${floor}:1)`);
    }
  };

  if (!need([...SURFACES, "text", "muted", "line", "focus", "accent", "accent-ink", "series", "series-ink"])) {
    return violations;
  }

  for (const s of SURFACES) {
    pair("--text", tokens.text, `--${s}`, tokens[s], TEXT_FLOOR);
    pair("--muted", tokens.muted, `--${s}`, tokens[s], TEXT_FLOOR);
    pair("--line", tokens.line, `--${s}`, tokens[s], NON_TEXT_FLOOR);
    pair("--focus", tokens.focus, `--${s}`, tokens[s], NON_TEXT_FLOOR);
  }

  // The deeper gradient ends and the reading colour, when the tokens define them
  const extraSurfaces = ["surface-deep", "surface-sunk"].filter((n) => tokens[n]);
  for (const s of extraSurfaces) {
    pair("--text", tokens.text, `--${s}`, tokens[s], TEXT_FLOOR);
    pair("--muted", tokens.muted, `--${s}`, tokens[s], TEXT_FLOOR);
    pair("--line", tokens.line, `--${s}`, tokens[s], NON_TEXT_FLOOR);
    pair("--focus", tokens.focus, `--${s}`, tokens[s], NON_TEXT_FLOOR);
  }
  if (tokens["text-reading"]) {
    for (const s of [...SURFACES, ...extraSurfaces]) pair("--text-reading", tokens["text-reading"], `--${s}`, tokens[s], TEXT_FLOOR);
  }

  // Defaults declared on :root
  pair("--accent-ink", tokens["accent-ink"], "--accent", tokens.accent, TEXT_FLOOR);
  pair("--series-ink", tokens["series-ink"], "--series", tokens.series, TEXT_FLOOR);
  pair("--series-ink (focus ring on series)", tokens["series-ink"], "--series", tokens.series, NON_TEXT_FLOOR);

  // Any palette entry can become the world accent or the series colour
  for (const { background, text } of palette) {
    pair("--accent-ink", tokens["accent-ink"], "world accent", background, TEXT_FLOOR);
    pair("--series-ink", tokens["series-ink"], "series colour", background, TEXT_FLOOR);
    pair("palette ink", text, "palette fill", background, TEXT_FLOOR);
    for (const s of SURFACES) {
      pair("world accent", background, `--${s}`, tokens[s], NON_TEXT_FLOOR);
    }
  }
  return violations;
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const css = fs.readFileSync(path.join(here, "..", "site", "assets", "css", "tokens.css"), "utf8");
  const violations = checkTokenContrast(parseTokens(css));
  if (violations.length > 0) {
    console.error("Token contrast check failed:\n" + violations.map((v) => `  - ${v}`).join("\n"));
    process.exit(1);
  }
  console.log(`Token contrast OK (text ${TEXT_FLOOR}:1, non-text ${NON_TEXT_FLOOR}:1, ${PALETTE.length} palette accents).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
