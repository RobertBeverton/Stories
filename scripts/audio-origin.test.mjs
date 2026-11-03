import { describe, expect, it } from "vitest";
import { audioOrigin, DEFAULT_AUDIO_ORIGIN, isAudioUrl } from "./audio-origin.mjs";

describe("audioOrigin", () => {
  it("defaults to the R2 custom domain", () => {
    expect(audioOrigin({})).toBe(DEFAULT_AUDIO_ORIGIN);
    expect(DEFAULT_AUDIO_ORIGIN).toBe("https://audio.kinly.download");
  });

  it("takes AUDIO_BASE_URL, reduced to its origin", () => {
    expect(audioOrigin({ AUDIO_BASE_URL: "https://media.example.org/some/path/" })).toBe("https://media.example.org");
  });

  it("refuses a value that is not an absolute https URL", () => {
    expect(() => audioOrigin({ AUDIO_BASE_URL: "http://media.example.org" })).toThrow(/AUDIO_BASE_URL/);
    expect(() => audioOrigin({ AUDIO_BASE_URL: "media.example.org" })).toThrow(/AUDIO_BASE_URL/);
  });
});

describe("isAudioUrl", () => {
  it("accepts an https URL on the origin, with or without a query", () => {
    expect(isAudioUrl("https://audio.kinly.download/w/a.mp3?v=1")).toBe(true);
    expect(isAudioUrl("https://audio.kinly.download/w/a.mp3", "https://audio.kinly.download")).toBe(true);
  });

  it("rejects other schemes, origins, ports, bare origins and non-strings", () => {
    for (const v of [
      "http://audio.kinly.download/a.mp3",
      "https://audio.kinly.download:8443/a.mp3",
      "https://other.example/a.mp3",
      "https://audio.kinly.download",
      "a.mp3",
      "",
      null,
      undefined,
    ]) {
      expect(isAudioUrl(v)).toBe(false);
    }
  });
});
