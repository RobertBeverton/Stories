// data-mount="lore": the "Stories | Lore" segmented control.
// `data-current="stories"` (default, the Library) or `data-current="lore"` (the
// Lore listing). Two real links; the current one has aria-current="page".
// On the Library it shows only while the current world is a single world with
// lore entries (library.json `worlds[].hasLore`); otherwise the root is hidden
// and empty, so nothing about Lore appears. On the Lore listing it always
// shows (you are already there) and the page's `[data-lore-world]` sections
// follow the current world when that world has a section.
import { basePath, h } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import { getWorld } from "./world-state.mjs";

export function mount(el) {
  let disposed = false;
  let lib = null;
  let world = getWorld();
  const current = el.dataset.current === "lore" ? "lore" : "stories";

  function segment() {
    const link = (key, label, path) =>
      h("a", { class: "btn", href: `${basePath()}${path}`, "aria-current": current === key ? "page" : null }, label);
    return h(
      "nav",
      { class: "lore-segment", "aria-label": "Library sections", "data-role": "segment" },
      link("stories", "Stories", "/library/"),
      link("lore", "Lore", "/lore/"),
    );
  }

  function render() {
    if (!lib) return;
    const single = world && lib.worlds.find((w) => w.name === world);
    const show = current === "lore" || Boolean(single?.hasLore);
    if (show) {
      if (!el.querySelector('[data-role="segment"]')) el.replaceChildren(segment());
      el.hidden = false;
    } else {
      el.replaceChildren();
      el.hidden = true;
    }
    if (current === "lore") filterSections();
  }

  function filterSections() {
    const sections = [...document.querySelectorAll("[data-lore-world]")];
    const scoped = world && sections.some((s) => s.dataset.loreWorld === world);
    for (const section of sections) section.hidden = Boolean(scoped) && section.dataset.loreWorld !== world;
  }

  const onWorld = (event) => {
    world = event.detail?.world ?? "";
    render();
  };
  document.addEventListener("stories:world", onWorld);

  el.hidden = true; // nothing until library.json says there is lore
  loadLibrary().then((data) => {
    if (disposed || !data) return;
    lib = data;
    render();
  });

  return () => {
    disposed = true;
    document.removeEventListener("stories:world", onWorld);
    for (const section of document.querySelectorAll("[data-lore-world]")) section.hidden = false;
    el.replaceChildren();
  };
}
