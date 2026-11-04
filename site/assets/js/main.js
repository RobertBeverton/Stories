// Single entry point. Mounts a module for every element carrying
// data-mount="<name>". Each module is site/assets/js/<name>.mjs and exports
// mount(el) returning an unmount() function (see docs/contracts.md).
// A missing or broken module must never break the page. Not a hook: the world
// accent (world-accent.mjs) also starts here, so every page follows the world.
import { startRouter } from "./router.mjs";
import { startWorldAccent } from "./world-accent.mjs";

export const NAMES = [
  "continue", "played-lately", "story-resume", "search", "play-button",
  "filters", "world-switcher", "text-size", "lore", "parts", "dock",
];
const unmounts = new Map();

export async function mountAll(root = document) {
  const pending = [];
  for (const el of root.querySelectorAll("[data-mount]")) {
    const name = el.dataset.mount;
    if (!NAMES.includes(name) || unmounts.has(el)) continue;
    // Claim the element so concurrent calls do not double-mount. The claim is also
    // how a mount learns it was cancelled: unmountAll() removes it.
    const claim = () => {};
    unmounts.set(el, claim);
    pending.push((async () => {
      try {
        const mod = await import(/* @vite-ignore */ `./${name}.mjs`);
        // The router may have swapped the view (unmountAll + new markup) while the
        // module was loading. Mounting now would attach listeners to a detached
        // element whose unmount nobody ever calls.
        if (unmounts.get(el) !== claim) return; // unmounted while importing
        if (!root.contains(el)) {
          unmounts.delete(el);
          return;
        }
        const unmount = mod.mount(el);
        const release = typeof unmount === "function" ? unmount : () => {};
        if (unmounts.get(el) !== claim) {
          release(); // cancelled during mount(): do not leak what it just attached
          return;
        }
        unmounts.set(el, release);
      } catch (err) {
        if (unmounts.get(el) === claim) unmounts.delete(el); // allow a later retry
        console.warn(`mount ${name} failed`, err);
      }
    })());
  }
  await Promise.all(pending);
}

export function unmountAll(root = document) {
  for (const [el, unmount] of unmounts) {
    if (root.contains(el)) {
      try { unmount(); } catch (err) { console.warn("unmount failed", err); }
      unmounts.delete(el);
    }
  }
}

if (typeof document !== "undefined") {
  startWorldAccent();
  const initialMount = mountAll();
  // The router swaps #view and remounts its modules; see router.mjs for the kill switch.
  // `ready`: the saved scroll position is applied once the first page's modules are mounted.
  startRouter({ mountAll, unmountAll, ready: initialMount });
}
