import { describe, expect, it } from "vitest";
import { letterOf, loreLetters } from "./lore-index.mjs";

const e = (title, world = "w") => ({ world, title });

describe("letterOf", () => {
  it("uses the first letter, ignoring case and accents", () => {
    expect(letterOf("anubis")).toBe("A");
    expect(letterOf("Väinämöinen")).toBe("V");
    expect(letterOf("  Ōkami")).toBe("O");
  });
  it("files anything else under #", () => {
    expect(letterOf("1001 Nights")).toBe("#");
    expect(letterOf("")).toBe("#");
    expect(letterOf(undefined)).toBe("#");
  });
});

describe("loreLetters", () => {
  it("groups one world's entries by letter, sorted, with # last", () => {
    const groups = loreLetters([e("Zeus"), e("Anansi"), e("Athena"), e("1st"), e("Väinämöinen"), e("Other", "x"), e("Bast")], "w");
    expect(groups.map((g) => g.letter)).toEqual(["A", "B", "V", "Z", "#"]);
    expect(groups[0].entries.map((x) => x.title)).toEqual(["Anansi", "Athena"]);
  });
  it("sorts accented titles with their base letter", () => {
    const groups = loreLetters([e("Yu the Great"), e("Väinämöinen"), e("Vishnu")], "w");
    expect(groups.find((g) => g.letter === "V").entries.map((x) => x.title)).toEqual(["Väinämöinen", "Vishnu"]);
  });
  it("copes with no entries", () => {
    expect(loreLetters([], "w")).toEqual([]);
    expect(loreLetters(undefined, "w")).toEqual([]);
  });
});
