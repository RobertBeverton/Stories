// Pure selection rules shared by the modules (no DOM, no storage), so they can
// be tested directly. `records` is the result of progress.readAll().
import { toViewModel } from "./progress.mjs";

export const NEW_WINDOW_DAYS = 14;
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

// Search. A story is found by its title, series, tags, the lore entries that
// list it (so searching a god by name finds their story even when the title
// does not say who they are) and its character names. Characters that appear
// in more than half of all stories (the boys themselves) are left out: typing
// "alex" should not return the whole library.
const WEIGHT = { title: 4, series: 3, lore: 3, tags: 2, characters: 1 };

/**
 * Builds the per-story search fields once per library load.
 * @param {object[]} stories
 * @param {object[]} [lore] library.json lore entries ({title, tradition, stories[]})
 * @returns {Map<string, Record<keyof typeof WEIGHT, string>>}
 */
export function buildSearchIndex(stories, lore = []) {
  const counts = new Map();
  for (const s of stories) {
    for (const name of new Set((s.characters ?? []).map((c) => c.toLowerCase()))) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const common = new Set([...counts].filter(([, n]) => stories.length > 2 && n > stories.length / 2).map(([name]) => name));
  const loreBySlug = new Map();
  for (const entry of lore) {
    for (const slug of entry.stories ?? []) {
      const list = loreBySlug.get(slug) ?? [];
      list.push(entry.title, entry.tradition ?? "");
      loreBySlug.set(slug, list);
    }
  }
  return new Map(stories.map((s) => [s.slug, {
    title: s.title ?? "",
    series: s.series ?? "",
    lore: (loreBySlug.get(s.slug) ?? []).join(" ").toLowerCase(),
    tags: (s.tags ?? []).join(" ").toLowerCase(),
    characters: (s.characters ?? []).filter((c) => !common.has(c.toLowerCase())).join(" ").toLowerCase(),
  }]));
}

function fieldsFor(story, index) {
  return index?.get(story.slug) ?? {
    title: story.title ?? "", series: story.series ?? "", lore: "",
    tags: (story.tags ?? []).join(" "), characters: (story.characters ?? []).join(" "),
  };
}

const wordsOf = (query) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

/** Every whitespace-separated word must appear in at least one search field. */
export function matchesQuery(story, query, index) {
  const words = wordsOf(query);
  if (words.length === 0) return true;
  const f = fieldsFor(story, index);
  const hay = Object.values(f).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Higher is a better match: title beats series and lore, which beat tags, then characters. */
export function queryScore(story, query, index) {
  const words = wordsOf(query);
  const f = fieldsFor(story, index);
  let score = 0;
  for (const w of words) {
    for (const [field, weight] of Object.entries(WEIGHT)) {
      if (String(f[field]).toLowerCase().includes(w)) score += weight;
    }
  }
  return score;
}

/**
 * Filters combine with AND across groups (world, series, collection, has audio,
 * status) and OR within the status group (in progress, not played,
 * finished, new).
 * @param {{world?: string, series?: string, collection?: string, lore?: object[], audio?: boolean, saved?: boolean, savedSlugs?: Set<string>, statuses?: string[]}} f
 */
export function matchesFilters(story, record, f, now = Date.now()) {
  if (f.world && story.world !== f.world) return false;
  if (f.series && story.series !== f.series) return false;
  if (f.collection && !matchesCollection(story, f.collection, f.lore)) return false;
  if (f.saved && !f.savedSlugs?.has(story.slug)) return false; // savedSlugs comes from the offline store, never from progress keys
  if (f.audio && story.durationSec === null) return false; // durationSec comes from audioDuration, which narration writes
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

/**
 * "Surprise me": a story to try next, from one world or all.
 * Stories never heard to the end come first, picked at random. When every
 * story in the pool has been heard, it picks at random from the quarter heard
 * longest ago (at least 3 of them). Stories with audio are preferred, since
 * the point is to press play. `exclude` holds the slugs already offered, so
 * "Another one" never repeats a pick until the pool runs out; then it starts
 * the list again but still skips the story just offered.
 * @param {object[]} stories
 * @param {{records?: Record<string, object>, plays?: Record<string, number>, world?: string,
 *          exclude?: string[], random?: () => number}} [opts]
 * @returns {{story: object, heard: boolean, plays: number, poolSize: number}|null}
 */
export function pickSurprise(stories, opts = {}) {
  const { records = {}, plays = {}, world = "", exclude = [], random = Math.random } = opts;
  const inWorld = stories.filter((s) => !world || s.world === world);
  const withAudio = inWorld.filter((s) => s.durationSec !== null && s.durationSec !== undefined);
  const pool = withAudio.length > 0 ? withAudio : inWorld;
  if (pool.length === 0) return null;
  const last = exclude[exclude.length - 1];
  let fresh = pool.filter((s) => !exclude.includes(s.slug));
  if (fresh.length === 0) fresh = pool.length > 1 ? pool.filter((s) => s.slug !== last) : pool;
  const heard = (s) => (plays[s.slug] ?? 0) > 0 || records[s.slug]?.completedAt !== undefined;
  const never = fresh.filter((s) => !heard(s));
  let from = never;
  if (never.length === 0) {
    const oldest = [...fresh].sort((a, b) => (records[a.slug]?.completedAt ?? 0) - (records[b.slug]?.completedAt ?? 0));
    from = oldest.slice(0, Math.max(3, Math.ceil(oldest.length / 4)));
  }
  const story = from[Math.min(from.length - 1, Math.floor(random() * from.length))];
  return { story, heard: heard(story), plays: plays[story.slug] ?? (records[story.slug]?.completedAt !== undefined ? 1 : 0), poolSize: pool.length };
}

/**
 * Worlds ordered by when something in them was last played (most recent
 * first). Worlds with no listening keep their configured order after those.
 * A bare page visit does not count: it needs real listening or a finish.
 * @param {{name: string}[]} worlds
 * @param {object[]} stories
 * @param {Record<string, object>} records
 */
export function worldsByRecent(worlds, stories, records) {
  const lastPlayed = new Map();
  for (const story of stories) {
    const r = records[story.slug];
    if (!r || (r.completedAt === undefined && r.audioTime < 1)) continue;
    const at = Math.max(r.savedAt ?? 0, r.completedAt ?? 0);
    if (at > (lastPlayed.get(story.world) ?? 0)) lastPlayed.set(story.world, at);
  }
  return worlds
    .map((world, index) => ({ world, index, at: lastPlayed.get(world.name) ?? 0 }))
    .sort((a, b) => b.at - a.at || a.index - b.index)
    .map((x) => x.world);
}

/** Most listens first; ties go to the one heard most recently, then by title. */
export function byMostHeard(stories, plays, records) {
  return [...stories].sort((a, b) =>
    (plays[b.slug] ?? 0) - (plays[a.slug] ?? 0)
    || (records[b.slug]?.completedAt ?? 0) - (records[a.slug]?.completedAt ?? 0)
    || a.title.localeCompare(b.title));
}
