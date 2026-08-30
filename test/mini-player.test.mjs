import { describe, it, expect } from "vitest";
import { buildMediaMetadata } from "../site/assets/mini-player.js";

describe("buildMediaMetadata", () => {
  it("builds MediaMetadata-shaped data from a playing entry", () => {
    const meta = buildMediaMetadata({ title: "The Pancake Isle", artworkUrl: "/isles-of-yum/assets/generated/icons/sun-e8735c-512.png" });
    expect(meta.title).toBe("The Pancake Isle");
    expect(meta.artist).toBe("The Isles of Yum");
    expect(meta.artwork[0].src).toContain("sun-e8735c-512.png");
  });

  it("falls back to a generic title when none is given", () => {
    const meta = buildMediaMetadata({ artworkUrl: "/x.png" });
    expect(meta.title).toBe("The Isles of Yum");
  });
});
