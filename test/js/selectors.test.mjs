import { describe, expect, it } from "vitest";
import {
  buildSearchIndex, isNew, matchesFilters, matchesQuery, pickContinue, pickPlayedLately, pickSurprise, queryScore, worldsByRecent,
} from "../../site/assets/js/selectors.mjs";
import { library, progressV2 } from "./helpers-node.mjs";

const NOW = new Date("2026-11-03T12:00:00Z").getTime();
const [first, second, lone] = library.stories;
const rec = (o) => ({ v: 2, audioTime: 0, scrollY: 0, playing: false, savedAt: 1, ...o });

describe("pickContinue", () => {
  it("is the most recent unfinished story, skipping finished ones", () => {
    const records = {
      [first.slug]: rec({ audioTime: 300, savedAt: 100 }),
      [lone.slug]: rec({ audioTime: 20, savedAt: 200 }),
      [second.slug]: rec({ completedAt: 5, savedAt: 900 }), // most recent but finished
    };
    const pick = pickContinue(library.stories, records);
    expect(pick.story.slug).toBe(lone.slug);
    expect(pick.kind).toBe("resume");
  });

  it("reports the fraction listened for the shared v2 fixture", () => {
    const pick = pickContinue(library.stories, progressV2);
    expect(pick.story.slug).toBe(first.slug);
    expect(pick.fraction).toBe(0.5);
  });

  it("shows the newest story when there is no history", () => {
    expect(pickContinue(library.stories, {})).toMatchObject({ story: { slug: second.slug }, kind: "start", fraction: 0 });
  });

  it("with only a bare visit recorded, still shows the newest story", () => {
    const records = { [lone.slug]: rec({ audioTime: 0 }) };
    expect(pickContinue(library.stories, records).story.slug).toBe(second.slug);
  });

  it("offers the newest story not finished when everything started is finished", () => {
    const records = { [second.slug]: rec({ completedAt: 5 }) };
    expect(pickContinue(library.stories, records)).toMatchObject({ story: { slug: first.slug }, kind: "start" });
  });

  it("offers Play again on the newest story when everything is finished", () => {
    const records = Object.fromEntries(library.stories.map((s) => [s.slug, rec({ completedAt: 5 })]));
    expect(pickContinue(library.stories, records)).toMatchObject({ story: { slug: second.slug }, kind: "again" });
  });

  it("returns null for an empty library", () => {
    expect(pickContinue([], {})).toBeNull();
  });

  it("treats a replayed finished story as continuable only after 10s", () => {
    const early = { [first.slug]: rec({ completedAt: 5, audioTime: 8, savedAt: 50 }) };
    expect(pickContinue([first], early).kind).toBe("again");
    const later = { [first.slug]: rec({ completedAt: 5, audioTime: 12, savedAt: 50 }) };
    expect(pickContinue([first], later).kind).toBe("resume");
  });
});

describe("pickPlayedLately", () => {
  it("returns the three most recent, finished or not", () => {
    const four = [...library.stories, { ...lone, slug: "other-world/fourth", title: "Fourth" }];
    const records = {
      [first.slug]: rec({ audioTime: 30, savedAt: 10 }),
      [second.slug]: rec({ completedAt: 5, savedAt: 40 }),
      [lone.slug]: rec({ audioTime: 30, savedAt: 30 }),
      "other-world/fourth": rec({ audioTime: 30, savedAt: 20 }),
    };
    const picks = pickPlayedLately(four, records);
    expect(picks.map((p) => p.story.slug)).toEqual([second.slug, lone.slug, "other-world/fourth"]);
    expect(picks[0].state).toBe("finished");
  });

  it("skips stories with no real history and records for unknown slugs", () => {
    const records = { [first.slug]: rec({ audioTime: 0 }), "gone/story": rec({ audioTime: 50, savedAt: 99 }) };
    expect(pickPlayedLately(library.stories, records)).toEqual([]);
  });
});

