import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseFile } from "music-metadata";

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
      // Existing field: replace in place. No field yet (e.g. audio was just
      // added, or defaulted from the story's own filename with no front
      // matter at all): insert one just before the closing `---` of the
      // frontmatter block, since a bare .replace() on a non-matching regex
      // silently no-ops and leaves audioDuration missing.
      const updated = /audioDuration:\s*\d+/.test(raw)
        ? raw.replace(/audioDuration:\s*\d+/, `audioDuration: ${seconds}`)
        : raw.replace(/^(---\n[\s\S]*?)\n---\n/, `$1\naudioDuration: ${seconds}\n---\n`);
      fs.writeFileSync(story.file, updated);
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
