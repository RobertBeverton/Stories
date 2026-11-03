import { describe, expect, it } from "vitest";
import { data } from "../../site/story-pages.11ty.js";

const computed = data.eleventyComputed;
const meta = {
  slug: "w/tale",
  world: "w",
  parts: [{ title: "Part One. A", start: 0 }],
  lore: "an-entry",
};
const page = (bySlug, storySlug = "w/tale") => ({ stories: { bySlug }, storyPage: { data: { storySlug } } });

describe("story page computed data", () => {
  it("passes world, validated parts and the lore link through from the world data", () => {
    const d = page({ "w/tale": meta });
    expect(computed.world(d)).toBe("w");
    expect(computed.parts(d)).toEqual(meta.parts);
    expect(computed.lore(d)).toBe("an-entry");
  });

  it("is null when the story has no parts or lore", () => {
    const d = page({ "w/tale": { slug: "w/tale", world: "w" } });
    expect(computed.parts(d)).toBeNull();
    expect(computed.lore(d)).toBeNull();
  });
});
