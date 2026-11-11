// data-mount="lore": the "Stories | Lore" segmented control.
// `data-current="stories"` (default, the Library) or `data-current="lore"` (the
// Lore listing). Two real links; the current one has aria-current="page".
// On the Library it shows only while the current world is a single world with
// lore entries (library.json `worlds[].hasLore`); otherwise the root is hidden
// and empty, so nothing about Lore appears. On the Lore listing it always
// shows (you are already there) and the page's `[data-lore-world]` sections
// follow the current world when that world has a section. There it also wires
// `input[data-role="lore-search"]`: every word typed must appear in an entry's
// `data-search` text (title, tradition and summary); letters and worlds left empty
// are hidden and `[data-role="lore-status"]` (a live region) says how many entries match.
// The listing is an A to Z index: `nav[data-role="letters"]` gets a button for each
// letter that has entries (only while one world is on show and there are
// `MIN_LETTERS` or more), and `[data-role="heard"]` lists, by name only, the entries
// of stories heard on this device (most recent first), hidden while a search is typed.
import { basePath, h, onProgressChange } from "./dom.mjs";
import { safeHref } from "./escape.mjs";
import { loadLibrary } from "./library.mjs";
import { readAll } from "./progress.mjs";
import { getWorld, knownWorld } from "./world-state.mjs";

const MIN_LETTERS = 5;
const HEARD_MAX = 8;

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
    if (current === "lore") {
      filterSections();
      renderHeard();
    }
  }

  function filterSections() {
    const sections = [...document.querySelectorAll("[data-lore-world]")];
    const scoped = world && sections.some((s) => s.dataset.loreWorld === world);
    for (const section of sections) {
      section.hidden = (Boolean(scoped) && section.dataset.loreWorld !== world) || section.dataset.searchEmpty === "true";
    }
    renderLetters();
  }

  // ---- the letter strip ----
  const lettersNav = current === "lore" ? document.querySelector('[data-role="letters"]') : null;
  function renderLetters() {
    if (!lettersNav) return;
    const visible = [...document.querySelectorAll("[data-lore-world]")].filter((s) => !s.hidden);
    const heads = visible.length === 1 ? [...visible[0].querySelectorAll(".lore-letter:not([hidden]) .lore-letter-head")] : [];
    const signature = heads.length >= MIN_LETTERS ? heads.map((head) => head.id).join("|") : "";
    lettersNav.hidden = !signature;
    if (lettersNav.dataset.signature === signature) return;
    lettersNav.dataset.signature = signature;
    if (!signature) {
      lettersNav.replaceChildren();
      return;
    }
    lettersNav.replaceChildren(
      h("div", { class: "chip-row", role: "group", "aria-label": "Jump to a letter" },
        ...heads.map((head) => {
          const button = h("button", { type: "button", class: "btn", "data-letter": head.textContent, "aria-label": `Jump to ${head.textContent}` }, head.textContent);
          button.addEventListener("click", () => {
            head.scrollIntoView({ block: "start" });
            head.focus({ preventScroll: true });
          });
          return button;
        })),
    );
  }

  // ---- from stories you have heard ----
  const heardBox = current === "lore" ? document.querySelector('[data-role="heard"]') : null;
  const heardList = heardBox?.querySelector('[data-role="heard-list"]') ?? null;
  function renderHeard() {
    if (!heardBox || !heardList || !lib) return;
    const records = readAll();
    const searching = Boolean(input?.value.trim());
    const scoped = world && lib.worlds.some((w) => w.name === world) ? world : "";
    const when = (entry) =>
      Math.max(0, ...entry.stories.map((slug) => {
        const r = records[slug];
        return r && (r.completedAt || r.audioTime > 0) ? r.savedAt || 1 : 0;
      }));
    const picked = searching
      ? []
      : lib.lore
          .filter((entry) => !scoped || entry.world === scoped)
          .map((entry) => ({ entry, at: when(entry) }))
          .filter((x) => x.at > 0)
          .sort((a, b) => b.at - a.at)
          .slice(0, HEARD_MAX)
          .map((x) => x.entry);
    const signature = picked.map((entry) => entry.url).join("|");
    heardBox.hidden = picked.length === 0;
    if (heardList.dataset.signature === signature) return;
    heardList.dataset.signature = signature;
    heardList.replaceChildren(
      ...picked.map((entry) => h("li", {}, h("a", { class: "btn", href: safeHref(entry.url) ?? "#", "data-role": "heard-link" }, entry.title))),
    );
  }
  const stopProgress = heardBox ? onProgressChange(renderHeard) : () => {};

  // ---- search (Lore listing only) ----
  const input = current === "lore" ? document.querySelector('input[data-role="lore-search"]') : null;
  const status = document.querySelector('[data-role="lore-status"]');
  const entries = input
    ? [...document.querySelectorAll(".lore-list > li")].map((li) => ({
        li,
        text: (li.dataset.search ?? li.textContent).toLowerCase(),
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
    for (const letter of document.querySelectorAll(".lore-letter")) {
      letter.hidden = !letter.querySelector(".lore-list > li:not([hidden])");
    }
    for (const section of document.querySelectorAll("[data-lore-world]")) {
      section.dataset.searchEmpty = String(!section.querySelector(".lore-list > li:not([hidden])"));
    }
    filterSections();
    renderHeard();
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
  // Without script nothing here is hidden; with it, the letters and heard names appear once the library is known.

  return () => {
    disposed = true;
    document.removeEventListener("stories:world", onWorld);
    input?.removeEventListener("input", applySearch);
    input?.removeEventListener("search", applySearch);
    stopProgress();
    if (lettersNav) {
      lettersNav.replaceChildren();
      lettersNav.hidden = true;
      delete lettersNav.dataset.signature;
    }
    if (heardBox && heardList) {
      heardList.replaceChildren();
      heardBox.hidden = true;
      delete heardList.dataset.signature;
    }
    for (const section of document.querySelectorAll("[data-lore-world]")) {
      section.hidden = false;
      delete section.dataset.searchEmpty;
    }
    for (const node of document.querySelectorAll(".lore-letter, .lore-list > li")) node.hidden = false;
    el.replaceChildren();
  };
}
