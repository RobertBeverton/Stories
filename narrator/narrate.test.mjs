import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { describe, it, expect, vi } from "vitest";
import {
  parseScenes,
  packChunks,
  getArgValue,
  cleanForNarration,
  applyPronunciations,
  extractParts,
  locateHeadings,
  makeTimeLookup,
  computePartStarts,
  updateFrontMatter,
  callElevenLabs,
  narrateChunks,
  alignmentSidecarPath,
} from "./narrate.mjs";

describe("parseScenes", () => {
  it("splits on scene-break lines", () => {
    const md = "Scene one.\n\n• • •\n\nScene two.";
    expect(parseScenes(md)).toEqual(["Scene one.", "Scene two."]);
  });

  it("returns a single scene when there is no break", () => {
    expect(parseScenes("Just one scene.")).toEqual(["Just one scene."]);
  });
});

describe("parseScenes with headings", () => {
  it("starts a new scene at each markdown heading", () => {
    const md = "## Part One. A\n\nText a.\n\n## Part Two. B\n\nText b.";
    expect(parseScenes(md)).toEqual([
      "## Part One. A\n\nText a.",
      "## Part Two. B\n\nText b.",
    ]);
  });
});

describe("cleanForNarration", () => {
  it("turns headings into spoken lines ending in a full stop", () => {
    expect(cleanForNarration("## Part Three. The Old Myth\n\nOnce.")).toBe(
      "Part Three. The Old Myth.\n\nOnce."
    );
  });

  it("does not double up punctuation already on a heading", () => {
    expect(cleanForNarration("## Part Four. Who?")).toBe("Part Four. Who?");
  });

  it("strips bold and italic markers", () => {
    expect(cleanForNarration("A *quiet* and **loud** day, said _she_.")).toBe(
      "A quiet and loud day, said she."
    );
  });

  it("leaves apostrophes and snake_case-free text alone", () => {
    expect(cleanForNarration("Alex's hat")).toBe("Alex's hat");
  });
});

describe("applyPronunciations", () => {
  it("replaces whole words only", () => {
    expect(applyPronunciations("Oshun and Oshunland", { Oshun: "Oh-shoon" })).toBe(
      "Oh-shoon and Oshunland"
    );
  });

  it("handles possessives and prefers the longest key", () => {
    const map = { Mrs: "Missus", "Mrs Oshun": "Missus Oh-shoon" };
    expect(applyPronunciations("Mrs Oshun's pond, said Mrs Tibbs.", map)).toBe(
      "Missus Oh-shoon's pond, said Missus Tibbs."
    );
  });

  it("matches accented names", () => {
    expect(applyPronunciations("Mister Väinö sang", { "Väinö": "Vai-no" })).toBe(
      "Mister Vai-no sang"
    );
  });

  it("returns the text unchanged for an empty map", () => {
    expect(applyPronunciations("Hello", {})).toBe("Hello");
  });
});

describe("packChunks", () => {
  it("keeps everything in one chunk when the whole story fits under the limit", () => {
    const scenes = ["Scene one.", "Scene two.", "Scene three."];
    const chunks = packChunks(scenes, 9000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Scene one.\n\nScene two.\n\nScene three.");
  });

  it("starts a new chunk at a scene break once the limit would be exceeded", () => {
    const scenes = ["a".repeat(50), "b".repeat(50), "c".repeat(50)];
    const chunks = packChunks(scenes, 110);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(`${"a".repeat(50)}\n\n${"b".repeat(50)}`);
    expect(chunks[1]).toBe("c".repeat(50));
  });

  it("splits a single scene longer than the limit on sentence boundaries, never mid-sentence", () => {
    const longScene = `${"a".repeat(60)}. ${"b".repeat(60)}. ${"c".repeat(60)}.`;
    const chunks = packChunks([longScene], 70);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toContain("a".repeat(60));
    expect(chunks.join(" ").replace(/\s+/g, " ")).toContain("b".repeat(60));
    expect(chunks.join(" ").replace(/\s+/g, " ")).toContain("c".repeat(60));
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(70 + 2); // +2 for trailing punctuation/space slack
    }
  });

  it("returns an empty array for no scenes", () => {
    expect(packChunks([])).toEqual([]);
  });
});

