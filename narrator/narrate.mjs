import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import matter from "gray-matter";

// A new scene starts at a `• • •` line or at any markdown heading (the
// stories use "## Part N. Title" headings for chapters).
const SCENE_BREAK = /\n\s*•\s*•\s*•\s*\n|\n(?=#{1,6} )/g;
// The models' real ceiling is 10,000 chars/request; keep
// headroom so a chunk boundary never lands exactly on the limit.
const MAX_CHUNK_CHARS = 9000;
// Eleven v4 costs the same per character as multilingual_v2 and sounds more
// expressive (checked on a trial story, Nov 2026). Worlds can still pin a model
// in narration/narrator.json.
const DEFAULT_MODEL_ID = "eleven_v4";
const DEFAULT_VOICE_ID = "ZF6FPAbjXT4488VcRRnw"; // Amelia

// Narrates a story into one mp3 with a single ElevenLabs voice, and writes the part times
// and audioDuration back into the story. One narrator for every world (see narrator/README.md).

export function parseScenes(markdown) {
  return markdown
    .split(SCENE_BREAK)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Packs whole scenes into chunks under maxChars, so a chunk boundary always
// falls on a scene break when possible. A single scene longer than maxChars
// (rare) is split on sentence boundaries instead, never mid-sentence.
export function packChunks(scenes, maxChars = MAX_CHUNK_CHARS) {
  const chunks = [];
  let current = "";
  for (const scene of scenes) {
    const piece = current ? `${current}\n\n${scene}` : scene;
    if (piece.length <= maxChars) {
      current = piece;
      continue;
    }
    if (current) chunks.push(current);
    if (scene.length <= maxChars) {
      current = scene;
      continue;
    }
    const sentences = scene.match(/[^.!?]+(?:[.!?]+(\s|$))?/g) ?? [scene];
    current = "";
    for (const sentence of sentences) {
      const withSentence = current ? `${current}${sentence}` : sentence;
      if (withSentence.length > maxChars && current) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current = withSentence;
      }
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}


// Turns "## Part Three. The Old Myth" into the plain spoken line
// "Part Three. The Old Myth." and strips emphasis markers, so the voice never
// reads out a "#" or an asterisk.
export function cleanForNarration(markdown) {
  return markdown
    .replace(/^#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_, heading) =>
      /[.!?]$/.test(heading) ? heading : `${heading}.`
    )
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, "$1$2");
}

// Replaces whole words using a { "Written": "Spoken" } map, longest key first,
// so the page text keeps its proper spelling while the voice gets a respelling.
export function applyPronunciations(text, map = {}) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  let out = text;
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu");
    out = out.replace(re, map[key]);
  }
  return out;
}

export function loadPronunciations(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("_")));
  } catch {
    return {};
  }
}


