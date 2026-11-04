// Runs the world-data checks (parts vs `## Part` headings and audioDuration,
// dangling `lore:` slugs, lore front matter) over the real merged stories/ and
// lore/ on disk. World-data problems print as warnings and exit 0: the build
// drops the offending data and carries on. Structural errors (duplicate slug,
// unknown accent, malformed library) exit 1.
//
//   node scripts/validate-world-data.mjs                 # this repo, after fetch-content
//   node scripts/validate-world-data.mjs --strict        # warnings fail too
//   node scripts/validate-world-data.mjs --strict --world <name> [--lore-dir lore]
//       a world repo's own CI: ./stories and ./lore belong to <name>
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadWorldData, formatWarning } from "./world-data.mjs";

export function parseArgs(argv) {
  const opts = { strict: false, world: null, loreDir: "lore" };
  const value = (i, flag) => {
    if (i >= argv.length || argv[i].startsWith("--")) throw new Error(`${flag} needs a value`);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--strict") opts.strict = true;
    else if (arg === "--world") opts.world = value(++i, arg);
    else if (arg === "--lore-dir") opts.loreDir = value(++i, arg);
    else throw new Error(`Unknown argument '${arg}'`);
  }
  return opts;
}

// Returns the process exit code.
export async function run(argv, { log = console.log, warn = console.warn, error = console.error } = {}) {
  const opts = parseArgs(argv);
  const { warnings, errors, stories, lore } = await loadWorldData({
    singleWorld: opts.world ? { name: opts.world, loreDir: opts.loreDir } : null,
  });

  if (warnings.length) {
    warn(
      "World data warnings (the offending data is dropped from the build):\n" +
        warnings.map((w) => `  - ${formatWarning(w)}`).join("\n"),
    );
  }
  if (errors.length) {
    error("World data errors:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    return 1;
  }
  if (opts.strict && warnings.length) {
    error(`${warnings.length} world data warning(s); failing because of --strict.`);
    return 1;
  }
  log(`World data OK (${stories.length} stories, ${lore.length} lore entries, ${warnings.length} warnings).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).then((code) => process.exit(code));
}
