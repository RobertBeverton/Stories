import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";

export default async function () {
  const files = await fg("stories/**/*.md");
  const stories = files.map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    const { data, content } = matter(raw);
    const slug = path.basename(file, ".md");
    const wordCount = content.trim().split(/\s+/).length;
    const readMinutes = Math.max(1, Math.round(wordCount / 215));
    return {
      ...data,
      tags: data.tags ?? [],
      slug,
      url: `/stories/${path.basename(path.dirname(file))}/${slug}/`,
      readMinutes,
      audioMinutes: data.audioDuration ? Math.round(data.audioDuration / 60) : null,
    };
  });

  return stories
    .filter((s) => !s.draft)
    .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
}