describe("isNew", () => {
  it("is published within 14 days and has no progress", () => {
    expect(isNew(second, undefined, NOW)).toBe(true); // 2 days old
    expect(isNew(first, undefined, NOW)).toBe(false); // 33 days old
    expect(isNew({ ...first, publishDate: "2026-10-20" }, undefined, NOW)).toBe(true); // 14 days
    expect(isNew({ ...first, publishDate: "2026-10-19" }, undefined, NOW)).toBe(false); // 15 days
  });

  it("is not new once there is progress or a finish", () => {
    expect(isNew(second, rec({ audioTime: 30 }), NOW)).toBe(false);
    expect(isNew(second, rec({ completedAt: 3 }), NOW)).toBe(false);
    expect(isNew(second, rec({ audioTime: 0.2 }), NOW)).toBe(true); // a bare visit is not progress
  });
});

describe("matchesQuery", () => {
  it("matches every word against title, series and tags, case-insensitively", () => {
    expect(matchesQuery(first, "")).toBe(true);
    expect(matchesQuery(first, "FIRST tale")).toBe(true);
    expect(matchesQuery(first, "test series")).toBe(true);
    expect(matchesQuery(first, "placeholder")).toBe(true);
    expect(matchesQuery(first, "first nothing")).toBe(false);
    expect(matchesQuery(first, "elfine")).toBe(true); // a character name
    expect(matchesQuery(first, "mister harris tale")).toBe(true);
    expect(matchesQuery(second, "elfine")).toBe(false);
    expect(matchesQuery(lone, "series")).toBe(false); // null series
    expect(matchesQuery(second, '& "quoted"')).toBe(true);
  });
});

describe("search index", () => {
  const mk = (slug, title, characters = []) => ({ slug, title, series: null, tags: [], characters });
  const stories = [
    mk("a", "The Quiz Mistress", ["Alex", "Felix", "Willow"]),
    mk("b", "The Lady Under the Floor", ["Alex", "Felix"]),
    mk("c", "The Supply Teacher Who Was LOKI", ["Alex", "Felix", "Ollie"]),
    mk("d", "A Walk in the Orchard", ["Alex"]),
  ];
  const lore = [{ title: "Pachamama", tradition: "Andean", stories: ["b"] }];
  const index = buildSearchIndex(stories, lore);

  it("finds a story through the lore entry that lists it, though the title never names them", () => {
    expect(matchesQuery(stories[1], "pachamama", index)).toBe(true);
    expect(matchesQuery(stories[1], "andean", index)).toBe(true);
    expect(matchesQuery(stories[0], "pachamama", index)).toBe(false);
  });

  it("ignores characters that appear in most stories", () => {
    expect(matchesQuery(stories[0], "alex", index)).toBe(false); // in all 4
    expect(matchesQuery(stories[0], "felix", index)).toBe(false); // in 3 of 4
    expect(matchesQuery(stories[0], "willow", index)).toBe(true); // rare, still searchable
    expect(matchesQuery(stories[2], "ollie", index)).toBe(true);
  });

  it("ranks a title match above a character match", () => {
    const titled = mk("t", "Willow Wood", []);
    const withChar = mk("w", "Other", ["Willow"]);
    const idx = buildSearchIndex([titled, withChar, ...stories], []);
    expect(queryScore(titled, "willow", idx)).toBeGreaterThan(queryScore(withChar, "willow", idx));
  });
});

describe("matchesFilters", () => {
  const all = (f, records = {}) => library.stories
    .filter((s) => matchesFilters(s, records[s.slug], f, NOW))
    .map((s) => s.slug);

  it("passes everything with no filters", () => {
    expect(all({})).toHaveLength(3);
  });

  it("filters by world and series", () => {
    expect(all({ world: "other-world" })).toEqual([lone.slug]);
    expect(all({ series: "The Test Series" })).toEqual([first.slug, second.slug]);
    expect(all({ world: "other-world", series: "The Test Series" })).toEqual([]);
  });

  it("has audio excludes stories with no audio duration", () => {
    expect(all({ audio: true })).toEqual(library.stories.filter((s) => s.durationSec !== null).map((s) => s.slug));
    expect(all({ audio: true })).not.toContain(library.stories.find((s) => s.durationSec === null).slug);
  });

  it("status filters: in progress, finished, new (OR within the group)", () => {
    const records = {
      [first.slug]: rec({ audioTime: 300 }),
      [lone.slug]: rec({ completedAt: 1 }),
    };
    expect(all({ statuses: ["in-progress"] }, records)).toEqual([first.slug]);
    expect(all({ statuses: ["finished"] }, records)).toEqual([lone.slug]);
    expect(all({ statuses: ["new"] }, records)).toEqual([second.slug]);
    expect(all({ statuses: ["in-progress", "finished"] }, records)).toEqual([first.slug, lone.slug]);
  });

  it("combines groups with AND", () => {
    const records = { [first.slug]: rec({ audioTime: 300 }), [second.slug]: rec({ audioTime: 300 }) };
    expect(all({ statuses: ["in-progress"], audio: true }, records)).toEqual([first.slug, second.slug]);
  });
});

