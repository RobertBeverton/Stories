import { pathToFileURL } from "node:url";
import { PALETTE } from "./accent-colors.mjs";

// The homepage arc/standalone group band background (site/assets/style.css's
// .rail-group rule) mixes each accent color at BAND_MIX_PERCENT into the
// page background behind the group's heading, lozenges, and story rows —
// this script is the enforced version of that contrast claim, mirroring
// check-wave-contrast.mjs's pattern, so a future palette/token edit that
// breaks contrast fails a check instead of silently shipping unreadable
// text.
export const BAND_MIX_PERCENT = 0.2;
const CONTRAST_FLOOR = 4.5; // WCAG AA for normal-size text

const PAPER = { light: "#faf3e7", dark: "#1c1a17" };
const INK = { light: "#2c2a26", dark: "#f2ede2" };

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function mix(c1, c2, pct) {
  return c1.map((v, i) => Math.round(v * pct + c2[i] * (1 - pct)));
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

// Checks every PALETTE accent color's band-mixed background against the
// page's own text color, in both light and dark color-scheme, and returns
// one violation string per failing combination (empty array = all pass).
export function checkBandContrast(palette, mixPercent = BAND_MIX_PERCENT) {
  const violations = [];
  for (const { background } of palette) {
    for (const scheme of ["light", "dark"]) {
      const bg = mix(hexToRgb(background), hexToRgb(PAPER[scheme]), mixPercent);
      const ratio = contrastRatio(hexToRgb(INK[scheme]), bg);
      if (ratio < CONTRAST_FLOOR) {
        violations.push(
          `${background} at ${Math.round(mixPercent * 100)}% mix fails contrast in ${scheme} mode: ${ratio.toFixed(2)}:1 (needs ${CONTRAST_FLOOR}:1)`
        );
      }
    }
  }
  return violations;
}

function main() {
  const violations = checkBandContrast(PALETTE);
  if (violations.length > 0) {
    console.error("Band background contrast check failed:\n" + violations.map((v) => `  - ${v}`).join("\n"));
    process.exit(1);
  }
  console.log(`Band background contrast OK for all ${PALETTE.length} palette colors at ${Math.round(BAND_MIX_PERCENT * 100)}% mix (light + dark mode).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
