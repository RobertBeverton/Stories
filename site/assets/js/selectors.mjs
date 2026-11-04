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
 * Filters combine with AND across groups (world, series, under 15 minutes,
 * status) and OR within the status group (in progress, finished, new).
 * @param {{world?: string, series?: string, under15?: boolean, statuses?: string[]}} f
 */
export function matchesFilters(story, record, f, now = Date.now()) {
  if (f.world && story.world !== f.world) return false;
  if (f.series && story.series !== f.series) return false;
  if (f.under15 && !(story.durationSec !== null && story.durationSec < UNDER_MINUTES * 60)) return false;
  const statuses = f.statuses ?? [];
  if (statuses.length > 0) {
    const state = vmFor(story, record).state;
    const hit = statuses.some((s) => {
      if (s === "in-progress") return state === "in-progress";
      if (s === "finished") return state === "finished";
      if (s === "new") return isNew(story, record, now);
      return false;
    });
    if (!hit) return false;
  }
  return true;
}
