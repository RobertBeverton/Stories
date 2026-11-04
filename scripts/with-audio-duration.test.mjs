import { describe, expect, it } from "vitest";
import { withAudioDuration } from "./validate-content.mjs";

describe("withAudioDuration", () => {
  it("replaces an existing field in the front matter", () => {
    expect(withAudioDuration("---\ntitle: A\naudioDuration: 100\n---\nBody\n", 312))
      .toBe("---\ntitle: A\naudioDuration: 312\n---\nBody\n");
  });

  it("adds the field before the closing marker when there is none", () => {
    expect(withAudioDuration("---\ntitle: A\n---\nBody\n", 312)).toBe("---\ntitle: A\naudioDuration: 312\n---\nBody\n");
  });

  it("keeps CRLF line endings, and still finds the field", () => {
    expect(withAudioDuration("---\r\ntitle: A\r\n---\r\nBody\r\n", 312)).toBe("---\r\ntitle: A\r\naudioDuration: 312\r\n---\r\nBody\r\n");
    expect(withAudioDuration("---\r\ntitle: A\r\naudioDuration: 5\r\n---\r\nBody\r\n", 312))
      .toBe("---\r\ntitle: A\r\naudioDuration: 312\r\n---\r\nBody\r\n");
  });

  it("replaces a fractional value whole, instead of leaving its fraction behind", () => {
    expect(withAudioDuration("---\naudioDuration: 312.5\n---\n", 313)).toBe("---\naudioDuration: 313\n---\n");
  });

  it("never touches the story body", () => {
    const body = "He said audioDuration: 999 out loud.\n";
    expect(withAudioDuration(`---\ntitle: A\n---\n${body}`, 7)).toBe(`---\ntitle: A\naudioDuration: 7\n---\n${body}`);
  });

  it("makes a front matter block for a file without one", () => {
    expect(withAudioDuration("Just text\n", 7)).toBe("---\naudioDuration: 7\n---\nJust text\n");
  });
});
