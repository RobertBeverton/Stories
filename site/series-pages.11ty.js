// Generates one output page per series (e.g. /series/felix-alex/index.html)
// from `stories.seriesPages` (computed in site/_data/stories.js via
// scripts/stories-lib.mjs's seriesPageData()).
//
// Mirrors site/story-pages.11ty.js's pagination approach. Unlike story
// pages, `seriesPageData()` builds `seriesSlug` directly via slugify() —
// it never goes through the PATH_PREFIX-prefixed `url`/`audioUrl` fields
// computeStories() produces, so there is no prefix to strip here before
// computing `permalink` (permalink must stay unprefixed regardless, since
// it controls where the file lands under `_site/`; GitHub Pages serves the
// contents of `_site/` at the `/isles-of-yum/` subpath automatically). The
// homepage's "See all →" link, by contrast, IS built through Nunjucks's
// `| url` filter (see site/index.njk), so it resolves correctly against
// this unprefixed permalink once served at the subpath.

export const data = {
  pagination: {
    data: "stories.seriesPages",
    size: 1,
    alias: "seriesPage",
  },
  layout: "series.njk",
  eleventyComputed: {
    permalink: (data) => `/series/${data.seriesPage.seriesSlug}/index.html`,
    title: (data) => data.seriesPage.series,
    series: (data) => data.seriesPage.series,
    accentColor: (data) => data.seriesPage.accentColor,
    seriesStories: (data) => data.seriesPage.stories,
  },
};

export function render() {
  return "";
}
