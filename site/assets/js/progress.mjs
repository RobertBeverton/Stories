// Progress store contract. WP-A implements every function below; the
// scaffold only fixes the interface. Records are keyed `story-progress:<slug>`
// in localStorage and have the v2 shape documented in docs/contracts.md:
//   { v: 2, audioTime, scrollY, playing, savedAt, completedAt? }
// v1 records ({ url, title, artworkUrl, ... }) must still be read, ignoring
// those fields, and are rewritten as v2 on the next save. Never store or
// trust url/title/art from storage; derive them from library.json.
const todo = (name) => () => {
  throw new Error(`progress.${name}: not implemented (WP-A)`);
};

/** @returns {Record<string, object>} every valid record keyed by slug, normalised to v2 */
export const readAll = todo("readAll");
/** @param {string} slug @returns {object|null} normalised v2 record or null */
export const read = todo("read");
/** @param {string} slug @param {object} partial merged into the record, written as v2 */
export const write = todo("write");
/** @param {string} slug sets completedAt, resets audioTime */
export const markCompleted = todo("markCompleted");
/**
 * @param {object} record a v2 record
 * @param {{durationSec?: number|null}} [info]
 * @returns {{state: "new"|"in-progress"|"finished", fraction: number}}
 */
export const toViewModel = todo("toViewModel");
