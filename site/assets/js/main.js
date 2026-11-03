// Single entry point. Mounts a module for every element carrying
// data-mount="<name>". Each module is site/assets/js/<name>.mjs and exports
// mount(el) returning an unmount() function (see docs/contracts.md).
// A missing or broken module must never break the page.
export const NAMES = [
  "continue", "played-lately", "story-resume", "search", "play-button",
  "filters", "world-switcher", "parts", "dock",
];
const unmounts = new Map();

export async function mountAll(root = document) {
  const pending = [];
  for (const el of root.querySelectorAll("[data-mount]")) {
    const name = el.dataset.mount;
    if (!NAMES.includes(name) || unmounts.has(el)) continue;
    unmounts.set(el, () => {}); // claim the element so concurrent calls do not double-mount
    pending.push((async () => {
      try {
        const mod = await import(/* @vite-ignore */ `./${name}.mjs`);
        const unmount = mod.mount(el);
        unmounts.set(el, typeof unmount === "function" ? unmount : () => {});
      } catch (err) {
        unmounts.delete(el); // allow a later retry
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

if (typeof document !== "undefined") mountAll();
