// The current world, remembered per device. "" means all worlds.
const KEY = "stories-world";

export function getWorld() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

/**
 * `world` if it is one of the library `worlds`, else "" (All). A remembered
 * world that was renamed or removed is forgotten, so it cannot filter the
 * Library to nothing.
 */
export function knownWorld(world, worlds) {
  if (!world || worlds.some((w) => w.name === world)) return world || "";
  try {
    if (localStorage.getItem(KEY) === world) localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
  return "";
}

/** Remembers `world` and announces it with `stories:world` on document. */
export function setWorld(world) {
  const value = typeof world === "string" ? world : "";
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    // not remembered, still announced
  }
  document.dispatchEvent(new CustomEvent("stories:world", { detail: { world: value } }));
}
