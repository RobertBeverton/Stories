import { describe, expect, it } from "vitest";
import {
  isNew, matchesFilters, matchesQuery, pickContinue, pickPlayedLately,
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
    expect(matchesQuery(lone, "series")).toBe(false); // null series
    expect(matchesQuery(second, '& "quoted"')).toBe(true);
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

  it("under 15 minutes excludes longer and unknown durations", () => {
    expect(all({ under15: true })).toEqual([first.slug]); // 600s; 1500s too long; null unknown
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
    expect(all({ statuses: ["in-progress"], under15: true }, records)).toEqual([first.slug]);
  });
});
