// data-mount="world-switcher": big buttons for "All" and each world. Remembers
// the choice per device and announces it with `stories:world` {world}.
// data-variant="picker" (Home) draws big tiles and goes on to the Library after
// a choice; anything else draws compact filter buttons (Library).
import { paletteByName } from "./accent-colors.mjs";
import { iconSvg } from "./cover.mjs";
import { basePath, h } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import { nav } from "./nav.mjs";
import { getWorld, knownWorld, setWorld } from "./world-state.mjs";

export function mount(el) {
  let disposed = false;
  let current = getWorld();
  const picker = el.dataset.variant === "picker";

  function syncPressed() {
    for (const button of el.querySelectorAll("button[data-world]")) {
      button.setAttribute("aria-pressed", String(button.dataset.world === current));
    }
  }

  const onWorld = (event) => {
    current = event.detail?.world ?? "";
    syncPressed();
  };
  const onClick = (event) => {
    const button = event.target.closest?.("button[data-world]");
    if (!button || !el.contains(button)) return;
    setWorld(button.dataset.world);
    if (picker) nav.go(`${basePath()}/library/`);
  };

  document.addEventListener("stories:world", onWorld);
  el.addEventListener("click", onClick);

  /** One button: a tile (picker) or a chip (filter). `world` is a library world, or {name: "", title: "All"}. */
  function choice(world) {
    const accent = paletteByName(world.accent);
    return h(
      "button",
      {
        type: "button",
        class: picker ? "world-tile" : "btn",
        "data-world": world.name,
        "data-icon": world.icon,
        "data-accent": world.accent,
        style: picker && accent ? `--tile: ${accent.background}; --tile-ink: ${accent.text};` : null,
      },
      picker ? iconSvg(world.icon) : null,
      picker ? h("span", {}, world.title) : world.title,
    );
  }

  loadLibrary().then((lib) => {
    if (disposed || !lib) return;
    current = knownWorld(current, lib.worlds); // a stale choice becomes All
    const group = h("div", {
      role: "group",
      "aria-label": "Choose a world",
      class: picker ? "world-tiles" : "world-chips",
      "data-role": "worlds",
    });
    group.append(choice({ name: "", title: "All" }));
    for (const world of lib.worlds) group.append(choice(world));
    el.replaceChildren(group);
    syncPressed();
  });

  return () => {
    disposed = true;
    document.removeEventListener("stories:world", onWorld);
    el.removeEventListener("click", onClick);
    el.replaceChildren();
  };
}
