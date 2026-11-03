// Shared row visibility for the library list. Search and filters each hide rows
// for their own reason; a row is hidden while any reason remains, so the two
// never undo each other.

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

/**
 * Shows a polite "no stories match" message when every row is hidden. Uses a
 * template-provided `[data-role="no-results"]` if present, otherwise creates one
 * after the rows' list.
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
  const none = rows.every((r) => r.hidden);
  if (none) note.textContent = "No stories match. Try fewer words or clear the filters.";
  else note.textContent = "";
  note.hidden = !none;
}
