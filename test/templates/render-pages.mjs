// Renders the real templates (site/index.njk, site/library.njk,
// site/_includes/story.njk, all through base.njk) with nunjucks, the way
// Eleventy would, from plain data. No Eleventy build and no stories/ folder
// needed. Shared by the template and integration tests.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import nunjucks from "nunjucks";
import { accentColorFor } from "../../scripts/accent-colors.mjs";
import { iconDetailSvgPath, iconSvgPath } from "../../scripts/icons.mjs";
import { pageSecurity } from "../../scripts/page-security.mjs";
import { dropTitleHeading } from "../../scripts/story-body.mjs";

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const site = path.join(root, "site");

const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(site, "_includes")), { autoescape: true });
env.addFilter("url", (p) => "/Stories" + p);
env.addFilter("dropTitleHeading", dropTitleHeading);
env.addGlobal("icons", { path: iconSvgPath, detail: iconDetailSvgPath });

/** A template-shaped story (what site/_data/stories.js provides) from a library.json story. */
export function templateStory(libraryStory, extra = {}) {
  const minutes = libraryStory.durationSec ? Math.round(libraryStory.durationSec / 60) : null;
  return {
    description: "Invented placeholder text.",
    audioDuration: libraryStory.durationSec,
    audioMinutes: minutes,
    readMinutes: 4,
    audioUrl: `${libraryStory.url.replace(/\/$/, "")}.mp3`,
    keyIslands: [],
    characters: [],
    accentColor: accentColorFor(libraryStory.series ?? undefined),
    ...libraryStory,
    publishDate: new Date(`${libraryStory.publishDate}T00:00:00Z`),
    ...extra,
  };
}

function page(templatePath, data, pageUrl, stories) {
  const { content: body, data: front } = matter(fs.readFileSync(templatePath, "utf8"));
  const ctx = { buildId: "test12345678", importMap: pageSecurity("test12345678"), page: { url: pageUrl }, stories, ...front, ...data };
  const inner = env.renderString(body, ctx);
  return env.render("base.njk", { ...ctx, content: inner });
}

export function renderHome(stories) {
  return page(path.join(site, "index.njk"), {}, "/", stories);
}

export function renderLibrary(stories) {
  return page(path.join(site, "library.njk"), {}, "/library/", stories);
}

/** `story` is a template story; extra data (parts, content, nextStory...) goes in `data`. */
export function renderStory(story, data = {}, stories = [story]) {
  return page(
    path.join(site, "_includes", "story.njk"),
    { prevStory: null, nextStory: null, content: "<p>Invented placeholder text.</p>", ...story, ...data },
    `/stories/${story.slug}/`,
    stories,
  );
}
