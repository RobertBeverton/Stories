import { describe, it, expect } from "vitest";
import { accentColorFor, PALETTE } from "./accent-colors.mjs";

describe("accentColorFor", () => {
  it("returns the same color pair for the same series name every time", () => {
    const a = accentColorFor("The Bramble Wall");
    const b = accentColorFor("The Bramble Wall");
    expect(a).toEqual(b);
  });

  it("returns a {background, text} pair from the fixed palette", () => {
    const result = accentColorFor("The Bramble Wall");
    expect(PALETTE).toContainEqual(result);
  });

  it("returns the default neutral pair for standalone stories (no series)", () => {
    const result = accentColorFor(undefined);
    expect(result).toEqual(PALETTE[0]);
  });

  it("distributes different series names across the palette (not all to one entry)", () => {
    const names = ["The Bramble Wall", "Moonlit Cove", "Pepper the Fox", "Starlight Express"];
    const results = new Set(names.map((n) => JSON.stringify(accentColorFor(n))));
    expect(results.size).toBeGreaterThan(1);
  });
});
