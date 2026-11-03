// One page per lore entry at the entry's `url` (<base>/lore/<world>/<slug>/),
// laid out by _includes/lore-entry.njk. Entries come from site/_data/loreEntries.js
// (validated; `body` is the entry's markdown). With no entries, pagination
// yields no pages and nothing is written.
//
// Like story-pages.11ty.js, `entry.url` carries PATH_PREFIX for display; the
// permalink is the output path and must not. The body is rendered with
// markdown-it (the library Eleventy itself uses) with raw HTML turned off:
// lore is plain text for listeners.
import MarkdownIt from "markdown-it";
import { PATH_PREFIX } from "../scripts/stories-lib.mjs";

const md = new MarkdownIt({ html: false, linkify: false });

export const data = {
  pagination: { data: "loreEntries", size: 1, alias: "entry" },
  layout: "lore-entry.njk",
  eleventyComputed: {
    permalink: (data) => {
      const url = data.entry.url;
      return (url.startsWith(PATH_PREFIX) ? url.slice(PATH_PREFIX.length) : url) + "index.html";
    },
    title: (data) => data.entry.title,
  },
};

export function render(data) {
  return md.render(data.entry.body);
}