// Posts one chunk to the with-timestamps endpoint. The JSON response carries
// the audio (base64) plus character-level alignment, which is what lets us
// find where each "## Part" heading starts inside a chunk. Each cache entry is
// three files: <key>.mp3, <key>.alignment.json and (written last, as the
// "complete" marker) <key>.request-id. Entries from before alignment existed
// have no .alignment.json, so they count as a miss and are regenerated.
export async function callElevenLabs({
  text,
  voiceId,
  modelId,
  apiKey,
  cacheDir,
  previousRequestId,
  fetchImpl = fetch,
}) {
  const key = crypto.createHash("sha256")
    .update(JSON.stringify({ text, voiceId, modelId, previousRequestId }))
    .digest("hex");
  const cachePath = path.join(cacheDir, `${key}.mp3`);
  const idPath = path.join(cacheDir, `${key}.request-id`);
  const alignmentPath = path.join(cacheDir, `${key}.alignment.json`);
  if (fs.existsSync(cachePath) && fs.existsSync(idPath) && fs.existsSync(alignmentPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(alignmentPath, "utf8"));
      if (cached?.alignment || cached?.normalized_alignment) {
        console.log("  -> cached, skipping API call");
        return {
          mp3Path: cachePath,
          requestId: fs.readFileSync(idPath, "utf8").trim(),
          alignment: cached.alignment ?? null,
          normalizedAlignment: cached.normalized_alignment ?? null,
        };
      }
    } catch {
      // Unreadable alignment file: fall through and regenerate.
    }
  }
  if (fs.existsSync(cachePath) && !fs.existsSync(alignmentPath)) {
    console.log("  -> cache entry has no alignment (made before part timing existed), regenerating");
  }

  const body = {
    text,
    model_id: modelId,
  };
  if (previousRequestId) {
    body.previous_request_ids = [previousRequestId];
  }

  console.log("  -> calling ElevenLabs (this can take a while for a long chunk)...");
  const res = await fetchImpl(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs request failed (${res.status}): ${await res.text()}`);
  }
  const requestId = res.headers.get("request-id") ?? res.headers.get("x-request-id") ?? "";
  const payload = await res.json();
  if (!payload?.audio_base64) {
    throw new Error("ElevenLabs response had no audio_base64");
  }
  const alignment = payload.alignment ?? null;
  const normalizedAlignment = payload.normalized_alignment ?? null;
  if (!alignment && !normalizedAlignment) {
    throw new Error(
      "ElevenLabs response had no alignment (alignment and normalized_alignment are both null), so part times cannot be computed"
    );
  }
  const buffer = Buffer.from(payload.audio_base64, "base64");
  fs.mkdirSync(cacheDir, { recursive: true });
  const tempPath = `${cachePath}.tmp`;
  fs.writeFileSync(tempPath, buffer);
  fs.renameSync(tempPath, cachePath);
  fs.writeFileSync(
    alignmentPath,
    JSON.stringify({ alignment, normalized_alignment: normalizedAlignment })
  );
  fs.writeFileSync(idPath, requestId);
  console.log(`  -> received ${(buffer.length / 1024).toFixed(0)} KB`);
  return { mp3Path: cachePath, requestId, alignment, normalizedAlignment };
}

// Generates (or loads from cache) every chunk in order, chaining request ids.
export async function narrateChunks({ chunks, voiceId, modelId, apiKey, cacheDir, fetchImpl }) {
  const results = [];
  let previousRequestId;
  for (const [i, chunk] of chunks.entries()) {
    console.log(`Generating chunk ${i + 1}/${chunks.length} (${chunk.length} chars)...`);
    const result = await callElevenLabs({
      text: chunk,
      voiceId,
      modelId,
      apiKey,
      cacheDir,
      previousRequestId,
      fetchImpl,
    });
    results.push(result);
    previousRequestId = result.requestId || previousRequestId;
  }
  return results;
}

// ---- Part timing -----------------------------------------------------------

// The `## ` (level 2) headings of a story, in document order. `title` is the
// heading text for the front matter; `spoken` is exactly what the narrator
// sends for that heading line (cleaned, full stop added, respelled).
export function extractParts(markdown, pronunciations = {}) {
  const parts = [];
  for (const m of markdown.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)) {
    parts.push({
      title: cleanForNarration(m[1]),
      spoken: applyPronunciations(cleanForNarration(`## ${m[1]}`), pronunciations),
    });
  }
  return parts;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Finds each heading's position in the chunk sequence. Chunks are trimmed and
// may split a heading between its two sentences, so we search the chunks
// joined by a blank line, treating any run of whitespace in the heading as
// flexible, and only accept a match that occupies whole lines. Headings are
// searched in order, each after the previous match, so repeated titles map
// to the right occurrence. Returns { chunkIndex, offset } per heading, where
// offset is a character index inside that chunk's SENT text (the text after
// cleaning and respelling, which is also the text the alignment describes).
export function locateHeadings(chunks, spokenHeadings) {
  const starts = [];
  let pos = 0;
  for (const chunk of chunks) {
    starts.push(pos);
    pos += chunk.length + 2; // the "\n\n" join
  }
  const virtual = chunks.join("\n\n");
  const found = [];
  let cursor = 0;
  for (const spoken of spokenHeadings) {
    const pattern = spoken.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
    const re = new RegExp(`(?<![^\\n])${pattern}(?![^\\n])`, "g");
    re.lastIndex = cursor;
    const m = re.exec(virtual);
    if (!m) {
      throw new Error(`Could not find the heading "${spoken}" in the text sent to the narrator`);
    }
    let chunkIndex = 0;
    while (chunkIndex + 1 < starts.length && starts[chunkIndex + 1] <= m.index) chunkIndex++;
    found.push({ chunkIndex, offset: m.index - starts[chunkIndex] });
    cursor = m.index + m[0].length;
  }
  return found;
}

function checkAlignmentShape(alignment) {
  const {
    characters,
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
  } = alignment ?? {};
  if (
    !Array.isArray(characters) ||
    !Array.isArray(starts) ||
    !Array.isArray(ends) ||
    characters.length !== starts.length ||
    characters.length !== ends.length
  ) {
    throw new Error("Alignment is malformed (characters and times must be arrays of equal length)");
  }
}

// Returns a function mapping a character offset in `text` (the text we sent)
// to the start time, in seconds, of that character. `alignment` is documented
// as covering the original text, but we do not trust that blindly:
// 1. If its characters concatenate to exactly `text`, offsets map directly
//    (an alignment entry may hold more than one UTF-16 unit).
// 2. Otherwise, if they match ignoring whitespace, map by non-whitespace rank.
// 3. Otherwise throw: a wrong guess would silently shift every part.
export function makeTimeLookup(text, alignment) {
  checkAlignmentShape(alignment);
  const { characters, character_start_times_seconds: times } = alignment;
  if (characters.join("") === text) {
    const entryStarts = [];
    let at = 0;
    for (const c of characters) {
      entryStarts.push(at);
      at += c.length;
    }
    return (offset) => {
      let lo = 0;
      let hi = entryStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (entryStarts[mid] <= offset) lo = mid;
        else hi = mid - 1;
      }
      return times[lo];
    };
  }
  const textRank = new Map();
  let nonSpaceText = "";
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) {
      textRank.set(i, nonSpaceText.length);
      nonSpaceText += text[i];
    }
  }
  const entryOfRank = [];
  let nonSpaceAlign = "";
  characters.forEach((c, entry) => {
    for (const unit of c) {
      if (!/\s/.test(unit)) {
        entryOfRank.push(entry);
        nonSpaceAlign += unit;
      }
    }
  });
  if (nonSpaceText !== nonSpaceAlign) {
    throw new Error(
      "Alignment characters do not match the text that was sent, so part times cannot be mapped safely"
    );
  }
  return (offset) => {
    const rank = textRank.get(offset);
    if (rank === undefined) {
      throw new Error(`Offset ${offset} is whitespace, cannot look up its time`);
    }
    return times[entryOfRank[rank]];
  };
}

