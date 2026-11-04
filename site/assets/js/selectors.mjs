// Pure selection rules shared by the modules (no DOM, no storage), so they can
// be tested directly. `records` is the result of progress.readAll().
import { toViewModel } from "./progress.mjs";

export const NEW_WINDOW_DAYS = 14;
export const UNDER_MINUTES = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

function vmFor(story, record) {
  return toViewModel(record, { durationSec: story.durationSec });
}

function publishedAt(story) {
  const t = Date.parse(story.publishDate);
  return Number.isNaN(t) ? 0 : t;
}

/** Newest first; ties broken by series order then title so the order is stable. */
export function byNewest(a, b) {
  return publishedAt(b) - publishedAt(a)
    || (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0)
    || a.title.localeCompare(b.title);
}

/** Published in the last 14 days and no progress at all. */
export function isNew(story, record, now = Date.now()) {
  if (vmFor(story, record).state !== "new") return false;
  if (record && record.completedAt !== undefined) return false;
  // Whole calendar days (publishDate has no time of day), so "14 days" is stable all day.
  return Math.floor((now - publishedAt(story)) / DAY_MS) <= NEW_WINDOW_DAYS;
}

/**
 * The Continue card: the most recently touched unfinished story. Finished
 * stories are skipped. With nothing unfinished in history it falls back to the
 * newest story that is not finished ("start"), or, when everything is
 * finished, the newest story ("again").
 * @returns {{story: object, kind: "resume"|"start"|"again", fraction: number}|null}
 */
export function pickContinue(stories, records) {
  const candidates = stories
    .map((story) => ({ story, record: records[story.slug], vm: vmFor(story, records[story.slug]) }))
    .filter((c) => c.vm.state === "in-progress")
    .sort((a, b) => b.record.savedAt - a.record.savedAt);
  if (candidates.length > 0) {
    const { story, vm } = candidates[0];
    return { story, kind: "resume", fraction: vm.fraction };
  }
  const newest = [...stories].sort(byNewest);
  const unfinished = newest.find((s) => vmFor(s, records[s.slug]).state !== "finished");
  if (unfinished) return { story: unfinished, kind: "start", fraction: 0 };
  return newest[0] ? { story: newest[0], kind: "again", fraction: 1 } : null;
}

/**
 * "Played lately": the most recent stories with any history, finished or not.
 * @returns {{story: object, state: string, fraction: number}[]}
 */
export function pickPlayedLately(stories, records, count = 3) {
  return stories
    .map((story) => ({ story, record: records[story.slug], vm: vmFor(story, records[story.slug]) }))
    .filter((c) => c.record && c.vm.state !== "new")
    .sort((a, b) => b.record.savedAt - a.record.savedAt)
    .slice(0, count)
    .map(({ story, vm }) => ({ story, state: vm.state, fraction: vm.fraction }));
}