describe("getArgValue", () => {
  it("returns the value following the flag when present", () => {
    expect(getArgValue(["--voice-id", "abc123"], "--voice-id", "default")).toBe("abc123");
  });

  it("returns the default when the flag is absent", () => {
    expect(getArgValue(["--out", "story.mp3"], "--voice-id", "default")).toBe("default");
  });

  it("returns the default when the flag is the last element with no following value", () => {
    expect(getArgValue(["--voice-id"], "--voice-id", "default")).toBe("default");
  });
});

// ---- Part timing (mocked alignment, no API calls) --------------------------

// A fake alignment: character i of `text` starts at i * step seconds.
function fakeAlignment(text, step = 0.1) {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => +(i * step).toFixed(4)),
    character_end_times_seconds: characters.map((_, i) => +((i + 1) * step).toFixed(4)),
  };
}

const PRON = { Mrs: "Missus" };
const STORY = [
  "## Part One. Mrs Tibbs Arrives",
  "",
  "Mrs Tibbs came in. She sat down. It was quiet.",
  "",
  "## Part Two. The Hedge",
  "",
  "Then the hedge moved. Nobody spoke.",
  "",
  "## Part Three. Mrs Tibbs Leaves",
  "",
  "She left at last. The End.",
].join("\n");

// The text the narrator sends: cleaned and respelled. Headings lose their
// "#" before scene splitting (as in main()), so scenes only split at "• • •".
function narrationFor(markdown, map = PRON) {
  const text = applyPronunciations(cleanForNarration(markdown), map);
  return { text, chunks: (max) => packChunks(parseScenes(text), max) };
}

// Chunks that split on sentence boundaries, as packChunks does for one long scene.
function sentenceChunks(text, max) {
  return packChunks([text], max);
}

describe("extractParts", () => {
  it("finds only ## headings, in order, with the respelled spoken line", () => {
    const parts = extractParts(`${STORY}\n\n### Not a part\n\n# Nor this`, PRON);
    expect(parts.map((p) => p.title)).toEqual([
      "Part One. Mrs Tibbs Arrives",
      "Part Two. The Hedge",
      "Part Three. Mrs Tibbs Leaves",
    ]);
    expect(parts[0].spoken).toBe("Part One. Missus Tibbs Arrives.");
    expect(parts[1].spoken).toBe("Part Two. The Hedge.");
  });

  it("strips emphasis markers from the title", () => {
    expect(extractParts("## Part One. The *Big* Day")[0].title).toBe("Part One. The Big Day");
  });
});

describe("locateHeadings", () => {
  it("maps each heading to a chunk and an offset in the sent text", () => {
    const { text } = narrationFor(STORY);
    const parts = extractParts(STORY, PRON);
    const located = locateHeadings([text], parts.map((p) => p.spoken));
    expect(located.map((l) => l.chunkIndex)).toEqual([0, 0, 0]);
    expect(located.map((l) => text.slice(l.offset, l.offset + 8))).toEqual([
      "Part One",
      "Part Two",
      "Part Thr",
    ]);
    // offsets are in the SENT text, where "Mrs" became "Missus"
    expect(text.indexOf("Part Three")).toBe(located[2].offset);
  });

  it("finds a heading that was split across two chunks", () => {
    const { text } = narrationFor(STORY);
    const cut = text.indexOf("The Hedge.");
    const manual = [text.slice(0, cut).trim(), text.slice(cut).trim()];
    const located = locateHeadings(manual, extractParts(STORY, PRON).map((p) => p.spoken));
    expect(located[1]).toEqual({ chunkIndex: 0, offset: manual[0].indexOf("Part Two.") });
    expect(located[2].chunkIndex).toBe(1);
  });

  it("matches repeated heading titles to successive occurrences", () => {
    const md = "## Same\n\nA.\n\n## Same\n\nB.";
    const text = cleanForNarration(md);
    const [a, b] = locateHeadings([text], extractParts(md).map((p) => p.spoken));
    expect(b.offset).toBeGreaterThan(a.offset);
  });

  it("does not match heading text that is only part of a body line", () => {
    const md = "## Part One. Go\n\nHe said Part One. Go and left.";
    const text = cleanForNarration(md);
    const [a] = locateHeadings([text], extractParts(md).map((p) => p.spoken));
    expect(a.offset).toBe(0);
  });

  it("throws if a heading is missing from the text", () => {
    expect(() => locateHeadings(["nothing here"], ["Part One. A."])).toThrow(/Could not find/);
  });
});

