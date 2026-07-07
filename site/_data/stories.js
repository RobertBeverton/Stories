import { loadStories, computeStories, groupForLibrary } from "../../scripts/stories-lib.mjs";

// IMPORTANT: keep this file's ONLY export as `export default`. Eleventy's
// global data loader only auto-invokes a data module's default export when
// `default` is the sole export of the module (see the comment in
// scripts/stories-lib.mjs for why) — adding named exports here would
// silently break `data.stories` across the whole site.
export default async function () {
  const rawStories = await loadStories();
  const stories = computeStories(rawStories);
  const { seriesGroups, standalone } = groupForLibrary(stories);
  stories.seriesGroups = seriesGroups;
  stories.standalone = standalone;
  return stories;
}