function lookupForChunk(text, result) {
  const attempts = [result.alignment, result.normalizedAlignment].filter(Boolean);
  let lastError;
  for (const alignment of attempts) {
    try {
      return makeTimeLookup(text, alignment);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Chunk has no alignment");
}

const round2 = (n) => Math.round(n * 100) / 100;

// Pure core of the feature. chunks: the text sent for each chunk. results:
// per chunk { alignment, normalizedAlignment }. chunkDurations: per chunk, the
// real audio length in seconds (measured from the mp3, not guessed from the
// alignment, so encoder padding is included). Returns [{title, start}] with
// start in the concatenated audio, rounded to 10 ms.
export function computePartStarts({ chunks, results, chunkDurations, parts, audioDuration }) {
  if (parts.length === 0) return [];
  const located = locateHeadings(chunks, parts.map((p) => p.spoken));
  const offsets = [];
  let acc = 0;
  for (const d of chunkDurations) {
    offsets.push(acc);
    acc += d;
  }
  const lookups = new Map();
  const out = parts.map((part, i) => {
    const { chunkIndex, offset } = located[i];
    if (!lookups.has(chunkIndex)) {
      lookups.set(chunkIndex, lookupForChunk(chunks[chunkIndex], results[chunkIndex]));
    }
    const local = lookups.get(chunkIndex)(offset);
    return { title: part.title, start: round2(offsets[chunkIndex] + local) };
  });
  for (let i = 1; i < out.length; i++) {
    if (out[i].start < out[i - 1].start) {
      throw new Error(
        `Part starts are not in order ("${out[i - 1].title}" at ${out[i - 1].start}s, "${out[i].title}" at ${out[i].start}s)`
      );
    }
  }
  if (audioDuration !== undefined && out[out.length - 1].start > audioDuration) {
    throw new Error(
      `Last part starts at ${out[out.length - 1].start}s, after the audio ends (${audioDuration}s)`
    );
  }
  return out;
}

// ---- Front matter ----------------------------------------------------------

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

export function hasFrontMatter(source) {
  return FRONT_MATTER.test(source);
}

// Targeted update of `audioDuration` and `parts` in a story's front matter.
// Every other line is kept byte for byte. An existing key is replaced where it
// stands; a missing audioDuration goes at the end of the block and a missing
// parts goes right after audioDuration. An empty `parts` list removes any
// stale `parts`. The result is re-parsed with gray-matter and compared with
// the original, and the function throws rather than return text that changed
// another key.
export function updateFrontMatter(source, { parts, audioDuration }) {
  const m = source.match(FRONT_MATTER);
  if (!m) throw new Error("Story has no front matter to update");
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = m[1].split(/\r?\n/);

  const keyOf = (line) => /^([A-Za-z_][\w-]*)\s*:/.exec(line)?.[1];
  const rangeOf = (key) => {
    const begin = lines.findIndex((l) => keyOf(l) === key);
    if (begin === -1) return null;
    let end = begin + 1;
    while (end < lines.length && keyOf(lines[end]) === undefined && !/^#/.test(lines[end])) end++;
    while (end > begin + 1 && lines[end - 1].trim() === "") end--; // blanks stay outside
    return [begin, end];
  };

  const durationLines = [`audioDuration: ${audioDuration}`];
  const partLines = parts.length
    ? [
        "parts:",
        ...parts.flatMap((p) => [`  - title: ${JSON.stringify(p.title)}`, `    start: ${p.start}`]),
      ]
    : [];

  const durRange = rangeOf("audioDuration");
  const partsRange = rangeOf("parts");
  // Replace existing ranges, later range first so earlier indexes stay valid.
  const edits = [];
  if (durRange) edits.push({ range: durRange, lines: durationLines });
  if (partsRange) edits.push({ range: partsRange, lines: partLines });
  edits.sort((a, b) => b.range[0] - a.range[0]);
  for (const { range, lines: replacement } of edits) {
    lines.splice(range[0], range[1] - range[0], ...replacement);
  }
  if (!durRange) {
    let at = lines.length;
    while (at > 0 && lines[at - 1].trim() === "") at--;
    lines.splice(at, 0, ...durationLines);
  }
  if (!partsRange && partLines.length) {
    const d = lines.findIndex((l) => keyOf(l) === "audioDuration");
    lines.splice(d + 1, 0, ...partLines);
  }

  const updated =
    source.slice(0, m.index) +
    `---${eol}${lines.join(eol)}${eol}---${m[2]}` +
    source.slice(m.index + m[0].length);

  const before = matter(source);
  const after = matter(updated);
  const others = (data) =>
    Object.entries(data).filter(([k]) => k !== "parts" && k !== "audioDuration");
  if (
    JSON.stringify(others(before.data)) !== JSON.stringify(others(after.data)) ||
    before.content !== after.content ||
    after.data.audioDuration !== audioDuration ||
    JSON.stringify(after.data.parts ?? []) !== JSON.stringify(parts)
  ) {
    throw new Error("Front matter update failed verification; the story file was not changed");
  }
  return updated;
}

async function measureMp3Duration(file) {
  const { parseFile } = await import("music-metadata");
  const metadata = await parseFile(file, { duration: true });
  return metadata.format.duration ?? 0;
}

function concatWithFfmpeg(mp3Paths, outPath) {
  if (mp3Paths.length === 1) {
    fs.copyFileSync(mp3Paths[0], outPath);
    return;
  }
  const listPath = path.join(path.dirname(outPath), `.concat-list-${Date.now()}.txt`);
  const listContent = mp3Paths.map((p) => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listPath, listContent);
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);
  } catch (err) {
    throw new Error(`ffmpeg failed (is it installed and on PATH?): ${err.message}`);
  } finally {
    fs.unlinkSync(listPath);
  }
}

export function getArgValue(args, flag, defaultValue) {
  const i = args.indexOf(flag);
  if (i === -1 || i + 1 >= args.length) return defaultValue;
  return args[i + 1];
}

// The raw alignment sits next to the audio: stories/x.mp3 -> stories/x.alignment.json
export function alignmentSidecarPath(outPath) {
  return `${outPath.replace(/\.mp3$/i, "")}.alignment.json`;
}

// The story text the narrator works on: front matter removed, line endings normalised.
// Story files checked out on Windows have CRLF endings; the heading search and the scene
// splitting both expect plain LF, and the voice does not care.
export function storyMarkdown(source) {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(/^---\n[\s\S]*?\n---(\n|$)/, "");
}

// ---- Worlds ------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.join(HERE, "out");
export const CACHE_DIR = path.join(HERE, ".cache");
const SHARED_PRONUNCIATIONS = path.join(HERE, "pronunciations.json");

// Which world a story file belongs to: the source in content-sources.json whose
// localPath contains it. Returns { source, root, storiesRoot, rel } or throws.
// `rel` is the story's path under the world's stories folder (forward slashes).
export function resolveWorld(storyPath, sources, { cwd = process.cwd() } = {}) {
  const story = path.resolve(cwd, storyPath);
  for (const source of sources) {
    if (!source.localPath) continue;
    const root = path.resolve(cwd, source.localPath);
    const storiesRoot = path.join(root, source.storiesPath || "stories");
    const rel = path.relative(storiesRoot, story);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel) && rel.endsWith(".md")) {
      return { source, root, storiesRoot, rel: rel.split(path.sep).join("/") };
    }
  }
  throw new Error(
    `${storyPath} is not inside any world's stories folder in content-sources.json ` +
      `(${sources.map((s) => `${s.name}: ${s.localPath}`).join(", ")})`
  );
}

