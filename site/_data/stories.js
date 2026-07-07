import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";
import { slugify } from "../../scripts/slugify.mjs";

export default async function () {
  const files = await fg("stories/**/*.md");
  const allStories = files.map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    const { data, content } = matter(raw);
    const slug = path.basename(file, ".md");
    const wordCount = content.trim().split(/\s+/).length;
    const readMinutes = Math.max(1, Math.round(wordCount / 215));
    const seriesSlug = data.series ? slugify(data.series) + "/" : "";
    // The story PAGE lives under the slugified series name (see url below),
    // but the MP3 is copied via a plain passthrough glob
    // (`addPassthroughCopy("stories/**/*.mp3")` in eleventy.config.js),
    // which preserves the file's actual on-disk directory structure
    // relative to the project root — NOT the slugified series name. So the
    // audio URL must be built from the file's real parent folder name
    // (e.g. "bramble-wall"), not from slugify(series) (e.g.
    // "the-bramble-wall"), or the <audio> src will 404 even though the
    // story page itself resolves fine.
    const diskDir = path.dirname(file).split(/[\\/]/).slice(1).join("/"); // strip leading "stories"
    return {
      ...data,
      tags: data.tags ?? [],
      slug,
      url: `/stories/${seriesSlug}${slug}/`,
      audioUrl: data.audio ? `/stories/${diskDir ? diskDir + "/" : ""}${data.audio}` : null,
      readMinutes,
      audioMinutes: data.audioDuration ? Math.round(data.audioDuration / 60) : null,
    };
  });

  const stories = allStories
    .filter((s) => !s.draft)
    .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));

  // Compute prev/next navigation within each series, ordered by seriesOrder.
  const bySeries = new Map();
  for (const story of allStories) {
    if (!story.series) continue;
    if (!bySeries.has(story.series)) bySeries.set(story.series, []);
    bySeries.get(story.series).push(story);
  }
  for (const seriesStories of bySeries.values()) {
    seriesStories.sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
  }

  const bySlug = {};
  for (const story of allStories) {
    let prevStory = null;
    let nextStory = null;
    if (story.series) {
      const seriesStories = bySeries.get(story.series);
      const index = seriesStories.indexOf(story);
      prevStory = index > 0 ? seriesStories[index - 1] : null;
      nextStory =
        index >= 0 && index < seriesStories.length - 1 ? seriesStories[index + 1] : null;
    }
    bySlug[story.slug] = {
      ...story,
      prevStory: prevStory ? { url: prevStory.url, title: prevStory.title } : null,
      nextStory: nextStory ? { url: nextStory.url, title: nextStory.title } : null,
    };
  }

  stories.bySlug = bySlug;
  return stories;
}
