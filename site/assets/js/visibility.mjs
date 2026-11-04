// Shared row visibility for the library list. Search, filters and paging each
// hide rows for their own reason ("search", "filters", "page"); a row is hidden
// while any reason remains, so they never undo each other.

/** Rows are `[data-role="story-row"][data-slug]` anywhere in the document. */
export function storyRows(root = document) {
  return [...root.querySelectorAll('[data-role="story-row"][data-slug]')];
}

export function setHiddenReason(row, reason, hidden) {
  const reasons = new Set((row.dataset.hiddenBy || "").split(" ").filter(Boolean));
  if (hidden) reasons.add(reason);
  else reasons.delete(reason);
  if (reasons.size > 0) row.dataset.hiddenBy = [...reasons].join(" ");
  else delete row.dataset.hiddenBy;
  row.hidden = reasons.size > 0;
}

/** True when search or a filter (not just paging) hides the row: it does not "match". */
export function isExcluded(row) {
  const reasons = (row.dataset.hiddenBy || "").split(" ");
  return reasons.includes("search") || reasons.includes("filters");
}

/**
 * Shows a polite "no stories match" message when search or filters exclude
 * every row. Uses a template-provided `[data-role="no-results"]` if present,
 * otherwise creates one after the rows' list. Also fills an optional
 * `[data-role="results-status"]` with "n of N stories" while a search or filter
 * excludes rows, unless the filters module manages it (`data-managed`).
 */
export function updateNoResults(root = document) {
  const rows = storyRows(root);
  if (rows.length === 0) return;
  let note = root.querySelector('[data-role="no-results"]');
  if (!note) {
    note = document.createElement("p");
    note.dataset.role = "no-results";
    note.setAttribute("role", "status");
    note.hidden = true;
    rows[0].parentElement.after(note);
  }
  const matching = rows.filter((r) => !isExcluded(r)).length;
  const none = matching === 0;
  const status = root.querySelector('[data-role="results-status"]');
  if (status && !status.dataset.managed) {
    status.textContent = matching === rows.length ? "" : `${matching} of ${rows.length} stories`;
  }
  const text = none ? "No stories match. Try fewer words or clear the filters." : "";
  if (note.textContent !== text) note.textContent = text;
  note.hidden = !none;
}
