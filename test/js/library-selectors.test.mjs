// Pure rules behind the grouped Library (invented data only).
import { describe, expect, it } from "vitest";
import {
  collectionsFor, groupStories, matchesCollection, matchesFilters, orderStories, PAGE_SIZE, seriesSummary, visibleLimit,
} from "../../site/assets/js/selectors.mjs";

const NOW = new Date("2026-11-03T12:00:00Z").getTime();
const rec = (o) => ({ v: 2, audioTime: 0, scrollY: 0, playing: false, savedAt: 1, ...o });

function mk(n, o = {}) {
  return {
    slug: `w/s${n}`, title: `Story ${n}`, world: "w", series: "Saga", seriesOrder: n, durationSec: 600, tags: [],
    url: `/Stories/s${n}/`, icon: "sun", publishDate: `2026-10-${String(n).padStart(2, "0")}`, ...o,
  };
}

describe("groupStories", () => {
  const stories = [
    mk(1), mk(2), mk(3),
    mk(4, { series: "Short", seriesOrder: 1, publishDate: "2026-11-02" }),
    mk(5, { series: null, seriesOrder: null }),
    mk(6, { world: "v", series: "Saga", seriesOrder: 1, publishDate: "2026-09-01" }),
  ];

  it("groups by world and series, standalone stories last, freshest series first", () => {
    const groups = groupStories(stories, "order");
    expect(groups.map((g) => [g.world, g.name])).toEqual([["w", "Short"], ["w", "Saga"], ["v", "Saga"], ["w", ""]]);
    expect(groups[3].standalone).toBe(true);
    expect(groups[1].key).not.toBe(groups[2].key);
  });

  it("orders inside a series by seriesOrder, or newest first with the Newest sort", () => {
    expect(groupStories(stories, "order")[1].stories.map((s) => s.seriesOrder)).toEqual([1, 2, 3]);
    expect(groupStories(stories, "newest")[1].stories.map((s) => s.seriesOrder)).toEqual([3, 2, 1]);
  });

  it("falls back to newest first when a series has no order", () => {
    const loose = [mk(1, { seriesOrder: null }), mk(2, { seriesOrder: null }), mk(3, { seriesOrder: null })];
    expect(groupStories(loose, "order")[0].stories.map((s) => s.slug)).toEqual(["w/s3", "w/s2", "w/s1"]);
  });
});

describe("orderStories (flat results)", () => {
  it("follows the same order as the groups", () => {
    const stories = [mk(2), mk(1), mk(3, { series: null, seriesOrder: null, publishDate: "2026-12-01" })];
    expect(orderStories(stories, "order").map((s) => s.slug)).toEqual(["w/s1", "w/s2", "w/s3"]);
    expect(orderStories(stories, "newest").map((s) => s.slug)).toEqual(["w/s3", "w/s2", "w/s1"]);
  });
});

describe("seriesSummary", () => {
  const stories = [mk(1), mk(2), mk(3)];
  it("counts heard stories and offers the first story to start with", () => {
    expect(seriesSummary(stories, {})).toMatchObject({ total: 3, heard: 0, next: { kind: "start", story: { slug: "w/s1" } } });
  });
  it("offers the next unfinished story once some are heard", () => {
    const records = { "w/s1": rec({ completedAt: 5 }) };
    expect(seriesSummary(stories, records)).toMatchObject({ heard: 1, next: { kind: "next", story: { slug: "w/s2" } } });
  });
  it("prefers the story in progress, most recent first", () => {
    const records = { "w/s1": rec({ completedAt: 5 }), "w/s3": rec({ audioTime: 100, savedAt: 9 }), "w/s2": rec({ audioTime: 50, savedAt: 3 }) };
    expect(seriesSummary(stories, records).next).toMatchObject({ kind: "continue", story: { slug: "w/s3" } });
  });
  it("has no next story when everything is heard", () => {
    const records = Object.fromEntries(stories.map((s) => [s.slug, rec({ completedAt: 5 })]));
    expect(seriesSummary(stories, records)).toMatchObject({ heard: 3, next: null, allHeard: true });
  });
});

describe("collections", () => {
  const stories = [mk(1), mk(2), mk(3, { world: "v" })];
  const lore = [
    { world: "w", slug: "a", title: "A", tradition: "Norse", stories: ["w/s1"] },
    { world: "w", slug: "b", title: "B", tradition: "Greek", stories: ["w/s2"] },
    { world: "w", slug: "c", title: "C", tradition: "Norse", stories: ["w/s2"] },
  ];
  it("lists traditions of the stories in scope, alphabetically, with story counts", () => {
    expect(collectionsFor(stories.slice(0, 2), lore)).toEqual([{ name: "Greek", count: 1 }, { name: "Norse", count: 2 }]);
  });
  it("leaves out traditions with no story in scope", () => {
    expect(collectionsFor([stories[2]], lore)).toEqual([]);
  });
  it("is empty without lore, so the row degrades away", () => {
    expect(collectionsFor(stories, [])).toEqual([]);
    expect(collectionsFor(stories, undefined)).toEqual([]);
  });
  it("matches a story to a tradition through lore", () => {
    expect(matchesCollection(stories[1], "Norse", lore)).toBe(true);
    expect(matchesCollection(stories[1], "Roman", lore)).toBe(false);
    expect(matchesCollection(stories[0], "", lore)).toBe(true);
  });
});

describe("matchesFilters: not played and collection", () => {
  it("not played keeps stories with no progress, not started or finished ones", () => {
    const s = mk(1);
    const f = { statuses: ["not-played"] };
    expect(matchesFilters(s, undefined, f, NOW)).toBe(true);
    expect(matchesFilters(s, rec({ audioTime: 10 }), f, NOW)).toBe(false);
    expect(matchesFilters(s, rec({ completedAt: 3 }), f, NOW)).toBe(false);
  });
});

describe("matchesFilters: saved", () => {
  const stories = [mk(1), mk(2), mk(3)];

  it("filters to saved stories when f.saved is on", () => {
    const f = { saved: true, savedSlugs: new Set([stories[0].slug]) };
    expect(stories.filter((s) => matchesFilters(s, undefined, f, NOW)).map((s) => s.slug)).toEqual([stories[0].slug]);
  });

  it("ignores f.saved when it is off, and matches nothing when it is on with no set", () => {
    expect(stories.every((s) => matchesFilters(s, undefined, { saved: false }, NOW))).toBe(true);
    expect(stories.some((s) => matchesFilters(s, undefined, { saved: true }, NOW))).toBe(false);
  });

  it("composes with the world filter", () => {
    const other = mk(4, { world: "v" });
    const f = { saved: true, world: "w", savedSlugs: new Set([stories[0].slug, other.slug]) };
    expect([...stories, other].filter((s) => matchesFilters(s, undefined, f, NOW))).toEqual([stories[0]]);
  });
});

describe("visibleLimit", () => {
  it("reveals a page at a time and never leaves a tiny remainder", () => {
    expect(PAGE_SIZE).toBe(10);
    expect(visibleLimit(25, 1)).toBe(10);
    expect(visibleLimit(25, 2)).toBe(20);
    expect(visibleLimit(25, 3)).toBe(25);
    expect(visibleLimit(11, 1)).toBe(11);
    expect(visibleLimit(12, 1)).toBe(12);
    expect(visibleLimit(13, 1)).toBe(10);
    expect(visibleLimit(4, 1)).toBe(4);
  });
});
