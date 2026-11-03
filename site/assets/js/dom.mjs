// Tiny DOM helpers shared by the modules. Everything is built with
// createElement and textContent, never innerHTML.

/** The site base path from <html data-base>, without a trailing slash. */
export function basePath() {
  const raw = (typeof document !== "undefined" && document.documentElement.dataset.base) || "";
  return raw.replace(/\/+$/, "");
}

/**
 * h("a", {href, "data-role": "x"}, "text", childNode). Attributes whose value
 * is null, undefined or false are skipped; text children use text nodes.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    el.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Replaces el's children only when `signature` differs from the last render (keeps focus stable). */
export function renderIfChanged(el, signature, build) {
  if (el.dataset.renderSignature === signature) return false;
  el.dataset.renderSignature = signature;
  el.replaceChildren(...build());
  return true;
}

/** Runs `fn` whenever progress may have changed (this tab or another tab). Returns a disposer. */
export function onProgressChange(fn) {
  document.addEventListener("stories:progress", fn);
  window.addEventListener("storage", fn);
  return () => {
    document.removeEventListener("stories:progress", fn);
    window.removeEventListener("storage", fn);
  };
}
