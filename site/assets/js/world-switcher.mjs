// data-mount="world-switcher": big buttons for "All" and each world. Remembers
// the choice per device and announces it with `stories:world` {world}.
import { h } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import { getWorld, setWorld } from "./world-state.mjs";

export function mount(el) {
  let disposed = false;
  let current = getWorld();

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
  };

  document.addEventListener("stories:world", onWorld);
  el.addEventListener("click", onClick);

  loadLibrary().then((lib) => {
    if (disposed || !lib) return;
    if (current && !lib.worlds.some((w) => w.name === current)) current = ""; // stale choice
    const group = h("div", { role: "group", "aria-label": "Choose a world", "data-role": "worlds" });
    group.append(h("button", { type: "button", "data-world": "" }, "All"));
    for (const world of lib.worlds) {
      group.append(
        h(
          "button",
          { type: "button", "data-world": world.name, "data-icon": world.icon, "data-accent": world.accent },
          world.title,
        ),
      );
    }
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