// Where a story's mp3 goes by default: narrator/out/<world>/<path>.mp3. The upload step
// (scripts/upload-audio.mjs) looks here first, so nothing is written into a world repo
// except the story's own front matter.
export function defaultOutPath(world, outDir = OUT_DIR) {
  return path.join(outDir, world.source.name, world.rel.replace(/\.md$/, ".mp3"));
}

// A world's narration settings live in its own repo, in narration/:
//   narration/pronunciations.json  { "Written": "Spoken" }, added to the shared map
//   narration/narrator.json        { "voiceId": "...", "modelId": "..." } (both optional)
export function loadWorldNarration(root, { sharedPronunciations = SHARED_PRONUNCIATIONS } = {}) {
  const dir = path.join(root, "narration");
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(path.join(dir, "narrator.json"), "utf8"));
  } catch {
    // no settings: the defaults apply
  }
  return {
    voiceId: typeof settings.voiceId === "string" ? settings.voiceId : DEFAULT_VOICE_ID,
    modelId: typeof settings.modelId === "string" ? settings.modelId : DEFAULT_MODEL_ID,
    pronunciations: {
      ...loadPronunciations(sharedPronunciations),
      ...loadPronunciations(path.join(dir, "pronunciations.json")),
    },
  };
}

// ---- Command line ---------------------------------------------------------------

