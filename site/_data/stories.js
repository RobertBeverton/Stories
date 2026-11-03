import fs from "node:fs";
import { groupForLibrary } from "../../scripts/stories-lib.mjs";
import { loadWorldData } from "../../scripts/world-data.mjs";

// IMPORTANT: keep this file's ONLY export as `export default`. Eleventy's
// global data loader only auto-invokes a data module's default export when
// `default` is the sole export of the module (see the comment in
// scripts/stories-lib.mjs for why) — adding named exports here would
// silently break `data.stories` across the whole site.
//
// Stories come from loadWorldData so each carries its `world` and only the
// `parts` / `lore` that passed validation. Problems are reported (and the
// build failed or warned) by site/library.json.11ty.js, once, not here.
export default async function () {
  const { stories } = await loadWorldData({ audioFileExists: fs.existsSync });
  const { groups } = groupForLibrary(stories);
  stories.groups = groups;
  return stories;
}
