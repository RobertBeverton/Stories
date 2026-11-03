import { describe, it, expect } from "vitest";
import { checkContinueBannerContrast, CONTINUE_BANNER_MIX_PERCENT } from "./check-continue-banner-contrast.mjs";
import { PALETTE } from "./accent-colors.mjs";

describe("checkContinueBannerContrast", () => {
  it("passes for every current palette color at the current mix percentage", () => {
    expect(checkContinueBannerContrast(PALETTE)).toEqual([]);
  });

  it("flags a color that fails contrast at a given mix percentage", () => {
    // #fdf6ec is near-white and passes comfortably at the real 40% mix, so
    // this exercises the mixPercent parameter directly at a heavier mix
    // (65%, matching check-wave-contrast's own "flags a violation" test)
    // where the same pale color does fail in dark mode.
    const paleColor = [{ background: "#fdf6ec", text: "#ffffff" }];
    expect(checkContinueBannerContrast(paleColor, 0.65).length).toBeGreaterThan(0);
  });

  it("the committed CONTINUE_BANNER_MIX_PERCENT matches what style.css's .continue-banner.has-accent rule actually uses", () => {
    // Pins the exported constant so a change to CONTINUE_BANNER_MIX_PERCENT
    // without a matching style.css edit (or vice versa) is at least visible
    // in a diff/review, rather than the two silently drifting apart.
    expect(CONTINUE_BANNER_MIX_PERCENT).toBe(0.4);
  });
});
