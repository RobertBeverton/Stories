import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import { slugify } from "./slugify.mjs";
import { accentColorFor } from "./accent-colors.mjs";

// Parses one raw story file's frontmatter/content into the shape
// computeStories() expects: { file, data, content }.
export function parseStoryFile(file, raw) {
  const { data, content } = matter(raw);
  return { file, data, content };
}

// Loads all story markdown files from disk (real I/O), parsed but not
// yet computed. Kept separate from computeStories() so the URL/prevNext
// logic below can be unit-tested against fixture data without touching
// the filesystem.
export async function loadStories(globPattern = "stories/**/*.md") {
  const files = await fg(globPattern);
  return files.map((file) => parseStoryFile(file, fs.readFileSync(file, "utf8")));
}

// Pure computation of the final story objects (url, audioUrl, readMinutes,
// prevStory/nextStory, etc.) from already-parsed { file, data, content }
// records. No filesystem or network access — safe to unit test directly.
//
// NOTE: this logic used to live inline in site/_data/stories.js. It was
// extracted here (rather than just adding named exports to stories.js)
// because Eleventy's data-file loader (EleventyImport in
// @11ty/eleventy/src/Util/Require.js) only auto-invokes a global data
// module's `export default` function when `default` is the MODULE'S ONLY
// EXPORT. As soon as stories.js had additional named exports alongside
// `default`, Eleventy returned the raw module namespace object instead of
// calling the default function, silently breaking `data.stories` for every
// template. Keeping stories.js as a default-export-only wrapper around this
// module avoids that trap while still making the URL/prevNext logic
// unit-testable.
// This repo (RobertBeverton/Stories) deploys to GitHub Pages at
// https://robertbeverton.github.io/Stories/ (a project-repo subpath), not
// the domain root, so every URL/audioUrl this module hands to templates
// must be prefixed accordingly. This mirrors the `pathPrefix` set in
// eleventy.config.js: that config prefixes paths run through Nunjucks's
// `| url` filter, but `url`/`audioUrl` here are already fully-formed strings
// by the time they reach the templates (computed in plain JS, not through
// Eleventy's page-object system), so the filter can't reach them — the
// prefix has to be baked in here instead, at the single place this codebase
// already centralizes URL construction.
// Exported so story-pages.11ty.js can strip it back off `meta.url` when
// computing `permalink` — permalinks control where files actually land on
// disk under `_site/` and must stay unprefixed (see that file's comments).
export const PATH_PREFIX = "/Stories";

export function computeStories(rawStories) {
  const allStories = rawStories.map(({ file, data, content }) => {
    const basename = path.basename(file, ".md");
    // The full, folder-qualified slug (e.g. "bramble-wall/book-1") is what
    // uniquely identifies a story and keys `bySlug` below — every series
    // names its entries "book-1", "book-2", etc., so the plain basename
    // alone collides across series. `basename` (just the filename) is kept
    // separately because the story PAGE's URL already gets its series
    // segment from `seriesSlug` (the slugified series NAME, e.g.
    // "the-bramble-wall") — using the folder-qualified slug there would
    // duplicate that segment (".../the-bramble-wall/bramble-wall/book-1/").
    const slug = path
      .relative("stories", file)
      .replace(/\.md$/, "")
      .split(path.sep)
      .join("/");
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
      url: `${PATH_PREFIX}/stories/${seriesSlug}${basename}/`,
      audioUrl: data.audio
        ? `${PATH_PREFIX}/stories/${diskDir ? diskDir + "/" : ""}${data.audio}`
        : null,
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

// Groups the already-computed, non-draft story list (as returned by
// computeStories()) into series sections and a standalone list, for the
// library page. Pure function — no localStorage/DOM access, since the
// "Continue" section (which DOES need localStorage) can only be computed
// client-side; see site/assets/library.js.
export function groupForLibrary(stories) {
  const bySeries = new Map();
  const standalone = [];
  for (const story of stories) {
    if (!story.series) {
      standalone.push(story);
      continue;
    }
    if (!bySeries.has(story.series)) bySeries.set(story.series, []);
    bySeries.get(story.series).push(story);
  }

  const seriesGroups = Array.from(bySeries.entries()).map(([series, seriesStories]) => {
    seriesStories.sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
    const earliestPublish = seriesStories.reduce(
      (min, s) => Math.min(min, new Date(s.publishDate).getTime()),
      Infinity
    );
    return {
      series,
      accentColor: accentColorFor(series),
      stories: seriesStories,
      _earliestPublish: earliestPublish,
    };
  });

  seriesGroups.sort((a, b) => b._earliestPublish - a._earliestPublish);
  for (const group of seriesGroups) delete group._earliestPublish;

  return { seriesGroups, standalone };
}
