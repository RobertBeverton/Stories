import { describe, it, expect } from "vitest";
import { checkWaveContrast, contrastRatio, WAVE_MIX_PERCENT } from "./check-wave-contrast.mjs";
import { PALETTE } from "./accent-colors.mjs";

describe("contrastRatio", () => {
  it("returns 1 for identical colors", () => {
    expect(contrastRatio([0, 0, 0], [0, 0, 0])).toBeCloseTo(1, 5);
  });

  it("returns 21 for black vs white (max possible ratio)", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
  });
});

describe("checkWaveContrast", () => {
  it("passes for every current palette entry at the committed WAVE_MIX_PERCENT", () => {
    expect(checkWaveContrast(PALETTE)).toEqual([]);
  });

  it("flags a violation for a mix percentage known to fail (65%, per the CSS comment's own stated ceiling)", () => {
    const violations = checkWaveContrast(PALETTE, 0.65);
    expect(violations.length).toBeGreaterThan(0);
  });

  it("the committed WAVE_MIX_PERCENT matches what style.css's .story-card-wave rule actually uses", () => {
    // This can't read the CSS file's computed value directly, but pins the
    // exported constant so a change to WAVE_MIX_PERCENT without a matching
    // style.css edit (or vice versa) is at least visible in a diff/review,
    // rather than the two silently drifting apart.
    expect(WAVE_MIX_PERCENT).toBe(0.5);
  });
});
