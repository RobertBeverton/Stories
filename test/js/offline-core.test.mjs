import { describe, expect, it } from "vitest";
import {
  AUDIO_CACHE, SHELL_PREFIX, formatBytes, needsSave, parseRange, rangeResponse, spaceCheck, spaceMessage, storyBytes, totalBytes,
} from "../../site/assets/js/offline-core.mjs";

describe("storyBytes and totalBytes", () => {
  it("uses audioBytes when present", () => {
    expect(storyBytes({ audioBytes: 5_000_000, durationSec: 600 })).toEqual({ bytes: 5_000_000, exact: true });
  });
  it("estimates from the duration at 16 KB per second", () => {
    expect(storyBytes({ durationSec: 600 })).toEqual({ bytes: 9_600_000, exact: false });
  });
  it("is 0 and inexact with neither", () => {
    expect(storyBytes({})).toEqual({ bytes: 0, exact: false });
  });
  it("totals, and is exact only when every story is", () => {
    expect(totalBytes([{ audioBytes: 10 }, { audioBytes: 5 }])).toEqual({ bytes: 15, exact: true });
    expect(totalBytes([{ audioBytes: 10 }, { durationSec: 1 }])).toEqual({ bytes: 16_010, exact: false });
    expect(totalBytes([])).toEqual({ bytes: 0, exact: true });
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"], [480_000, "480 KB"], [4_200_000, "4.2 MB"], [28_400_000, "28 MB"], [1_500_000_000, "1.5 GB"],
  ])("formats %i as %s", (n, text) => expect(formatBytes(n)).toBe(text));
  it("marks an estimate with ~", () => expect(formatBytes(28_400_000, false)).toBe("~28 MB"));
});

describe("spaceCheck", () => {
  it("fits when need plus a 10% margin is within free space", () => {
    expect(spaceCheck({ needBytes: 1e9, quota: 2e9, usage: 5e8 })).toMatchObject({ fits: true, freeBytes: 1.5e9 });
  });
  it("does not fit, and says by how much", () => {
    const r = spaceCheck({ needBytes: 1.4e9, quota: 2.3e9, usage: 1.4e9 });
    expect(r.fits).toBe(false);
    expect(r.freeBytes).toBe(9e8);
    expect(spaceMessage(r)).toBe("Needs 1.4 GB, 900 MB free");
  });
  it("fits when the browser cannot say", () => {
    expect(spaceCheck({ needBytes: 1e9, quota: undefined, usage: undefined })).toMatchObject({ fits: true, freeBytes: null });
  });
  it("never reports negative free space", () => {
    expect(spaceCheck({ needBytes: 1, quota: 5, usage: 9 }).freeBytes).toBe(0);
  });
});

describe("needsSave", () => {
  it("is true for nothing saved and for a different saved url, false for the same", () => {
    const story = { audioUrl: "https://a/x.mp3?v=2" };
    expect(needsSave(story, undefined)).toBe(true);
    expect(needsSave(story, { url: "https://a/x.mp3?v=1" })).toBe(true);
    expect(needsSave(story, { url: "https://a/x.mp3?v=2" })).toBe(false);
  });
});

describe("parseRange", () => {
  it.each([
    ["bytes=0-9", 100, { start: 0, end: 9 }],
    ["bytes=90-", 100, { start: 90, end: 99 }],
    ["bytes=90-500", 100, { start: 90, end: 99 }],
    ["bytes=-10", 100, { start: 90, end: 99 }],
    ["bytes=100-", 100, "unsatisfiable"],
    ["bytes=-0", 100, "unsatisfiable"],
    ["bytes=9-2", 100, "unsatisfiable"],
    ["", 100, null],
    ["items=0-9", 100, null],
    ["bytes=0-9,20-30", 100, null],
  ])("%s of %i", (header, size, expected) => expect(parseRange(header, size)).toEqual(expected));
});

describe("rangeResponse", () => {
  const file = () => new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { headers: { "Content-Type": "audio/mpeg" } });

  it("serves the whole file with Accept-Ranges when no Range is asked", async () => {
    const r = await rangeResponse(file(), null);
    expect(r.status).toBe(200);
    expect(r.headers.get("Accept-Ranges")).toBe("bytes");
    expect((await r.arrayBuffer()).byteLength).toBe(10);
  });
  it("serves a 206 slice with Content-Range", async () => {
    const r = await rangeResponse(file(), "bytes=2-5");
    expect(r.status).toBe(206);
    expect(r.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([2, 3, 4, 5]);
  });
  it("answers 416 past the end", async () => {
    const r = await rangeResponse(file(), "bytes=50-");
    expect(r.status).toBe(416);
    expect(r.headers.get("Content-Range")).toBe("bytes */10");
  });
});

it("names the caches", () => {
  expect(AUDIO_CACHE).toBe("audio-v1");
  expect(SHELL_PREFIX).toBe("shell-");
});
