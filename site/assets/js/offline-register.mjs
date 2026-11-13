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
    return await nav.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/`, type: "module", updateViaCache: "none" });
  } catch (err) {
    console.warn("offline unavailable", err);
    return null;
  }
}
