import { pathToFileURL } from "node:url";
import { PALETTE } from "./accent-colors.mjs";

// Two spots use an accent color as a SOLID, undiluted background with its
// paired `text` color laid directly on top — site/assets/style.css's
// .story-header (background: var(--accent-bg); color: var(--accent-text))
// and .rail-group-icon (icon stroked in --accent-text). Since every
// PALETTE.background is a pastel (inherently light), `text` is a FIXED dark
// ink color on every entry, not a light/dark-mode-aware token (see the
// comment on PALETTE in accent-colors.mjs) — this script enforces that
// pairing actually clears WCAG AA, independent of color-scheme, so a future
// palette edit that picks too light a `text` value (or too light/saturated a
// `background`) fails a check instead of silently shipping unreadable text.
const CONTRAST_FLOOR = 4.5; // WCAG AA for normal-size text

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function relativeLuminance([r, g, b]) {
  const srgb = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function contrastRatio(c1, c2) {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Checks every PALETTE entry's own `text` color directly against its own
// `background` (no mixing — this is a solid fill, not a tint), and returns
// one violation string per failing entry (empty array = all pass).
export function checkSolidFillContrast(palette) {
  const violations = [];
  for (const { background, text } of palette) {
    const ratio = contrastRatio(hexToRgb(text), hexToRgb(background));
    if (ratio < CONTRAST_FLOOR) {
      violations.push(
        `text ${text} on background ${background} fails contrast: ${ratio.toFixed(2)}:1 (needs ${CONTRAST_FLOOR}:1)`
      );
    }
  }
  return violations;
}

function main() {
  const violations = checkSolidFillContrast(PALETTE);
  if (violations.length > 0) {
    console.error("Solid-fill contrast check failed:\n" + violations.map((v) => `  - ${v}`).join("\n"));
    process.exit(1);
  }
  console.log(`Solid-fill contrast OK for all ${PALETTE.length} palette colors (text directly on background).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
