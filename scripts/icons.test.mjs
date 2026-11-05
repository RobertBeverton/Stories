import { describe, it, expect } from "vitest";
import { ICON_NAMES, isValidIcon, iconSvgPath, iconDetailSvgPath } from "./icons.mjs";

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

  it("has the original five and one emblem per tradition", () => {
    const original = ["sun", "boat", "berry", "shell", "cloud"];
    const traditions = [
      "greek", "norse", "hindu", "egyptian", "chinese", "japanese", "roman",
      "slavic", "mesoamerican", "pacific", "north-american", "west-african",
      "andean", "korean", "persian", "finnish", "canaanite", "gathering",
    ];
    for (const name of [...original, ...traditions]) {
      expect(ICON_NAMES, name).toContain(name);
    }
    expect(ICON_NAMES.length).toBe(original.length + traditions.length);
  });

  it("uses kebab-case names, each with a main and a detail path", () => {
    for (const name of ICON_NAMES) {
      expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(iconSvgPath(name)).toMatch(/^M[-\dMmLlHhVvCcSsAaZz., ]+$/);
      expect(iconDetailSvgPath(name)).toMatch(/^M[-\dMmLlHhVvCcSsAaZz., ]+$/);
    }
  });

  it("throws for an invalid icon name", () => {
    expect(() => iconSvgPath("spaceship")).toThrow();
  });
});