/** Every whitespace-separated word must appear in title, series or tags. */
export function matchesQuery(story, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [story.title, story.series ?? "", ...(story.tags ?? [])].join(" ").toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/**
 * Filters combine with AND across groups (world, series, collection, under 15
 * minutes, status) and OR within the status group (in progress, not played,
 * finished, new).
 * @param {{world?: string, series?: string, collection?: string, lore?: object[], under15?: boolean, statuses?: string[]}} f
 */
export function matchesFilters(story, record, f, now = Date.now()) {
  if (f.world && story.world !== f.world) return false;
  if (f.series && story.series !== f.series) return false;
  if (f.collection && !matchesCollection(story, f.collection, f.lore)) return false;
  if (f.under15 && !(story.durationSec !== null && story.durationSec < UNDER_MINUTES * 60)) return false;
  const statuses = f.statuses ?? [];
  if (statuses.length > 0) {
    const state = vmFor(story, record).state;
    const hit = statuses.some((s) => {
      if (s === "in-progress") return state === "in-progress";
      if (s === "finished") return state === "finished";
      if (s === "not-played") return state === "new";
      if (s === "new") return isNew(story, record, now);
      return false;
    });
    if (!hit) return false;
  }
  return true;
}

// ---- Library: grouping, summaries, collections, paging ----

export const PAGE_SIZE = 10;
const MIN_REMAINDER = 3;

/**
 * How many items to show after `pages` reveals of `size`: a page at a time, but
 * a remainder of one or two is shown outright (nobody wants "Show 2 more").
 */
export function visibleLimit(total, pages = 1, size = PAGE_SIZE) {
  const limit = Math.max(1, pages) * size;
  return total - limit < MIN_REMAINDER ? total : limit;
}

/** Inside one series: story order when every story has one, else newest first. "newest" is always newest first. */
function inSeriesCompare(sort, stories) {
  const ordered = sort !== "newest" && stories.every((s) => Number.isInteger(s.seriesOrder));
  return ordered
    ? (a, b) => a.seriesOrder - b.seriesOrder || a.title.localeCompare(b.title)
    : (a, b) => publishedAt(b) - publishedAt(a) || (b.seriesOrder ?? 0) - (a.seriesOrder ?? 0) || a.title.localeCompare(b.title);
}

/**
 * Series cards for a set of stories: one group per world and series (stories
 * with no series gather in one standalone group per world, last). Freshest
 * series first. Each group's stories follow the sort.
 * @returns {{key: string, world: string, name: string, standalone: boolean, newest: number, stories: object[]}[]}
 */
export function groupStories(stories, sort = "order") {
  const map = new Map();
  for (const story of stories) {
    const key = `${story.world}|${story.series ?? ""}`;
    if (!map.has(key)) map.set(key, { key, world: story.world, name: story.series ?? "", standalone: !story.series, newest: 0, stories: [] });
    const group = map.get(key);
    group.stories.push(story);
    group.newest = Math.max(group.newest, publishedAt(story));
  }
  const groups = [...map.values()];
  for (const g of groups) g.stories.sort(inSeriesCompare(sort, g.stories));
  groups.sort((a, b) => Number(a.standalone) - Number(b.standalone) || b.newest - a.newest || a.name.localeCompare(b.name));
  return groups;
}

/** The flat results order: newest first for "newest", else the groups' own order, series by series. */
export function orderStories(stories, sort = "order") {
  if (sort === "newest") return [...stories].sort((a, b) => publishedAt(b) - publishedAt(a) || (b.seriesOrder ?? 0) - (a.seriesOrder ?? 0) || a.title.localeCompare(b.title));
  return groupStories(stories, sort).flatMap((g) => g.stories);
}

/**
 * The numbers and the next-up hint for a series card.
 * next: the story in progress touched last ("continue"), else the first story
 * (in the group's order) not yet finished ("next" once something is heard,
 * "start" before), else null with allHeard true.
 */
export function seriesSummary(stories, records) {
  let heard = 0;
  let resume = null;
  let firstOpen = null;
  for (const story of stories) {
    const record = records[story.slug];
    const state = vmFor(story, record).state;
    if (state === "finished") heard += 1;
    else {
      if (!firstOpen) firstOpen = story;
      if (state === "in-progress" && (!resume || record.savedAt > records[resume.slug].savedAt)) resume = story;
    }
  }
  const total = stories.length;
  let next = null;
  if (resume) next = { kind: "continue", story: resume };
  else if (firstOpen) next = { kind: heard > 0 ? "next" : "start", story: firstOpen };
  return { total, heard, allHeard: total > 0 && heard === total, next };
}

/** slug -> set of traditions, from lore entries (`lore[].stories` are story slugs). */
function traditionsBySlug(lore) {
  const map = new Map();
  for (const entry of lore ?? []) {
    if (!entry.tradition) continue;
    for (const slug of entry.stories ?? []) {
      if (!map.has(slug)) map.set(slug, new Set());
      map.get(slug).add(entry.tradition);
    }
  }
  return map;
}

/** Traditions (collections) among the stories in scope: [{name, count}], alphabetical. Empty without lore. */
export function collectionsFor(stories, lore) {
  const bySlug = traditionsBySlug(lore);
  const counts = new Map();
  for (const story of stories) {
    for (const name of bySlug.get(story.slug) ?? []) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

export function matchesCollection(story, collection, lore) {
  if (!collection) return true;
  return traditionsBySlug(lore).get(story.slug)?.has(collection) ?? false;
}
