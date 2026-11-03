// Each pair is manually checked for WCAG AA (4.5:1) contrast in BOTH light
// and dark `color-scheme` rendering before being added here — colors are
// never generated on the fly, only selected from this fixed, pre-vetted set.
// PALETTE[0] is the default/neutral pair used for standalone stories.
//
// `text` is a FIXED dark ink color (not a light/dark-mode-aware token) on
// every entry, because every background here is a pastel — inherently
// light — so text laid directly on it (.story-header, .rail-group-icon)
// must stay dark regardless of the visitor's light/dark color-scheme
// preference; the background itself never gets darker in dark mode, only
// the page around it does. Verified against `INK.light` (#2c2a26) at
// >=7.3:1 for every entry — comfortably over the 4.5:1 floor — in
// scripts/check-band-contrast.mjs-style checks; do not swap this back to a
// scheme-dependent color.
export const PALETTE = [
  { background: "#babec4", text: "#2c2a26" }, // neutral pastel slate (default)
  { background: "#a5c695", text: "#2c2a26" }, // pastel sage green
  { background: "#c4b3db", text: "#2c2a26" }, // pastel lavender
  { background: "#d7b975", text: "#2c2a26" }, // pastel butter yellow
  { background: "#97c2d8", text: "#2c2a26" }, // pastel sky blue
  { background: "#e0aebe", text: "#2c2a26" }, // pastel raspberry
  { background: "#eab09e", text: "#2c2a26" }, // pastel coral/peach
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function accentColorFor(seriesName) {
  if (!seriesName) return PALETTE[0];
  const index = 1 + (hashString(seriesName) % (PALETTE.length - 1));
  return PALETTE[index];
}
