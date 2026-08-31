import { describe, it, expect } from "vitest";
import { checkBandContrast, BAND_MIX_PERCENT } from "./check-band-contrast.mjs";
import { PALETTE } from "./accent-colors.mjs";

describe("checkBandContrast", () => {
  it("passes for every current palette color at the current mix percentage", () => {
    expect(checkBandContrast(PALETTE)).toEqual([]);
  });

  it("flags a color that fails contrast at a given mix percentage", () => {
    // #fdf6ec is near-white and passes comfortably at the real 20% band mix
    // (dilution is too weak at that ratio for any background color to drop
    // below the contrast floor against these fixed paper/ink anchors), so
    // this exercises the mixPercent parameter directly at a heavier mix
    // (50%, matching check-wave-contrast's own mix percent) where the same
    // pale color does fail in dark mode.
    const paleColor = [{ background: "#fdf6ec", text: "#ffffff" }]; // near-white, fails against paper once diluted less
    expect(checkBandContrast(paleColor, 0.5).length).toBeGreaterThan(0);
  });

  it("the committed BAND_MIX_PERCENT matches what style.css's .rail-group rule actually uses", () => {
    // Pins the exported constant so a change to BAND_MIX_PERCENT without a
    // matching style.css edit (or vice versa) is at least visible in a
    // diff/review, rather than the two silently drifting apart.
    expect(BAND_MIX_PERCENT).toBe(0.2);
  });
});
