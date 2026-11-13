// Offline listening: pure helpers shared by the service worker and the page
// modules. No DOM, no window: it must load inside a worker and under Node.
// Rules: docs/contracts.md section 9.

export const AUDIO_CACHE = "audio-v1";
export const SHELL_PREFIX = "shell-";
/** Narration is about 128 kbit/s, 16000 bytes a second. Used only when a story has no audioBytes. */
export const EST_BYTES_PER_SEC = 16_000;
/** A save must fit with this much to spare. */
export const SPACE_MARGIN = 0.1;

/** @returns {{bytes: number, exact: boolean}} */
export function storyBytes(story) {
  if (Number.isInteger(story?.audioBytes) && story.audioBytes > 0) return { bytes: story.audioBytes, exact: true };
  if (Number.isFinite(story?.durationSec) && story.durationSec > 0) {
    return { bytes: Math.round(story.durationSec * EST_BYTES_PER_SEC), exact: false };
  }
  return { bytes: 0, exact: false };
}

export function totalBytes(stories) {
  let bytes = 0;
  let exact = true;
  for (const s of stories) {
    const b = storyBytes(s);
    bytes += b.bytes;
    if (!b.exact) exact = false;
  }
  return { bytes, exact };
}

/** "28 MB", "4.2 MB", "1.5 GB". Decimal units, as Android's settings show them. `~` when not exact. */
export function formatBytes(n, exact = true) {
  const v = Number.isFinite(n) && n > 0 ? n : 0;
  let text;
  if (v < 1e3) text = `${Math.round(v)} B`;
  else if (v < 1e6) text = `${Math.round(v / 1e3)} KB`;
  else if (v < 1e9) {
    const mb = v / 1e6;
    text = `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  } else text = `${(v / 1e9).toFixed(1)} GB`;
  return exact ? text : `~${text}`;
}

/** Does a selection of `needBytes` fit? `quota`/`usage` come from navigator.storage.estimate(). */
export function spaceCheck({ needBytes, quota, usage, margin = SPACE_MARGIN }) {
  if (!Number.isFinite(quota) || !Number.isFinite(usage)) {
    return { fits: true, freeBytes: null, needBytes, shortBy: 0 };
  }
  const freeBytes = Math.max(0, quota - usage);
  const wanted = needBytes * (1 + margin);
  return { fits: wanted <= freeBytes, freeBytes, needBytes, shortBy: Math.max(0, Math.ceil(wanted - freeBytes)) };
}

export function spaceMessage({ needBytes, freeBytes }) {
  return `Needs ${formatBytes(needBytes)}, ${formatBytes(freeBytes ?? 0)} free`;
}

// job.failedReasons values from offline.mjs, in words a listener understands.
const FAILURE_WORDS = {
  "no space": "Not enough space",
  incomplete: "Download interrupted",
  network: "Download interrupted",
  "size mismatch": "File changed, try again later",
  "wrong type": "File changed, try again later",
  "not ok": "File not available, try again later",
};

/** Plain words for a store failure reason, or null when the reason is unknown. */
export function failureWords(reason) {
  return FAILURE_WORDS[reason] ?? null;
}

/** True when `record` (an index entry) does not hold this story's current audio. */
export function needsSave(story, record) {
  return !record || record.url !== story.audioUrl;
}

/** One `bytes=a-b` range. Returns {start, end}, "unsatisfiable", or null (no usable range: serve it all). */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start;
  let end;
  if (m[1] === "") {
    const last = Number(m[2]);
    if (last === 0) return "unsatisfiable";
    start = Math.max(0, size - last);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

/** Answers a (possibly ranged) request from a cached full response. */
export async function rangeResponse(cached, rangeHeader) {
  const blob = await cached.blob();
  const size = blob.size;
  const type = cached.headers.get("Content-Type") || "audio/mpeg";
  const range = parseRange(rangeHeader, size);
  if (range === null) {
    return new Response(blob, { status: 200, headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  }
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const slice = blob.slice(range.start, range.end + 1);
  const headers = {
    "Content-Type": type,
    "Content-Length": String(slice.size),
    "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
    "Accept-Ranges": "bytes",
  };
  for (const name of ["ETag", "Last-Modified"]) {
    const v = cached.headers.get(name);
    if (v) headers[name] = v;
  }
  return new Response(slice, { status: 206, headers });
}
