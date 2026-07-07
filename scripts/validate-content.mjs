import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";

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
  return path.basename(filePath, ".md");
}

export async function loadStories(globPattern = "stories/**/*.md") {
  const files = await fg(globPattern);
  return files.map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    const { data } = matter(raw);
    return { file, data, slug: slugify(file) };
  });
}