async function main() {
  const [, , storyPath, ...rest] = process.argv;
  if (!storyPath) {
    console.error("Usage: npm run narrate -- <path to a story .md in a world repo> [--dry-run] [--voice-id <id>] [--model-id <id>] [--out <out.mp3>]");
    process.exit(1);
  }

  let source;
  try {
    source = fs.readFileSync(storyPath, "utf8");
  } catch {
    console.error(`Story file not found: ${storyPath}`);
    process.exit(1);
  }

  let world;
  try {
    const sources = JSON.parse(fs.readFileSync("content-sources.json", "utf8"));
    world = resolveWorld(storyPath, sources);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const settings = loadWorldNarration(world.root);
  const voiceId = getArgValue(rest, "--voice-id", settings.voiceId);
  const modelId = getArgValue(rest, "--model-id", settings.modelId);
  const outPath = getArgValue(rest, "--out", defaultOutPath(world));
  const pronunciations = settings.pronunciations;

  const markdown = storyMarkdown(source);
  const narrationText = applyPronunciations(cleanForNarration(markdown), pronunciations);
  const scenes = parseScenes(narrationText);
  const chunks = packChunks(scenes, MAX_CHUNK_CHARS);
  const parts = extractParts(markdown, pronunciations);

  if (rest.includes("--dry-run")) {
    console.log(narrationText);
    console.error(`\n[dry run] world ${world.source.name}, voice ${voiceId}, ${Object.keys(pronunciations).length} respelling(s)`);
    console.error(`[dry run] would write ${outPath}`);
    console.error(`[dry run] ${chunks.length} chunk(s): ${chunks.map((c) => c.length).join(", ")} chars. No API calls made.`);
    try {
      const located = locateHeadings(chunks, parts.map((p) => p.spoken));
      console.error(`[dry run] ${parts.length} part heading(s) found:`);
      parts.forEach((p, i) => {
        console.error(`  chunk ${located[i].chunkIndex + 1}, char ${located[i].offset}: ${p.title}`);
      });
    } catch (err) {
      console.error(`[dry run] part headings problem: ${err.message}`);
    }
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Missing ELEVENLABS_API_KEY environment variable.");
    process.exit(1);
  }
  // Fail before spending credits if the results could not be written back.
  if (!hasFrontMatter(source)) {
    console.error(`${storyPath} has no front matter, so parts and audioDuration cannot be written. Add a front matter block first.`);
    process.exit(1);
  }
  try {
    locateHeadings(chunks, parts.map((p) => p.spoken));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  let results;
  try {
    results = await narrateChunks({ chunks, voiceId, modelId, apiKey, cacheDir: CACHE_DIR });
  } catch (err) {
    console.error(`Failed to generate audio via ElevenLabs: ${err.message}`);
    process.exit(1);
  }

  try {
    concatWithFfmpeg(results.map((r) => r.mp3Path), outPath);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  let audioDuration;
  let startedParts;
  try {
    const chunkDurations = [];
    for (const r of results) chunkDurations.push(await measureMp3Duration(r.mp3Path));
    const finalDuration = await measureMp3Duration(outPath);
    const summed = chunkDurations.reduce((a, b) => a + b, 0);
    if (Math.abs(summed - finalDuration) > 0.5) {
      console.warn(
        `Warning: chunk durations add up to ${summed.toFixed(2)}s but the joined file is ${finalDuration.toFixed(2)}s. Part starts after the first join may be off; check them by ear.`
      );
    }
    audioDuration = Math.round(finalDuration); // whole seconds, as validate-content.mjs derives it
    startedParts = computePartStarts({ chunks, results, chunkDurations, parts, audioDuration });

    fs.writeFileSync(
      alignmentSidecarPath(outPath),
      JSON.stringify(
        {
          version: 1,
          voiceId,
          modelId,
          audioDuration: finalDuration,
          parts: startedParts,
          chunks: chunks.map((text, i) => ({
            text,
            offsetSeconds: chunkDurations.slice(0, i).reduce((a, b) => a + b, 0),
            durationSeconds: chunkDurations[i],
            alignment: results[i].alignment,
            normalized_alignment: results[i].normalizedAlignment,
          })),
        },
        null,
        1
      )
    );

    const updated = updateFrontMatter(source, { parts: startedParts, audioDuration });
    const tempPath = `${storyPath}.tmp`;
    fs.writeFileSync(tempPath, updated);
    fs.renameSync(tempPath, storyPath);
  } catch (err) {
    console.error(`Audio was made (${outPath}) but part timing failed: ${err.message}`);
    process.exit(1);
  }
  console.log(`Done: ${outPath} (${audioDuration}s)`);
  console.log(`Wrote audioDuration and ${startedParts.length} part start(s) to ${storyPath}`);
  for (const p of startedParts) console.log(`  ${p.start.toFixed(2).padStart(8)}s  ${p.title}`);
  console.log("Next: npm run upload-audio -- --apply --world " + world.source.name + " --story " + path.basename(storyPath, ".md"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
