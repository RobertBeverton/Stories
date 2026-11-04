// Escaping helpers. Modules build DOM with createElement and textContent, so
// they rarely need these; they exist for the few places a string must become
// markup or a URL (and as the tested guarantee behind "no raw innerHTML").
const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/** Neutralises &, <, >, quotes and backticks so text is safe in markup and attributes. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"'`]/g, (ch) => HTML_ENTITIES[ch]);
}

/**
 * Returns `url` only if it is a same-site path ("/x", not "//host" and not a
 * backslash trick), otherwise "#". Used for every href that comes from data.
 */
export function safeHref(url) {
  if (typeof url !== "string") return "#";
  if (/^\/(?![/\\])/.test(url) && !/[\u0000-\u001f]/.test(url)) return url;
  return "#";
}