describe("makeTimeLookup", () => {
  it("maps directly when the alignment characters equal the text", () => {
    const lookup = makeTimeLookup("abc def", fakeAlignment("abc def", 0.5));
    expect(lookup(4)).toBe(2);
  });

  it("handles astral characters that take two UTF-16 units", () => {
    const text = "a\u{1F600}b";
    const lookup = makeTimeLookup(text, fakeAlignment(text, 1));
    expect(lookup(3)).toBe(2); // "b" is entry 2, string offset 3
  });

  it("falls back to ignoring whitespace differences", () => {
    const sent = "One.\n\nTwo three.";
    const heard = fakeAlignment("One. Two three.", 1); // single space instead of blank line
    const lookup = makeTimeLookup(sent, heard);
    expect(lookup(sent.indexOf("Two"))).toBe(heard.character_start_times_seconds[5]);
  });

  it("throws rather than guess when characters differ", () => {
    expect(() => makeTimeLookup("Twelve", fakeAlignment("12"))).toThrow(/do not match/);
  });

  it("throws on a malformed alignment", () => {
    expect(() =>
      makeTimeLookup("ab", {
        characters: ["a", "b"],
        character_start_times_seconds: [0],
        character_end_times_seconds: [0, 1],
      })
    ).toThrow(/malformed/);
  });
});

