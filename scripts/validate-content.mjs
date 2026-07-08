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

export function checkDuplicateSeriesOrder(stories) {
  const seen = new Map();
  for (const story of stories) {
    if (!story.data.series) continue;
    const key = `${story.data.series}::${story.data.seriesOrder}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(story.file);
  }
  const errors = [];
  for (const [key, files] of seen) {
    if (files.length > 1) {
      const [series, order] = key.split("::");
      errors.push(`Series '${series}' has duplicate seriesOrder ${order}: ${files.join(", ")}`);
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

export function checkAudioFilesExist(stories, exists) {
  const errors = [];
  for (const story of stories) {
    if (!story.data.audio) continue;
    if (story.data.draft) continue;
    const audioPath = path.join(path.dirname(story.file), story.data.audio);
    if (!exists(audioPath)) {
      errors.push(`${story.file}: audio file '${story.data.audio}' not found`);
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

async function deriveAudioDurations(stories) {
  const errors = [];
  for (const story of stories) {
    if (!story.data.audio) continue;
    const audioPath = path.join(path.dirname(story.file), story.data.audio);
    if (!fs.existsSync(audioPath)) continue;
    let metadata;
    try {
      metadata = await parseFile(audioPath);
    } catch (err) {
      errors.push(
        `${story.file}: failed to read audio duration from '${story.data.audio}' (${err.message})`
      );
      continue;
    }
    const seconds = Math.round(metadata.format.duration ?? 0);
    if (story.data.audioDuration !== seconds) {
      const raw = fs.readFileSync(story.file, "utf8");
      const updated = raw.replace(
        /audioDuration:\s*\d+/,
        `audioDuration: ${seconds}`
      );
      fs.writeFileSync(story.file, updated);
      console.log(`${story.file}: audioDuration updated to ${seconds}`);
    }
  }
  return errors;
}

async function main() {
  const stories = await loadStories();
  const audioDurationErrors = await deriveAudioDurations(stories);
  const refreshed = await loadStories(); // reload in case durations changed

  const fileSizes = refreshed
    .filter((s) => s.data.audio)
    .map((s) => {
      const p = path.join(path.dirname(s.file), s.data.audio);
      return fs.existsSync(p) ? fs.statSync(p).size : 0;
    });

  const errors = [
    ...audioDurationErrors,
    ...checkRequiredFields(refreshed),
    ...checkDuplicateSeriesOrder(refreshed),
    ...checkDuplicateSlugs(refreshed),
    ...checkAudioFilesExist(refreshed, (p) => fs.existsSync(p)),
    ...checkRepoSize(fileSizes, 700 * 1024 * 1024, 90 * 1024 * 1024),
  ];

  if (errors.length > 0) {
    console.error("Content validation failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`Content validation passed (${refreshed.length} stories checked).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
