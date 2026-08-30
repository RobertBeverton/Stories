import { describe, it, expect } from "vitest";
import { ICON_NAMES, isValidIcon, iconSvgPath } from "./icons.mjs";

describe("icons", () => {
  it("exposes a fixed, non-empty list of valid icon names", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
    expect(ICON_NAMES).toContain("sun");
    expect(ICON_NAMES).toContain("boat");
  });

  it("validates known icon names", () => {
    expect(isValidIcon("sun")).toBe(true);
    expect(isValidIcon("boat")).toBe(true);
  });

  it("rejects unknown icon names", () => {
    expect(isValidIcon("spaceship")).toBe(false);
    expect(isValidIcon(undefined)).toBe(false);
  });

  it("returns an SVG path string for every valid icon", () => {
    for (const name of ICON_NAMES) {
      expect(typeof iconSvgPath(name)).toBe("string");
      expect(iconSvgPath(name).length).toBeGreaterThan(0);
    }
  });

  it("throws for an invalid icon name", () => {
    expect(() => iconSvgPath("spaceship")).toThrow();
  });
});
