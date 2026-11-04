// data-mount="search" on an <input type="search"> (or a container holding one).
// Hides library rows (`[data-role="story-row"][data-slug]`) that do not match
// the words typed, using titles, series and tags from library.json.
import { loadLibrary } from "./library.mjs";
import { matchesQuery } from "./selectors.mjs";
import { setHiddenReason, storyRows, updateNoResults } from "./visibility.mjs";

export function mount(el) {
  const input = el.matches("input") ? el : el.querySelector("input");
  if (!input) return () => {};
  let library = null;
  let disposed = false;

  function apply() {
    if (!library) return;
    const query = input.value;
    for (const row of storyRows()) {
      const story = library.bySlug.get(row.dataset.slug);
      setHiddenReason(row, "search", story ? !matchesQuery(story, query) : false);
    }
    updateNoResults();
  }

  input.addEventListener("input", apply);
  input.addEventListener("search", apply); // the clear button on type=search
  loadLibrary().then((lib) => {
    if (disposed) return;
    library = lib;
    apply();
  });

  return () => {
    disposed = true;
    input.removeEventListener("input", apply);
    input.removeEventListener("search", apply);
    for (const row of storyRows()) setHiddenReason(row, "search", false);
    updateNoResults();
  };
}
