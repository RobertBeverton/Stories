// The world accent: --accent and --accent-ink on <html>, taken from the current
// world's PALETTE entry. Runs on every page (from main.js), so the choice made
// on Home or Library colours a story page too. "" (all worlds) restores the
// default from tokens.css.
import { paletteByName } from "./accent-colors.mjs";
import { loadLibrary } from "./library.mjs";
import { getWorld, knownWorld } from "./world-state.mjs";

export function applyAccent(entry) {
  const style = document.documentElement.style;
  if (entry) {
    style.setProperty("--accent", entry.background);
    style.setProperty("--accent-ink", entry.text);
  } else {
    style.removeProperty("--accent");
    style.removeProperty("--accent-ink");
  }
}

/** Follows the remembered world now and `stories:world` after. Returns a disposer. */
export function startWorldAccent() {
  let disposed = false;
  let worlds = null;
  let current = getWorld();

  function sync() {
    if (disposed || !worlds) return;
    applyAccent(paletteByName(worlds.find((w) => w.name === current)?.accent));
  }

  const onWorld = (event) => {
    current = event.detail?.world ?? "";
    if (worlds) sync();
    else load(); // library.json failed earlier: try again now that the listener asked
  };
  document.addEventListener("stories:world", onWorld);
  function load() {
    return loadLibrary().then((lib) => {
      if (lib) {
        worlds = lib.worlds;
        current = knownWorld(current, worlds); // a stale choice becomes All
      }
      sync();
    });
  }
  load();

  return () => {
    disposed = true;
    document.removeEventListener("stories:world", onWorld);
    applyAccent(null);
  };
}
