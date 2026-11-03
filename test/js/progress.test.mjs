// @vitest-environment jsdom
// Behaviour spec for WP-A. Each todo is a requirement from the design doc;
// WP-A turns them into real tests (using test/fixtures/progress-*.json) and
// implements site/assets/js/progress.mjs. They are todos, not failing tests,
// so the scaffold suite stays green.
import { describe, it } from "vitest";

describe("progress store (WP-A)", () => {
  it.todo("reads v1 records, ignoring url/title/artworkUrl, and normalises to v2");
  it.todo("rewrites a v1 record as v2 on next write, dropping url/title/artworkUrl");
  it.todo("readAll skips corrupt JSON and records failing the v2 check");
  it.todo("write merges partial updates and stamps savedAt");
  it.todo("markCompleted sets completedAt and resets audioTime");
  it.todo("replay: completedAt survives; counts as in progress again only after 10s of playback");
  it.todo("toViewModel returns new / in-progress / finished and a 0..1 fraction");
  it.todo("never throws when localStorage is unavailable");
  it.todo("escape.mjs neutralises <, >, &, quotes (fixture title with <img onerror>)");
});
