// data-mount="search" on an <input type="search"> (or a container holding one).
// Hides library rows (`[data-role="story-row"][data-slug]`) that do not match
// the words typed, using titles, series, tags and character names from library.json. The typed
// text is remembered for the tab (so Back finds it) and announced with
// `stories:search` {query} on document; the filters module uses it to switch
// the Library between the grouped view and a flat list of results.
import { loadLibrary } from "./library.mjs";
import { readQuery, writeQuery } from "./library-state.mjs";
import { matchesQuery } from "./selectors.mjs";
import { setHiddenReason, storyRows, updateNoResults } from "./visibility.mjs";

export function mount(el) {
  const input = el.matches("input") ? el : el.querySelector("input");
  if (!input) return () => {};
  let library = null;
  let disposed = false;
  if (!input.value) input.value = readQuery();

  function apply() {
    if (!library) return;
    const query = input.value;
    for (const row of storyRows()) {
      const story = library.bySlug.get(row.dataset.slug);
      setHiddenReason(row, "search", story ? !matchesQuery(story, query) : false);
    }
    updateNoResults();
  }

  function onInput() {
    writeQuery(input.value.trim() ? input.value : "");
    apply();
    document.dispatchEvent(new CustomEvent("stories:search", { detail: { query: input.value } }));
  }

  input.addEventListener("input", onInput);
  input.addEventListener("search", onInput); // the clear button on type=search
  loadLibrary().then((lib) => {
    if (disposed) return;
    library = lib;
    apply();
  });

  return () => {
    disposed = true;
    input.removeEventListener("input", onInput);
    input.removeEventListener("search", onInput);
    for (const row of storyRows()) setHiddenReason(row, "search", false);
    updateNoResults();
  };
}
