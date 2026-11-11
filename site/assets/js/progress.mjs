// Progress store. Records are keyed `story-progress:<slug>` in localStorage:
//   { v: 2, audioTime, scrollY, playing, savedAt, completedAt? }
// v1 records ({ url, title, artworkUrl, prevUrl, ... }) are still read, ignoring
// those fields, and are rewritten as v2 on the next write. Title, URL and art
// are never read from storage; they come from library.json.
// Nothing here throws when localStorage is missing, full or blocked.

const PREFIX = "story-progress:";
const V2_FIELDS = ["v", "audioTime", "scrollY", "playing", "savedAt", "completedAt"];

/** A finished story counts as in progress again only after this much replay. */
export const REPLAY_THRESHOLD_SEC = 10;
/** Playback within this many seconds of the real end counts as finished. */
export const COMPLETE_WINDOW_SEC = 10;
/** Listening shorter than this is not "in progress". */
export const MIN_PROGRESS_SEC = 1;
/** Reading further down than this is "in progress" (stories can be read, not heard). */
export const MIN_SCROLL_PX = 200;

function store() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // accessing localStorage can itself throw (blocked site data)
  }
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pick(r) {
  const out = { v: 2, audioTime: r.audioTime, scrollY: r.scrollY, playing: r.playing, savedAt: r.savedAt };
  if (r.completedAt !== undefined) out.completedAt = r.completedAt;
  return out;
}

/** @returns {object|null} a v2 record, or null when `raw` is not a usable v1 or v2 record */
function normalise(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.v === 2) {
    if (Object.keys(raw).some((k) => !V2_FIELDS.includes(k))) return null;
    if (!isNum(raw.audioTime) || !isNum(raw.scrollY) || !isNum(raw.savedAt)) return null;
    if (typeof raw.playing !== "boolean") return null;
    if ("completedAt" in raw && !isNum(raw.completedAt)) return null;
    return pick(raw);
  }
  if (raw.v === undefined || raw.v === 1) {
    // v1 wrote partial records (a bare title/url on page load), so fields may be missing.
    const out = {
      v: 2,
      audioTime: raw.audioTime ?? 0,
      scrollY: raw.scrollY ?? 0,
      playing: raw.playing ?? false,
      savedAt: raw.savedAt ?? 0,
    };
    if (raw.completedAt !== undefined) out.completedAt = raw.completedAt;
    if (!isNum(out.audioTime) || !isNum(out.scrollY) || !isNum(out.savedAt)) return null;
    if (typeof out.playing !== "boolean") return null;
    if ("completedAt" in out && !isNum(out.completedAt)) return null;
    return out;
  }
  return null;
}

function emit(slug) {
  if (typeof document === "undefined" || typeof CustomEvent === "undefined") return;
  document.dispatchEvent(new CustomEvent("stories:progress", { detail: { slug } }));
}

/** @returns {Record<string, object>} every valid record keyed by slug, normalised to v2 */
export function readAll() {
  const s = store();
  const out = {};
  if (!s) return out;
  try {
    const keys = [];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key && key.startsWith(PREFIX) && key.length > PREFIX.length) keys.push(key);
    }
    for (const key of keys) {
      const record = normalise(parse(s.getItem(key)));
      if (record) out[key.slice(PREFIX.length)] = record;
    }
  } catch {
    // storage became unavailable mid-read: return what we have
  }
  return out;
}

/** @param {string} slug @returns {object|null} normalised v2 record or null */
export function read(slug) {
  const s = store();
  if (!s || typeof slug !== "string" || !slug) return null;
  try {
    return normalise(parse(s.getItem(PREFIX + slug)));
  } catch {
    return null;
  }
}

/**
 * Merges `partial` (audioTime, scrollY, playing, completedAt; anything else or
 * invalid is ignored) into the record, stamps savedAt and writes it as v2.
 * Fires `stories:progress` on document.
 * @returns {object|null} the record written, or null if it could not be stored
 */
