import fg from "fast-glob";
import fs from "node:fs";
import { slugify } from "./scripts/slugify.mjs";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("stories/**/*.mp3");
  eleventyConfig.addPassthroughCopy("site/assets");

  eleventyConfig.addFilter("slugify", slugify);

  // `stories/**/*.md` lives outside the configured input directory (`site/`),
  // so Eleventy never scans it as part of its normal template discovery —
  // `collectionApi.getFilteredByGlob()` only filters templates Eleventy has
  // already found inside `dir.input`, it does not glob the filesystem itself.
  // Virtual templates (addTemplate) are the supported way to bring content
  // from outside the input directory into the build: read each file's raw
  // contents (front matter included) and register it as a virtual template
  // tagged "stories", which makes it show up in `collections.stories` (and
  // `collections.all`) the normal way.
  for (const filePath of fg.sync("stories/**/*.md")) {
    const content = fs.readFileSync(filePath, "utf8");
    const virtualPath = `virtual-${filePath.replace(/[\\/]/g, "-")}`;
    const storySlug = filePath.split(/[\\/]/).pop().replace(/\.md$/, "");
    eleventyConfig.addTemplate(virtualPath, content, {
      tags: ["stories"],
      storySlug,
      // This virtual template only exists to feed the `stories` collection
      // for `site/story-pages.11ty.js` to paginate over; it must not also
      // emit its own standalone output page (which would be an unlinked,
      // unstyled duplicate of the real story page at story.url).
      permalink: false,
      eleventyExcludeFromCollections: false,
    });
  }

  return {
    dir: {
      input: "site",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
}
