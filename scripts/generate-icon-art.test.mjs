import { describe, it, expect } from "vitest";
import { buildIconSvg, iconArtCombosFor } from "./generate-icon-art.mjs";

describe("buildIconSvg", () => {
  it("produces an SVG string containing the icon's main path and the given background color", () => {
    const svg = buildIconSvg({ icon: "boat", background: "#1f5f8b" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("#1f5f8b");
    expect(svg).toContain("M25 55h70l-10 14H37Z"); // boat main path
  });

  it("throws for an invalid icon name", () => {
    expect(() => buildIconSvg({ icon: "spaceship", background: "#000" })).toThrow();
  });
});

describe("iconArtCombosFor", () => {
  it("returns one combo per distinct {icon, background} pair across stories, de-duplicated", () => {
    const stories = [
      { icon: "boat", accentColorBackground: "#1f5f8b" },
      { icon: "boat", accentColorBackground: "#1f5f8b" }, // duplicate
      { icon: "sun", accentColorBackground: "#b5541a" },
    ];
    const combos = iconArtCombosFor(stories);
    expect(combos).toHaveLength(2);
  });
});
