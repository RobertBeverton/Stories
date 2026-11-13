import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setFrontMatterField } from "./front-matter.mjs";
import {
  CACHE_CONTROL, createClient, objectKey, parseArgs, planWorld, run, updatedStoryText, versionedUrl,
} from "./upload-audio.mjs";

const sent = [];
let headResult = {};
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(config) { this.config = config; sent.push(this); }
    async send(command) {
      sent.push(command);
      if (command.type === "head" && headResult instanceof Error) throw headResult;
      return command.type === "head" ? headResult : {};
    }
  },
  HeadObjectCommand: class { constructor(input) { this.type = "head"; this.input = input; } },
  PutObjectCommand: class { constructor(input) { this.type = "put"; this.input = input; } },
}));

const ORIGIN = "https://audio.kinly.download";
const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");

describe("parseArgs", () => {
  it("defaults to a dry run over every world", () => {
    expect(parseArgs([])).toEqual({ apply: false, world: null, story: null });
  });
  it("reads --apply, --world and --story", () => {
    expect(parseArgs(["--apply", "--world", "legend-lane", "--story", "fire"]))
      .toEqual({ apply: true, world: "legend-lane", story: "fire" });
  });
  it("rejects unknown flags and missing values", () => {
    expect(() => parseArgs(["--force"])).toThrow(/Unknown argument/);
    expect(() => parseArgs(["--world"])).toThrow(/needs a value/);
  });
});

describe("object keys and URLs (docs/audio-hosting.md)", () => {
  it("mirrors the story path under the world's stories folder", () => {
    expect(objectKey("isles-of-yum", path.join("w", "stories"), path.join("w", "stories", "marzipans-well.md")))
      .toBe("isles-of-yum/marzipans-well.mp3");
    expect(objectKey("bramble-wall", path.join("w", "stories"), path.join("w", "stories", "bramble-wall", "book-1.md")))
      .toBe("bramble-wall/bramble-wall/book-1.mp3");
  });

  it("versions the URL with the first 8 hex of the SHA-256 and encodes each segment, not the slashes", () => {
    const hash = sha("x");
    expect(versionedUrl("w/a b/c.mp3", hash, ORIGIN)).toBe(`${ORIGIN}/w/a%20b/c.mp3?v=${hash.slice(0, 8)}`);
  });
});

describe("setFrontMatterField", () => {
  it("replaces in place, adds when missing, keeps CRLF, never touches the body", () => {
    expect(setFrontMatterField("---\na: 1\n---\nbody a: 1\n", "a", 2)).toBe("---\na: 2\n---\nbody a: 1\n");
    expect(setFrontMatterField("---\na: 1\n---\nb\n", "b", "x")).toBe("---\na: 1\nb: x\n---\nb\n");
    expect(setFrontMatterField("---\r\na: 1\r\n---\r\nb\r\n", "a", 2)).toBe("---\r\na: 2\r\n---\r\nb\r\n");
  });
  it("does not treat a value containing $ patterns as a replacement pattern", () => {
    expect(setFrontMatterField("---\na: 1\n---\n", "a", "$&-$1")).toBe("---\na: $&-$1\n---\n");
  });
  it("refuses a key that is not a plain name", () => {
    expect(() => setFrontMatterField("---\n---\n", "a.*", 1)).toThrow(/plain name/);
  });
});

