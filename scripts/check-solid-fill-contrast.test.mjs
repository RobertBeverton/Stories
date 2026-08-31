import { describe, it, expect } from "vitest";
import { checkSolidFillContrast } from "./check-solid-fill-contrast.mjs";
import { PALETTE } from "./accent-colors.mjs";

describe("checkSolidFillContrast", () => {
  it("passes for every current palette color's text-on-background pairing", () => {
    expect(checkSolidFillContrast(PALETTE)).toEqual([]);
  });

  it("flags a pairing that fails contrast", () => {
    const tooLight = [{ background: "#eab09e", text: "#f2ede2" }]; // light text on a pastel background
    expect(checkSolidFillContrast(tooLight).length).toBeGreaterThan(0);
  });
});
