// Registers the service worker (docs/contracts.md section 9). Never throws: the
// site works the same without it. ?sw=off unregisters it and keeps it off on this
// device; ?sw=on clears that.
import { basePath } from "./dom.mjs";

const KEY = "stories-sw";

export async function registerOffline({
  nav = typeof navigator === "undefined" ? {} : navigator,
  base = basePath(),
  storage = typeof localStorage === "undefined" ? null : localStorage,
  search = typeof location === "undefined" ? "" : location.search,
  reconcile = true,
  // Seams for tests; the defaults load the real modules lazily.
  supported = null,
  loadLibrary = null,
  reconcileStories = null,
  online = () => nav.onLine !== false,
} = {}) {
  if (!nav.serviceWorker) return null;
  const guard = (fn) => { try { return fn(); } catch { return undefined; } };
  const flag = new URLSearchParams(search).get("sw");
  if (flag === "off") guard(() => storage?.setItem(KEY, "off"));
  if (flag === "on") guard(() => storage?.removeItem(KEY));
  if (guard(() => storage?.getItem(KEY)) === "off") {
    try {
      // Only this app: the origin is shared with the other robertbeverton.github.io sites.
      const mine = new URL(`${base}/`, globalThis.location?.href ?? "http://localhost/").href;
      for (const registration of await nav.serviceWorker.getRegistrations()) {
        if (registration.scope === mine) await registration.unregister();
      }
    } catch { /* nothing to undo */ }
    return null;
  }
  try {
    const registration = await nav.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/`, type: "module", updateViaCache: "none" });
    if (reconcile && online()) reconcileSaved({ supported, loadLibrary, reconcileStories }); // fire and forget
    return registration;
  } catch (err) {
    console.warn("offline unavailable", err);
    return null;
  }
}

// Once per full page load, online: a deploy that cleared the shell cache gets the saved stories'
// pages re-fetched without opening the Offline page. A failed or empty library load means no
// reconcile at all (reconciling with [] would say nothing is wanted). Never throws.
async function reconcileSaved({ supported, loadLibrary, reconcileStories }) {
  try {
    const [lib, off] = await Promise.all([import("./library.mjs"), import("./offline.mjs")]);
    if (!(supported ?? off.offlineSupported)()) return;
    const data = await (loadLibrary ?? lib.loadLibrary)();
    const stories = Array.isArray(data?.stories) ? data.stories.filter((s) => s.audioUrl) : [];
    if (!stories.length) return;
    await (reconcileStories ?? ((list) => off.getStore().reconcile(list)))(stories);
  } catch { /* the page must not notice */ }
}
