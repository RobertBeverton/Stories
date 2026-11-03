import { loadWorldData } from "../../scripts/world-data.mjs";

// Worlds in content-sources.json order: name, title, tagline, accent (palette
// name), accentColor ({background, text} from PALETTE), icon, hasLore.
// IMPORTANT: default export only (see site/_data/stories.js).
export default async function () {
  const { worlds } = await loadWorldData();
  return worlds;
}
