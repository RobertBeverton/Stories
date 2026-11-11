// Groups a world's lore entries into an A to Z index for the Lore listing.
// Sorted by title ignoring case and accents (Väinämöinen files under V); a title
// that does not start with A to Z files under "#", which sorts last.

const strip = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** The index letter for a title: "A" to "Z", or "#". */
export function letterOf(title) {
  const first = strip(String(title ?? "").trim()).charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : "#";
}

/**
 * @param {Array<{world: string, title: string}>} entries
 * @param {string} world only this world's entries are grouped
 * @returns {Array<{letter: string, entries: object[]}>} letters in order, "#" last, empty letters left out
 */
export function loreLetters(entries, world) {
  const mine = (entries ?? [])
    .filter((entry) => entry.world === world)
    .sort((a, b) => strip(a.title).localeCompare(strip(b.title), "en", { sensitivity: "base" }));
  const groups = new Map();
  for (const entry of mine) {
    const letter = letterOf(entry.title);
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(entry);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "#") - (b === "#") || a.localeCompare(b))
    .map(([letter, list]) => ({ letter, entries: list }));
}
