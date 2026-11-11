// A bottom sheet for page modules (the Surprise me picker, the full list of
// worlds). It follows the player sheet's rules (dock.mjs): role="dialog" with
// aria-modal, the rest of the page is inert while it is open, Escape and the
// Close button shut it, Tab stays inside, and focus goes back to what opened
// it. It sits on <body>, outside #view, so the router never swaps it and
// `inert` on #view does not reach it. Always call destroy() when the module
// that made it unmounts.
import { h } from "./dom.mjs";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {{id: string, title: string}} options `id` is unique on the page
 * @returns {{el: HTMLElement, body: HTMLElement, isOpen(): boolean, open(opener?: Element): void,
 *            attach(): void, close(opts?: {restoreFocus?: boolean}): void, destroy(): void, onClose: (fn: () => void) => void}}
 */
export function createSheet({ id, title }) {
  const closeButton = h("button", { type: "button", class: "btn", "data-role": "sheet-close" }, "Close");
  const body = h("div", { class: "sheet-body" });
  const el = h(
    "div",
    { class: "sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": `${id}-title`, hidden: true, "data-role": id },
    h("div", { class: "sheet-head" }, h("h2", { id: `${id}-title` }, title), closeButton),
    body,
  );
  const scrim = h("div", { class: "sheet-scrim", hidden: true });
  let isOpen = false;
  let opener = null;
  let inerted = [];
  let closed = () => {};

  const setInert = (on) => {
    if (on) {
      inerted = [document.getElementById("view"), document.querySelector(".dock")].filter(Boolean);
      for (const node of inerted) node.setAttribute("inert", "");
    } else {
      for (const node of inerted) node.removeAttribute("inert");
      inerted = [];
    }
  };

  function trapTab(event) {
    const items = [...el.querySelectorAll(FOCUSABLE)].filter((node) => !node.hidden && !node.closest("[hidden]"));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") trapTab(event);
  }

  /** Puts the closed sheet in the page, so its controls exist before it is first opened. */
  function attach() {
    if (!el.isConnected) document.body.append(scrim, el);
  }

  function open(from) {
    if (isOpen) return;
    isOpen = true;
    opener = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    attach();
    scrim.hidden = false;
    el.hidden = false;
    setInert(true);
    closeButton.focus();
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen) return;
    isOpen = false;
    el.hidden = true;
    scrim.hidden = true;
    setInert(false);
    if (restoreFocus && opener?.isConnected) opener.focus();
    opener = null;
    closed();
  }

  function destroy() {
    isOpen = false;
    setInert(false);
    el.remove();
    scrim.remove();
  }

  closeButton.addEventListener("click", () => close());
  scrim.addEventListener("click", () => close());
  el.addEventListener("keydown", onKeydown);

  return {
    el,
    body,
    isOpen: () => isOpen,
    attach,
    open,
    close,
    destroy,
    onClose: (fn) => { closed = fn; },
  };
}