describe("with a world checkout on disk", () => {
  let root;
  let source;
  const fileOf = (rel) => path.join(root, "stories", rel);
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(fileOf(rel)), { recursive: true });
    fs.writeFileSync(fileOf(rel), text);
  };
  const story = (extra = "") => `---\ntitle: T\ndescription: d\npublishDate: 2026-01-01\n${extra}---\nBody\n`;
  const out = () => ({ log: vi.fn(), error: vi.fn() });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "upload-audio-"));
    source = { name: "w", localPath: root, storiesPath: "stories" };
    write("one.md", story());
    write("one.mp3", "AUDIO-ONE");
    write("sub/two.md", story());
    write("sub/two.mp3", "AUDIO-TWO");
    write("silent.md", story());
    write("off.md", story("audio: false\n"));
    write("off.mp3", "x");
    write("wip.md", story("draft: true\n"));
    write("wip.mp3", "x");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const readDuration = async () => 61.6;

  it("plans narrated stories only, and says why the others are skipped", async () => {
    const { items, skipped } = await planWorld(source, { readDuration, origin: ORIGIN });
    expect(items.map((i) => i.key)).toEqual(["w/one.mp3", "w/sub/two.mp3"]);
    expect(items[0]).toMatchObject({ durationSec: 62, url: versionedUrl("w/one.mp3", sha("AUDIO-ONE"), ORIGIN) });
    expect(Object.fromEntries(skipped.map((s) => [s.rel, s.reason]))).toEqual({
      "silent.md": "no mp3", "off.md": "audio: false", "wip.md": "draft",
    });
  });

  it("--story narrows the plan by path", async () => {
    const { items } = await planWorld(source, { readDuration, origin: ORIGIN, only: "sub/" });
    expect(items.map((i) => i.key)).toEqual(["w/sub/two.mp3"]);
  });

  it("prefers audio from the narrator's output folder over an mp3 beside the story", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "narr-out-"));
    fs.mkdirSync(path.join(outDir, "w"), { recursive: true });
    fs.writeFileSync(path.join(outDir, "w", "one.mp3"), "NARRATED");
    try {
      const { items } = await planWorld(source, { readDuration, origin: ORIGIN, outDir });
      const one = items.find((i) => i.key === "w/one.mp3");
      expect(one.audioPath).toBe(path.join(outDir, "w", "one.mp3"));
      expect(one.sha256).toBe(sha("NARRATED"));
      const two = items.find((i) => i.key === "w/sub/two.mp3");
      expect(two.audioPath).toBe(fileOf("sub/two.mp3")); // no narrated copy: the one beside the story
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("a dry run changes nothing and needs no credentials", async () => {
    const io = out();
    const client = { isUploaded: vi.fn(), upload: vi.fn() };
    expect(await run([], { ...io, sources: [source], client })).toBe(0);
    expect(client.upload).not.toHaveBeenCalled();
    expect(fs.readFileSync(fileOf("one.md"), "utf8")).toBe(story());
    expect(io.log).toHaveBeenCalledWith(expect.stringContaining("Dry run: 2 file(s)"));
  });

  it("--apply also writes the file size as audioBytes", async () => {
    const client = { isUploaded: vi.fn(async () => false), upload: vi.fn(async () => {}) };
    await run(["--apply", "--story", "one"], { ...out(), sources: [source], client });
    const written = fs.readFileSync(fileOf("one.md"), "utf8");
    expect(written).toContain(`audioBytes: ${fs.statSync(fileOf("one.mp3")).size}`);
  });

  it("--apply uploads, then writes audioUrl, audioDuration and audioBytes into the front matter", async () => {
    const client = { isUploaded: vi.fn(async () => false), upload: vi.fn(async () => {}) };
    expect(await run(["--apply"], { ...out(), sources: [source], client })).toBe(0);
    expect(client.upload).toHaveBeenCalledTimes(2);
    expect(client.upload).toHaveBeenCalledWith("w/one.mp3", fileOf("one.mp3"), sha("AUDIO-ONE"));
    const written = fs.readFileSync(fileOf("one.md"), "utf8");
    expect(written).toContain(`audioUrl: https://audio.kinly.download/w/one.mp3?v=${sha("AUDIO-ONE").slice(0, 8)}`);
    expect(written).toMatch(/audioDuration: \d+/);
    expect(written).toContain(`audioBytes: ${fs.statSync(fileOf("one.mp3")).size}`);
    expect(written.endsWith("---\nBody\n")).toBe(true);
    expect(fs.readFileSync(fileOf("silent.md"), "utf8")).toBe(story());
  });

  it("skips the upload for a file already in the bucket, and a second run changes nothing", async () => {
    const client = { isUploaded: vi.fn(async () => true), upload: vi.fn() };
    await run(["--apply", "--story", "one"], { ...out(), sources: [source], client });
    expect(client.upload).not.toHaveBeenCalled();
    const first = fs.readFileSync(fileOf("one.md"), "utf8");
    await run(["--apply", "--story", "one"], { ...out(), sources: [source], client });
    expect(fs.readFileSync(fileOf("one.md"), "utf8")).toBe(first);
  });

  it("reports a failed upload, leaves that story's front matter alone, and exits 1", async () => {
    const io = out();
    const client = { isUploaded: vi.fn(async () => false), upload: vi.fn(async () => { throw new Error("denied"); }) };
    expect(await run(["--apply", "--story", "one"], { ...io, sources: [source], client })).toBe(1);
    expect(io.error).toHaveBeenCalledWith(expect.stringContaining("w/one.mp3: denied"));
    expect(fs.readFileSync(fileOf("one.md"), "utf8")).toBe(story());
  });

  it("skips a world with no checkout, and rejects an unknown --world", async () => {
    const io = out();
    expect(await run([], { ...io, sources: [{ ...source, localPath: path.join(root, "nope") }] })).toBe(0);
    expect(io.log).toHaveBeenCalledWith(expect.stringContaining("no local checkout"));
    expect(await run(["--world", "zzz"], { ...out(), sources: [source] })).toBe(1);
  });

  it("updatedStoryText is null when the front matter is already right", async () => {
    const { items } = await planWorld(source, { readDuration, origin: ORIGIN });
    const once = updatedStoryText(story(), items[0]);
    expect(once).not.toBeNull();
    expect(updatedStoryText(once, items[0])).toBeNull();
  });
});

describe("createClient", () => {
  it("names every missing credential and never reads a file", async () => {
    await expect(createClient({})).rejects.toThrow(/R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET/);
  });

  it("uploads audio/mpeg with the immutable cache header and the SHA-256 as metadata", async () => {
    const env = { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: "stories-audio" };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "put-"));
    const file = path.join(dir, "a.mp3");
    fs.writeFileSync(file, "AUDIO");
    sent.length = 0;
    const client = await createClient(env);
    await client.upload("w/a.mp3", file, "abc");
    fs.rmSync(dir, { recursive: true });
    expect(sent[0].config.endpoint).toBe("https://acct.r2.cloudflarestorage.com");
    expect(sent[1]).toMatchObject({
      type: "put",
      input: { Bucket: "stories-audio", Key: "w/a.mp3", ContentType: "audio/mpeg", CacheControl: CACHE_CONTROL, Metadata: { sha256: "abc" } },
    });
    expect(CACHE_CONTROL).toBe("public, max-age=31536000, immutable");
  });

  it("treats a missing object as not uploaded, and a different hash as not uploaded", async () => {
    const env = { R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: "b" };
    const client = await createClient(env);
    headResult = { Metadata: { sha256: "same" } };
    expect(await client.isUploaded("k", "same")).toBe(true);
    expect(await client.isUploaded("k", "other")).toBe(false);
    headResult = Object.assign(new Error("nf"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
    expect(await client.isUploaded("k", "same")).toBe(false);
    headResult = Object.assign(new Error("boom"), { $metadata: { httpStatusCode: 500 } });
    await expect(client.isUploaded("k", "same")).rejects.toThrow("boom");
  });
});
