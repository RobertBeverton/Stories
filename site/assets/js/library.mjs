// Loads <base>/library.json once per page. Title, URL and art for every story
// shown anywhere come from here, never from localStorage.
import { basePath } from "./dom.mjs";

let cached = null;

export function resetLibrary() {
  cached = null;
}

function valid(data) {
  return data && Array.isArray(data.stories) && Array.isArray(data.worlds);
}

/** @returns {Promise<{stories: object[], worlds: object[], lore: object[], bySlug: Map<string, object>}|null>} */
export function loadLibrary() {
  if (!cached) {
    const attempt = (async () => {
      try {
        const res = await fetch(`${basePath()}/library.json`);
        if (!res.ok) throw new Error(`library.json ${res.status}`);
        const data = await res.json();
        if (!valid(data)) throw new Error("library.json has the wrong shape");
        return {
          stories: data.stories,
          worlds: data.worlds,
          lore: Array.isArray(data.lore) ? data.lore : [],
          bySlug: new Map(data.stories.map((s) => [s.slug, s])),
        };
      } catch (err) {
        console.warn("library.json unavailable", err);
        if (cached === attempt) cached = null; // allow a retry on the next mount
        return null;
      }
    })();
    cached = attempt;
  }
  return cached;
}
