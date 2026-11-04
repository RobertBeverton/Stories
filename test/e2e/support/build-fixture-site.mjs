// Builds a small throwaway copy of the real site from INVENTED fixture stories,
// so the smoke test needs no world repos and commits no story text or audio.
// It copies site/ and scripts/ into a temp project, links node_modules, writes a
// one-world content-sources.json and three stories (two in a series with audio,
// one without), and runs the real generate-icon-art and Eleventy steps there.
// The audio files do not exist: the tests answer the audio origin themselves.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIO_ORIGIN } from "../../../scripts/audio-origin.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const FIXTURE_STORIES = [
  { file: "e2e-series/tale-one.md", title: "Tale One of the Smoke Test", series: "E2E Series", order: 1, audio: true, date: "2026-10-01" },
  // Tale Two has parts (headings in the body, `parts` in front matter) so the e2e can check the part list.
  { file: "e2e-series/tale-two.md", title: "Tale Two of the Smoke Test", series: "E2E Series", order: 2, audio: true, date: "2026-10-02", parts: [{ title: "Part One. Arrival", start: 0 }, { title: "Part Two. Departure", start: 10 }] },
  { file: "quiet-tale.md", title: "A Quiet Tale Without Audio", series: null, order: null, audio: false, date: "2026-09-01" },
  // A long series, for the Library's grouping and paging (library.e2e.mjs). No audio.
  ...Array.from({ length: 12 }, (_, i) => ({
    file: `saga/saga-${i + 1}.md`, title: `Saga Tale ${i + 1} of the Library Test`, series: "E2E Saga", order: i + 1, audio: false, date: `2026-08-${String(i + 1).padStart(2, "0")}`,
  })),
];

// One invented lore entry, linked from Tale One (by its `stories` list), so the e2e can check the lore chips.
export const FIXTURE_LORE = {
  slug: "old-mariner",
  title: "The Old Mariner",
  tradition: "Smoke Test Folk Tales",
  summary: "An invented sailor who appears only in test fixtures.",
  stories: ["e2e-series/tale-one"],
};

export const slugOf = (file) => file.replace(/\.md$/, "");
export const audioUrlOf = (file) => `${AUDIO_ORIGIN}/e2e-world/${slugOf(file)}.mp3?v=e2e`;

function storyMarkdown(story) {
  const lines = ["---", `title: "${story.title}"`, 'description: "Invented placeholder text for the smoke test."', "tags: [placeholder]"];
  if (story.series) lines.push(`series: "${story.series}"`, `seriesOrder: ${story.order}`);
  lines.push(`publishDate: ${story.date}`, "draft: false");
  if (story.audio) lines.push(`audioUrl: ${audioUrlOf(story.file)}`, "audioDuration: 20");
  else lines.push("audio: false");
  if (story.parts) {
    lines.push("parts:");
    for (const part of story.parts) lines.push(`  - title: "${part.title}"`, `    start: ${part.start}`);
  }
  lines.push("---", "");
  // A long body, so a page is tall enough to scroll (the scroll-restore test needs it).
  const paragraphs = Array.from({ length: 60 }, (_, i) => `Once upon a smoke test (${i + 1}), nothing happened, and everyone was glad.`);
  if (story.parts) {
    for (const part of story.parts) lines.push(`## ${part.title}`, "", ...paragraphs.slice(0, 30).flatMap((p) => [p, ""]));
  } else {
    lines.push(...paragraphs.flatMap((p) => [p, ""]));
  }
  return lines.join("\n");
}

/** @returns {string} the absolute path of the built `_site` folder */
export function buildFixtureSite({ log = () => {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stories-e2e-"));
  for (const dir of ["site", "scripts"]) fs.cpSync(path.join(repo, dir), path.join(root, dir), { recursive: true });
  for (const file of ["eleventy.config.js", "package.json"]) fs.copyFileSync(path.join(repo, file), path.join(root, file));
  fs.symlinkSync(path.join(repo, "node_modules"), path.join(root, "node_modules"), "junction");

  fs.writeFileSync(
    path.join(root, "content-sources.json"),
    JSON.stringify([{ name: "e2e-world", title: "E2E World", tagline: "Invented for the smoke test", accent: "sage", icon: "boat", repo: "https://example.invalid/e2e.git" }]),
  );
  const manifest = {};
  for (const story of FIXTURE_STORIES) {
    const target = path.join(root, "stories", story.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, storyMarkdown(story));
    manifest[story.file] = "e2e-world";
  }
  fs.writeFileSync(path.join(root, "stories", ".worlds.json"), JSON.stringify(manifest));
  const loreDir = path.join(root, "lore", "e2e-world");
  fs.mkdirSync(loreDir, { recursive: true });
  fs.writeFileSync(
    path.join(loreDir, `${FIXTURE_LORE.slug}.md`),
    `---
title: "${FIXTURE_LORE.title}"
tradition: "${FIXTURE_LORE.tradition}"
summary: "${FIXTURE_LORE.summary}"
stories:
  - ${FIXTURE_LORE.stories[0]}
---

Invented placeholder lore for the smoke test.
`,
  );

  const run = (args) => execFileSync(process.execPath, args, { cwd: root, stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, STORIES_ROUTER: "" } });
  log("generating icons");
  run(["scripts/generate-icon-art.mjs"]);
  log("building the fixture site");
  run([path.join("node_modules", "@11ty", "eleventy", "cmd.cjs")]);
  return path.join(root, "_site");
}

export function removeFixtureSite(siteDir) {
  fs.rmSync(path.dirname(siteDir), { recursive: true, force: true });
}
