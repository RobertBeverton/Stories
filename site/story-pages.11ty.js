// Generates one output page per story in the `stories` collection.
//
// The story content at `stories/**/*.md` lives OUTSIDE the configured
// Eleventy input directory (`site/`), so it is never scanned by Eleventy's
// normal template discovery. `eleventy.config.js` bridges that gap with
// virtual templates (`eleventyConfig.addTemplate`), reading each file's raw
// contents (front matter included) and registering it under a `stories` tag
// plus a `storySlug` data field carrying the real on-disk slug (the virtual
// template's own `fileSlug` is derived from its synthetic virtual path, not
// the original filename, so it can't be used for lookups).
//
// This template lives inside `site/` (the input directory) so Eleventy
// discovers and renders it. It paginates over `collections.stories` (the
// virtual templates above) to emit one real output file per story.
//
// All page data needed by the `story.njk` layout (title, series, audio
// fields, prev/next navigation, permalink, etc.) comes straight from the
// `site/_data/stories.js` global data file's `bySlug` map — the SAME code
// path that computes the library card's `url` field — so the permalink
// computed below is guaranteed to match `story.url` exactly.

export const data = {
  pagination: {
    data: "collections.stories",
    size: 1,
    alias: "storyPage",
  },
  layout: "story.njk",
  eleventyComputed: {
    permalink: (data) => {
      const meta = data.stories.bySlug[data.storyPage.data.storySlug];
      return meta ? meta.url + "index.html" : false;
    },
    title: (data) => data.stories.bySlug[data.storyPage.data.storySlug]?.title,
    series: (data) => data.stories.bySlug[data.storyPage.data.storySlug]?.series,
    seriesOrder: (data) => data.stories.bySlug[data.storyPage.data.storySlug]?.seriesOrder,
    audio: (data) => data.stories.bySlug[data.storyPage.data.storySlug]?.audio,
    audioUrl: (data) => data.stories.bySlug[data.storyPage.data.storySlug]?.audioUrl,
    audioMinutes: (data) => data.stories.bySlug[data.storyPage.data.storySlug]?.audioMinutes,
    readMinutes: (data) => data.stories.bySlug[data.storyPage.data.storySlug]?.readMinutes,
    slug: (data) => data.stories.bySlug[data.storyPage.data.storySlug]?.slug,
    prevStory: (data) => data.stories.bySlug[data.storyPage.data.storySlug]?.prevStory ?? null,
    nextStory: (data) => data.stories.bySlug[data.storyPage.data.storySlug]?.nextStory ?? null,
  },
};

export function render(data) {
  return data.storyPage.templateContent;
}