describe("computePartStarts", () => {
  const parts = extractParts(STORY, PRON);
  const resultsFor = (chunks) =>
    chunks.map((c) => ({ alignment: fakeAlignment(c), normalizedAlignment: null }));

  it("computes part starts in one chunk from the aligned heading time", () => {
    const { text } = narrationFor(STORY);
    const out = computePartStarts({
      chunks: [text],
      results: resultsFor([text]),
      chunkDurations: [text.length * 0.1 + 0.3],
      parts,
    });
    expect(out.map((p) => p.title)).toEqual(parts.map((p) => p.title));
    expect(out[0].start).toBe(0);
    expect(out[1].start).toBeCloseTo(text.indexOf("Part Two") * 0.1, 2);
    expect(out[2].start).toBeCloseTo(text.indexOf("Part Three") * 0.1, 2);
  });

  it("adds the measured durations of earlier chunks to later parts", () => {
    const { text } = narrationFor(STORY);
    const packed = sentenceChunks(text, 120);
    expect(packed.length).toBe(2);
    const durations = [20.5, 11.25]; // real mp3 lengths, deliberately not char-count based
    const out = computePartStarts({
      chunks: packed,
      results: resultsFor(packed),
      chunkDurations: durations,
      parts,
      audioDuration: 32,
    });
    const expected = ["Part One.", "Part Two.", "Part Three."].map((h) => {
      const c = packed.findIndex((chunk) => chunk.includes(h));
      return (c === 0 ? 0 : durations[0]) + packed[c].indexOf(h) * 0.1;
    });
    out.forEach((p, i) => expect(p.start).toBeCloseTo(expected[i], 2));
    expect(out.some((p) => p.start >= durations[0])).toBe(true); // a part really lands in chunk 2
    expect(out.some((p) => p.start < durations[0])).toBe(true);
  });

  it("returns one part per heading, in document order, starts non-decreasing", () => {
    const { text } = narrationFor(STORY);
    const packed = sentenceChunks(text, 120);
    const out = computePartStarts({
      chunks: packed,
      results: resultsFor(packed),
      chunkDurations: [20, 12],
      parts,
    });
    expect(out.map((p) => p.title)).toEqual(parts.map((p) => p.title));
    expect(out).toHaveLength((STORY.match(/^## /gm) ?? []).length);
    for (let i = 1; i < out.length; i++) expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].start);
  });

  it("uses normalized_alignment when alignment is null", () => {
    const { text } = narrationFor(STORY);
    const out = computePartStarts({
      chunks: [text],
      results: [{ alignment: null, normalizedAlignment: fakeAlignment(text) }],
      chunkDurations: [60],
      parts,
    });
    expect(out[1].start).toBeCloseTo(text.indexOf("Part Two") * 0.1, 2);
  });

  it("throws if a start would fall after the end of the audio", () => {
    const { text } = narrationFor(STORY);
    expect(() =>
      computePartStarts({
        chunks: [text],
        results: resultsFor([text]),
        chunkDurations: [60],
        parts,
        audioDuration: 3,
      })
    ).toThrow(/after the audio ends/);
  });

  it("throws if aligned times run backwards", () => {
    const { text } = narrationFor(STORY);
    const bad = fakeAlignment(text);
    bad.character_start_times_seconds[text.indexOf("Part Three")] = 0.5;
    expect(() =>
      computePartStarts({
        chunks: [text],
        results: [{ alignment: bad, normalizedAlignment: null }],
        chunkDurations: [60],
        parts,
      })
    ).toThrow(/not in order/);
  });

  it("returns no parts for a story with no ## headings", () => {
    expect(computePartStarts({ chunks: ["x"], results: [], chunkDurations: [1], parts: [] })).toEqual([]);
  });
});

describe("updateFrontMatter", () => {
  const parts = [
    { title: 'Part One. A "quoted" start', start: 0 },
    { title: "Part Two. B", start: 12.34 },
  ];

  it("replaces audioDuration and inserts parts after it, keeping every other line", () => {
    const src = '---\ntitle: "T"\ntags: ["a", "b"]\naudioDuration: 100\ndraft: false\n---\n\nBody\n';
    const out = updateFrontMatter(src, { parts, audioDuration: 321 });
    expect(out).toBe(
      '---\ntitle: "T"\ntags: ["a", "b"]\naudioDuration: 321\n' +
        'parts:\n  - title: "Part One. A \\"quoted\\" start"\n    start: 0\n  - title: "Part Two. B"\n    start: 12.34\n' +
        "draft: false\n---\n\nBody\n"
    );
    expect(matter(out).data.parts).toEqual(parts);
  });

  it("appends audioDuration and parts at the end when neither exists", () => {
    const src = '---\ntitle: "T"\npublishDate: 2026-11-02\n---\nBody\n';
    const out = updateFrontMatter(src, { parts, audioDuration: 5 });
    expect(out.startsWith('---\ntitle: "T"\npublishDate: 2026-11-02\naudioDuration: 5\nparts:\n')).toBe(true);
    expect(out.endsWith("---\nBody\n")).toBe(true);
  });

  it("rewrites existing parts in place (re-narration) without duplicating", () => {
    const first = updateFrontMatter('---\ntitle: "T"\naudioDuration: 1\nicon: shell\n---\nB\n', {
      parts,
      audioDuration: 9,
    });
    const second = updateFrontMatter(first, { parts: [{ title: "Only", start: 1.5 }], audioDuration: 10 });
    expect(second.match(/^parts:/gm)).toHaveLength(1);
    expect(second.match(/^audioDuration:/gm)).toHaveLength(1);
    expect(matter(second).data).toMatchObject({
      icon: "shell",
      audioDuration: 10,
      parts: [{ title: "Only", start: 1.5 }],
    });
    expect(second.indexOf("icon: shell")).toBeGreaterThan(second.indexOf("parts:"));
  });

  it("removes stale parts when the story has none", () => {
    const first = updateFrontMatter('---\ntitle: "T"\n---\nB\n', { parts, audioDuration: 9 });
    const out = updateFrontMatter(first, { parts: [], audioDuration: 9 });
    expect(out).toBe('---\ntitle: "T"\naudioDuration: 9\n---\nB\n');
  });

  it("preserves CRLF line endings and a comment after parts", () => {
    const src = '---\r\ntitle: "T"\r\nparts: []\r\n# keep me\r\nicon: x\r\n---\r\nBody\r\n';
    const out = updateFrontMatter(src, { parts, audioDuration: 7 });
    expect(out).not.toMatch(/[^\r]\n/);
    expect(out).toContain("# keep me");
    expect(matter(out).data.icon).toBe("x");
  });

  it("throws when there is no front matter", () => {
    expect(() => updateFrontMatter("Just text", { parts, audioDuration: 1 })).toThrow(/no front matter/);
  });
});

// ---- callElevenLabs / narrateChunks with a mocked fetch --------------------

function mockFetch() {
  const calls = [];
  const fn = vi.fn(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    const n = calls.length;
    return {
      ok: true,
      headers: new Map([["request-id", `req-${n}`]]),
      json: async () => ({
        audio_base64: Buffer.from(`audio-${n}`).toString("base64"),
        alignment: fakeAlignment(body.text),
        normalized_alignment: fakeAlignment(body.text),
      }),
      text: async () => "",
    };
  });
  return { fn, calls };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "narrate-test-"));
}