describe("pickSurprise", () => {
  const mk = (slug, world, durationSec = 600) => ({ slug, title: slug, world, durationSec });
  const stories = [mk("a", "w1"), mk("b", "w1"), mk("c", "w1"), mk("d", "w2"), mk("e", "w1", null)];
  const first = () => 0;

  it("prefers stories never heard to the end, and only those while any remain", () => {
    const plays = { a: 2, b: 1 };
    const pick = pickSurprise(stories, { plays, world: "w1", random: first });
    expect(pick.story.slug).toBe("c");
    expect(pick.heard).toBe(false);
  });

  it("stays inside the chosen world, and ignores stories with no audio when others have it", () => {
    for (let i = 0; i < 20; i++) {
      const slug = pickSurprise(stories, { world: "w1", random: () => i / 20 }).story.slug;
      expect(["a", "b", "c"]).toContain(slug);
    }
    expect(pickSurprise(stories, { world: "w2", random: first }).story.slug).toBe("d");
    const noAudio = [mk("x", "w3", null), mk("y", "w3", null)];
    expect(pickSurprise(noAudio, { world: "w3", random: first }).story.slug).toBe("x");
  });

  it("when everything is heard, picks from those heard longest ago", () => {
    const many = Array.from({ length: 12 }, (_, i) => mk("s" + i, "w1"));
    const records = Object.fromEntries(many.map((s, i) => [s.slug, { completedAt: 1000 + i }]));
    const picks = new Set();
    for (let i = 0; i < 30; i++) picks.add(pickSurprise(many, { records, world: "w1", random: () => i / 30 }).story.slug);
    expect([...picks].sort()).toEqual(["s0", "s1", "s2"]); // the oldest quarter, at least 3
  });

  it("another one never repeats until the pool runs out, then skips only the last offer", () => {
    const seen = [];
    for (let i = 0; i < 3; i++) seen.push(pickSurprise(stories, { world: "w1", exclude: seen.map((p) => p), random: first }).story.slug);
    expect(new Set(seen).size).toBe(3);
    const again = pickSurprise(stories, { world: "w1", exclude: seen, random: first });
    expect(again.story.slug).not.toBe(seen[2]);
  });

  it("returns null when the world has no stories, and the only story when there is one", () => {
    expect(pickSurprise(stories, { world: "nope" })).toBeNull();
    expect(pickSurprise([mk("solo", "w9")], { world: "w9", exclude: ["solo"] }).story.slug).toBe("solo");
  });
});

describe("worldsByRecent", () => {
  const worlds = [{ name: "w1" }, { name: "w2" }, { name: "w3" }];
  const stories = [
    { slug: "a", world: "w1" }, { slug: "b", world: "w2" }, { slug: "c", world: "w3" },
  ];
  const rec = (o) => ({ v: 2, audioTime: 0, scrollY: 0, playing: false, savedAt: 1, ...o });

  it("puts the world played most recently first, unplayed worlds keep their order", () => {
    const records = { a: rec({ audioTime: 50, savedAt: 100 }), b: rec({ audioTime: 50, savedAt: 200 }) };
    expect(worldsByRecent(worlds, stories, records).map((w) => w.name)).toEqual(["w2", "w1", "w3"]);
    expect(worldsByRecent(worlds, stories, {}).map((w) => w.name)).toEqual(["w1", "w2", "w3"]);
  });

  it("ignores a bare page visit", () => {
    const records = { c: rec({ audioTime: 0.2, savedAt: 999 }), a: rec({ completedAt: 5, savedAt: 5 }) };
    expect(worldsByRecent(worlds, stories, records).map((w) => w.name)).toEqual(["w1", "w2", "w3"]);
  });
});
