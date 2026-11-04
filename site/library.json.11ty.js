import { loadWorldData, formatWarning } from "../scripts/world-data.mjs";

// Emits /library.json, validated against scripts/schema/library.schema.json.
// Structural errors (duplicate slug, unknown accent, malformed index) throw and
// fail the build. World-data problems were already dropped by loadWorldData and
// are printed here as warnings naming the world and file.
export const data = { permalink: "library.json" };

export async function render() {
  const { library, warnings, errors } = await loadWorldData();
  for (const warning of warnings) console.warn(`[world-data] warning: ${formatWarning(warning)}`);
  if (errors.length) {
    throw new Error(`library.json: structural errors:\n  ${errors.join("\n  ")}`);
  }
  return JSON.stringify(library);
}
