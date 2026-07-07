// Each pair is manually checked for WCAG AA (4.5:1) contrast in BOTH light
// and dark `color-scheme` rendering before being added here — colors are
// never generated on the fly, only selected from this fixed, pre-vetted set.
// PALETTE[0] is the default/neutral pair used for standalone stories.
export const PALETTE = [
  { background: "#6b7280", text: "#ffffff" }, // neutral slate (default)
  { background: "#2f6f4f", text: "#ffffff" }, // forest green
  { background: "#8a3b8f", text: "#ffffff" }, // plum
  { background: "#b5541a", text: "#ffffff" }, // burnt orange
  { background: "#1f5f8b", text: "#ffffff" }, // ocean blue
  { background: "#a8324a", text: "#ffffff" }, // berry red
  { background: "#5b6b1f", text: "#ffffff" }, // olive
  { background: "#6a4fa0", text: "#ffffff" }, // violet
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