export function write(slug, partial = {}) {
  const s = store();
  if (!s || typeof slug !== "string" || !slug) return null;
  const next = read(slug) ?? { v: 2, audioTime: 0, scrollY: 0, playing: false, savedAt: 0 };
  for (const key of ["audioTime", "scrollY", "completedAt"]) {
    if (isNum(partial[key])) next[key] = partial[key];
  }
  if (typeof partial.playing === "boolean") next.playing = partial.playing;
  next.savedAt = Date.now();
  const record = pick(next);
  try {
    s.setItem(PREFIX + slug, JSON.stringify(record));
  } catch {
    return null; // quota exceeded, private mode, etc.
  }
  emit(slug);
  return record;
}

// Play counts live under their own key, `story-plays:<slug>` = {"n": <whole number>},
// not in the v2 record: a record with an extra field would be rejected as invalid by
// any older copy of this module still open in another tab. One count is one listen
// to the end. A story finished before counts existed (completedAt, no count) is 1.
const PLAYS_PREFIX = "story-plays:";

function readStoredPlays(s, slug) {
  const raw = parse(s.getItem(PLAYS_PREFIX + slug));
  return raw && Number.isInteger(raw.n) && raw.n > 0 ? raw.n : 0;
}

/** @param {string} slug @param {object|null} [record] the story's v2 record, if already read
 *  @returns {number} how many times the story has been listened to the end on this device */
export function playCount(slug, record = read(slug)) {
  const s = store();
  let n = 0;
  try {
    if (s && typeof slug === "string" && slug) n = readStoredPlays(s, slug);
  } catch {
    // storage unavailable: fall back to the record alone
  }
  return Math.max(n, record && record.completedAt !== undefined ? 1 : 0);
}

/** @param {Record<string, object>} [records] readAll() output
 *  @returns {Record<string, number>} count per slug, only for stories heard at least once */
export function readPlays(records = readAll()) {
  const out = {};
  for (const [slug, record] of Object.entries(records)) {
    const n = playCount(slug, record);
    if (n > 0) out[slug] = n;
  }
  const s = store();
  if (!s) return out;
  try {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (!key || !key.startsWith(PLAYS_PREFIX) || key.length === PLAYS_PREFIX.length) continue;
      const slug = key.slice(PLAYS_PREFIX.length);
      const n = playCount(slug, records[slug] ?? null);
      if (n > 0) out[slug] = n;
    }
  } catch {
    // return what we have
  }
  return out;
}

/**
 * Sets completedAt, resets audioTime to 0, clears `playing` and counts one more
 * listen, unless this story is already sitting finished (a second call for the
 * same listen: `ended` and the foreground check can both fire).
 */
export function markCompleted(slug) {
  const prev = read(slug);
  const alreadyCounted = prev && prev.completedAt !== undefined && prev.audioTime <= REPLAY_THRESHOLD_SEC;
  const before = playCount(slug, prev);
  let counted = false;
  if (!alreadyCounted) {
    // The count goes in first: write() announces the change and listeners re-read it.
    try {
      store()?.setItem(PLAYS_PREFIX + slug, JSON.stringify({ n: before + 1 }));
      counted = true;
    } catch {
      // quota or blocked storage: the story is still marked finished
    }
  }
  const record = write(slug, { completedAt: Date.now(), audioTime: 0, playing: false });
  if (!record && counted) {
    try {
      store()?.setItem(PLAYS_PREFIX + slug, JSON.stringify({ n: before }));
    } catch {
      // nothing more to do
    }
  }
  return record;
}

/**
 * @param {object|null} record a v2 record
 * @param {{durationSec?: number|null}} [info]
 * @returns {{state: "new"|"in-progress"|"finished", fraction: number}}
 *   `new` means no meaningful progress (not "recently published": see selectors.isNew).
 */
export function toViewModel(record, info = {}) {
  if (!record) return { state: "new", fraction: 0 };
  // Replay: completedAt survives, but the story only counts as in progress
  // again once playback passes REPLAY_THRESHOLD_SEC.
  if (record.completedAt !== undefined && record.audioTime <= REPLAY_THRESHOLD_SEC) {
    return { state: "finished", fraction: 1 };
  }
  const started = record.audioTime >= MIN_PROGRESS_SEC || record.scrollY > MIN_SCROLL_PX;
  if (!started) return { state: "new", fraction: 0 };
  const duration = info?.durationSec;
  const fraction = duration > 0 ? Math.min(1, Math.max(0, record.audioTime / duration)) : 0;
  return { state: "in-progress", fraction };
}
