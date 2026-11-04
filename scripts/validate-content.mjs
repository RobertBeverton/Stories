import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseFile } from "music-metadata";
import { isValidIcon, ICON_NAMES } from "./icons.mjs";
import { isAudioUrl } from "./audio-origin.mjs";

export function checkRequiredFields(stories) {
  const required = ["title", "description", "publishDate"];
  const errors = [];
  for (const story of stories) {
    for (const field of required) {
      if (!story.data[field]) {
        errors.push(`${story.file}: missing required field '${field}'`);
      }
    }
  }
  return errors;
}

export function checkDuplicateSlugs(stories) {
  const seen = new Map();
  for (const story of stories) {
    if (!seen.has(story.slug)) seen.set(story.slug, []);
    seen.get(story.slug).push(story.file);
  }
  const errors = [];
  for (const [slug, files] of seen) {
    if (files.length > 1) {
      errors.push(`Duplicate slug '${slug}': ${files.join(", ")}`);
    }
  }
  return errors;
}

export function slugify(filePath) {
  const relative = path.relative("stories", filePath).replace(/\.md$/, "");
  return relative.split(path.sep).join("/");
}

export async function loadStories(globPattern = "stories/**/*.md") {
  const files = await fg(globPattern);
  return files.map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    const { data } = matter(raw);
    return { file, data, slug: slugify(file) };
  });
}

// Audio filename defaults to the story's own basename (see stories-lib.mjs)
// so most stories carry no `audio` front matter at all; `audio: false` opts
// out explicitly (no narration yet — not a warning-worthy state).
function resolveAudioFile(story) {
  if (story.data.audio === false) return null;
  if (story.data.audio) return story.data.audio;
  return `${path.basename(story.file, ".md")}.mp3`;
}

export function checkAudioFilesExistOrWarn(stories, exists) {
  const warnings = [];
  for (const story of stories) {
    const audioFile = resolveAudioFile(story);
    if (!audioFile) continue;
    if (isAudioUrl(story.data.audioUrl)) continue; // narration is hosted, no local file expected
    const audioPath = path.join(path.dirname(story.file), audioFile);
    if (!exists(audioPath)) {
      const explicit = Boolean(story.data.audio);
      const note = explicit
        ? `audio file '${audioFile}' not found`
        : `no audio file found at default location '${audioFile}' (not narrated yet, or filename doesn't match story slug)`;
      warnings.push(`${story.file}: ${note} (warning only, build not blocked)`);
    }
  }
  return warnings;
}

export function checkValidIcons(stories) {
  const errors = [];
  for (const story of stories) {
    if (story.data.icon !== undefined && !isValidIcon(story.data.icon)) {
      errors.push(
        `${story.file}: invalid icon '${story.data.icon}' (must be one of: ${ICON_NAMES.join(", ")})`
      );
    }
  }
  return errors;
}

export function checkRepoSize(fileSizes, maxTotalBytes, maxFileBytes) {
  const errors = [];
  const total = fileSizes.reduce((a, b) => a + b, 0);
  if (total > maxTotalBytes) {
    errors.push(
      `Total /stories size ${(total / 1024 / 1024).toFixed(1)}MB exceeds guard threshold ${maxTotalBytes / 1024 / 1024}MB`
    );
  }
  const tooBig = fileSizes.find((s) => s > maxFileBytes);
  if (tooBig) {
    errors.push(`A file in /stories exceeds ${maxFileBytes / 1024 / 1024}MB (${(tooBig / 1024 / 1024).toFixed(1)}MB)`);
  }
  return errors;
}

/**
 * Returns `raw` with the front matter's `audioDuration: <seconds>` set: replaced in
 * place when the front matter has one, else added before the closing `---`. Only the
 * front matter is touched (the story body may say anything), CRLF files keep their
 * line endings, and a file with no front matter gets a new block.
 */
export function withAudioDuration(raw, seconds) {
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const block = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(raw);
  if (!block) return `---${eol}audioDuration: ${seconds}${eol}---${eol}${raw}`;
  const line = /^audioDuration:[^\r\n]*$/m;
  const front = line.test(block[1])
    ? block[1].replace(line, `audioDuration: ${seconds}`)
    : `${block[1]}${eol}audioDuration: ${seconds}`;
  return `---${eol}${front}${eol}---${block[2]}${raw.slice(block[0].length)}`;
}

async function deriveAudioDurations(stories) {
  const errors = [];
  for (const story of stories) {
    const audioFile = resolveAudioFile(story);
    if (!audioFile) continue;
    const audioPath = path.join(path.dirname(story.file), audioFile);
    if (!fs.existsSync(audioPath)) continue;
    let metadata;
    try {
      metadata = await parseFile(audioPath);
    } catch (err) {
      errors.push(
        `${story.file}: failed to read audio duration from '${audioFile}' (${err.message})`
      );
      continue;
    }
    const seconds = Math.round(metadata.format.duration ?? 0);
    if (story.data.audioDuration !== seconds) {
      const raw = fs.readFileSync(story.file, "utf8");
      fs.writeFileSync(story.file, withAudioDuration(raw, seconds));
      console.log(`${story.file}: audioDuration updated to ${seconds}`);
    }
  }
  return errors;
}

async function main() {
  const stories = await loadStories();
  const audioDurationErrors = await deriveAudioDurations(stories);
  const refreshed = await loadStories();

  const fileSizes = refreshed
    .map((s) => resolveAudioFile(s) && path.join(path.dirname(s.file), resolveAudioFile(s)))
    .filter(Boolean)
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.statSync(p).size);

  const audioWarnings = checkAudioFilesExistOrWarn(refreshed, (p) => fs.existsSync(p));

  const errors = [
    ...audioDurationErrors,
    ...checkRequiredFields(refreshed),
    ...checkDuplicateSlugs(refreshed),
    ...checkValidIcons(refreshed),
    ...checkRepoSize(fileSizes, 700 * 1024 * 1024, 90 * 1024 * 1024),
  ];

  if (audioWarnings.length > 0) {
    console.warn("Content validation warnings:\n" + audioWarnings.map((w) => `  - ${w}`).join("\n"));
  }

  if (errors.length > 0) {
    console.error("Content validation failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`Content validation passed (${refreshed.length} stories checked).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
