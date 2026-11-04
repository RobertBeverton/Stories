import { loadWorldData } from "../../scripts/world-data.mjs";

// Validated lore entries (library.json's `lore` fields plus `body`, the entry
// text). Named loreEntries, not `lore`: a story's `lore:` front matter would
// shadow a global called `lore` on that story's page.
// IMPORTANT: default export only (see site/_data/stories.js).
export default async function () {
  const { lore } = await loadWorldData();
  return lore;
}
