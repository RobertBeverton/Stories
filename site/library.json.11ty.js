// Placeholder. WP-C replaces this with the real emitter; until then it emits
// an empty but schema-valid index so the contract holds end to end.
export const data = { permalink: "library.json" };

export function render() {
  return JSON.stringify({ stories: [], worlds: [], lore: [] });
}
