import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { checkTokenContrast, parseTokens } from "./check-token-contrast.mjs";

const css = fs.readFileSync(new URL("../site/assets/css/tokens.css", import.meta.url), "utf8");
const tokens = parseTokens(css);

describe("checkTokenContrast", () => {
  it("parses the real tokens file", () => {
    expect(tokens.bg).toBe("#1c1a17");
    expect(Object.keys(tokens)).toEqual(
      expect.arrayContaining(["bg", "surface", "raised", "text", "muted", "line", "focus", "accent", "accent-ink", "series", "series-ink"]),
    );
  });

  it("passes for the shipped tokens and every palette accent", () => {
    expect(checkTokenContrast(tokens)).toEqual([]);
  });

  it("flags text that is too dim", () => {
    const dim = { ...tokens, muted: "#6f685d" };
    expect(checkTokenContrast(dim).some((v) => v.includes("--muted"))).toBe(true);
  });

  it("flags a border below 3:1", () => {
    const faint = { ...tokens, line: "#3a352f" };
    expect(checkTokenContrast(faint).some((v) => v.includes("--line"))).toBe(true);
  });

  it("flags light ink on a pastel accent", () => {
    const bad = { ...tokens, "accent-ink": "#f2ede2" };
    expect(checkTokenContrast(bad).some((v) => v.includes("--accent-ink"))).toBe(true);
  });

  it("reports a missing token instead of throwing", () => {
    const { focus, ...rest } = tokens;
    expect(checkTokenContrast(rest)).toEqual(["token --focus missing or not a plain #rrggbb value"]);
  });
});