describe("callElevenLabs", () => {
  const base = { voiceId: "voice1", modelId: "model1", apiKey: "test-key-not-real" };

  it("calls the with-timestamps endpoint and returns audio and alignment", async () => {
    const cacheDir = tmpDir();
    const { fn, calls } = mockFetch();
    const r = await callElevenLabs({ ...base, text: "Hello there.", cacheDir, fetchImpl: fn });
    expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice1/with-timestamps");
    expect(calls[0].body).toEqual({ text: "Hello there.", model_id: "model1" });
    expect(fs.readFileSync(r.mp3Path, "utf8")).toBe("audio-1");
    expect(r.alignment.characters.join("")).toBe("Hello there.");
    expect(r.requestId).toBe("req-1");
  });

  it("serves a repeat call from cache, alignment included", async () => {
    const cacheDir = tmpDir();
    const { fn } = mockFetch();
    await callElevenLabs({ ...base, text: "Hello.", cacheDir, fetchImpl: fn });
    const again = await callElevenLabs({ ...base, text: "Hello.", cacheDir, fetchImpl: fn });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(again.alignment.characters.join("")).toBe("Hello.");
    expect(again.requestId).toBe("req-1");
  });

  it("regenerates a legacy cache entry that has no alignment", async () => {
    const cacheDir = tmpDir();
    const { fn } = mockFetch();
    const first = await callElevenLabs({ ...base, text: "Old.", cacheDir, fetchImpl: fn });
    fs.unlinkSync(first.mp3Path.replace(/\.mp3$/, ".alignment.json")); // as left by the old script
    const again = await callElevenLabs({ ...base, text: "Old.", cacheDir, fetchImpl: fn });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(again.alignment).not.toBeNull();
  });

  it("regenerates when the cached alignment file is corrupt", async () => {
    const cacheDir = tmpDir();
    const { fn } = mockFetch();
    const first = await callElevenLabs({ ...base, text: "Bad.", cacheDir, fetchImpl: fn });
    fs.writeFileSync(first.mp3Path.replace(/\.mp3$/, ".alignment.json"), "{not json");
    await callElevenLabs({ ...base, text: "Bad.", cacheDir, fetchImpl: fn });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("fails clearly when the response has no alignment, and caches nothing", async () => {
    const cacheDir = tmpDir();
    const fn = async () => ({
      ok: true,
      headers: new Map(),
      json: async () => ({ audio_base64: "QQ==", alignment: null, normalized_alignment: null }),
    });
    await expect(callElevenLabs({ ...base, text: "x", cacheDir, fetchImpl: fn })).rejects.toThrow(
      /no alignment/
    );
    expect(fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : []).toEqual([]);
  });

  it("surfaces HTTP errors", async () => {
    const fn = async () => ({ ok: false, status: 422, headers: new Map(), text: async () => "bad" });
    await expect(
      callElevenLabs({ ...base, text: "x", cacheDir: tmpDir(), fetchImpl: fn })
    ).rejects.toThrow(/422/);
  });
});

describe("narrateChunks to part starts (mocked end to end)", () => {
  it("chains request ids and yields ordered parts across chunks", async () => {
    const { text } = narrationFor(STORY);
    const packed = sentenceChunks(text, 120);
    const { fn, calls } = mockFetch();
    const results = await narrateChunks({
      chunks: packed,
      voiceId: "v",
      modelId: "m",
      apiKey: "test-key-not-real",
      cacheDir: tmpDir(),
      fetchImpl: fn,
    });
    expect(calls[0].body.previous_request_ids).toBeUndefined();
    expect(calls[1].body.previous_request_ids).toEqual(["req-1"]);
    const parts = extractParts(STORY, PRON);
    const out = computePartStarts({
      chunks: packed,
      results,
      chunkDurations: [20, 12],
      parts,
      audioDuration: 32,
    });
    expect(out.map((p) => p.title)).toEqual(parts.map((p) => p.title));
    expect(out[0].start).toBe(0);
    expect(text).toContain("Missus Tibbs");
  });
});

describe("alignmentSidecarPath", () => {
  it("sits next to the audio with the same base name", () => {
    expect(alignmentSidecarPath("stories/x.mp3")).toBe("stories/x.alignment.json");
    expect(alignmentSidecarPath("out/y")).toBe("out/y.alignment.json");
  });
});
