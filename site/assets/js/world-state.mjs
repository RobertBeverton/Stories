// The current world, remembered per device. "" means all worlds.
const KEY = "stories-world";

export function getWorld() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
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
