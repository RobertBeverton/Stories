// data-mount="lore": the "Stories | Lore" segmented control.
// `data-current="stories"` (default, the Library) or `data-current="lore"` (the
// Lore listing). Two real links; the current one has aria-current="page".
// On the Library it shows only while the current world is a single world with
// lore entries (library.json `worlds[].hasLore`); otherwise the root is hidden
// and empty, so nothing about Lore appears. On the Lore listing it always
// shows (you are already there) and the page's `[data-lore-world]` sections
// follow the current world when that world has a section. There it also wires
// `input[data-role="lore-search"]`: every word typed must appear in an entry's
// title, summary or tradition; traditions and worlds left empty are hidden and
// `[data-role="lore-status"]` (a live region) says how many entries match.
import { basePath, h } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import { getWorld, knownWorld } from "./world-state.mjs";

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
    for (const section of sections) {
      section.hidden = (Boolean(scoped) && section.dataset.loreWorld !== world) || section.dataset.searchEmpty === "true";
    }
  }

  // ---- search (Lore listing only) ----
  const input = current === "lore" ? document.querySelector('input[data-role="lore-search"]') : null;
  const status = document.querySelector('[data-role="lore-status"]');
  const entries = input
    ? [...document.querySelectorAll(".lore-list > li")].map((li) => ({
        li,
        text: `${li.textContent} ${li.closest(".lore-tradition")?.querySelector("h3")?.textContent ?? ""}`.toLowerCase(),
      }))
    : [];

  function applySearch() {
    if (!input) return;
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const { li, text } of entries) {
      const ok = words.every((w) => text.includes(w));
      li.hidden = !ok;
      if (ok) shown += 1;
    }
    for (const tradition of document.querySelectorAll(".lore-tradition")) {
      tradition.hidden = !tradition.querySelector(".lore-list > li:not([hidden])");
    }
    for (const section of document.querySelectorAll("[data-lore-world]")) {
      section.dataset.searchEmpty = String(!section.querySelector(".lore-list > li:not([hidden])"));
    }
    filterSections();
    if (status) {
      const text = words.length === 0 ? "" : shown === 0 ? "No lore matches. Try fewer words." : `${shown} of ${entries.length} entries`;
      if (status.textContent !== text) status.textContent = text;
    }
  }
  input?.addEventListener("input", applySearch);
  input?.addEventListener("search", applySearch);

  const onWorld = (event) => {
    world = event.detail?.world ?? "";
    render();
  };
  document.addEventListener("stories:world", onWorld);

  el.hidden = true; // nothing until library.json says there is lore
  loadLibrary().then((data) => {
    if (disposed || !data) return;
    lib = data;
    world = knownWorld(world, lib.worlds); // a stale choice becomes All
    render();
  });

  return () => {
    disposed = true;
    document.removeEventListener("stories:world", onWorld);
    input?.removeEventListener("input", applySearch);
    input?.removeEventListener("search", applySearch);
    for (const section of document.querySelectorAll("[data-lore-world]")) {
      section.hidden = false;
      delete section.dataset.searchEmpty;
    }
    for (const node of document.querySelectorAll(".lore-tradition, .lore-list > li")) node.hidden = false;
    el.replaceChildren();
  };
}
