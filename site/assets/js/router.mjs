// The router: turns the multi-page site into one persistent shell. It
// intercepts same-origin, in-scope link clicks, fetches the page, sanitises it
// and swaps only <main id="view">. The <audio> and the dock live outside #view,
// so playback survives navigation. Anything unexpected falls back to a normal
// full navigation, so the site is never worse than plain multi-page.
//
// Contract with the rest of the app (docs/contracts.md section 3): on a swap the
// router calls unmountAll(view), replaces the children, then calls
// mountAll(view), so every data-mount module inside #view is unmounted and
// remounted. Modules outside #view (the dock) are untouched. The base path
// comes only from <html data-base>.
//
// KILL SWITCH. Any of these leaves the plain multi-page site fully working
// (links do full page loads; the dock and the audio still work within a page):
//   - build flag: <html data-router="off"> (set STORIES_ROUTER=off when building)
//   - localStorage["stories-router"] = "off" on this device
//   - open any page with ?router=off (sets the localStorage flag) and
//     ?router=on (clears it)
//
// BUILD ID. Every page carries <meta name="build-id">. A fetched page from a
// different deploy than the running one forces a full navigation (so new
// modules, CSS and import map load together). A sessionStorage marker makes
// that happen at most once per URL within GUARD_WINDOW_MS: if the same URL
// still reports a different build right after a forced load (a mixed-version
// CDN), the router swaps it in with a warning instead of forcing again, so a
// mismatch can never reload forever.
//
// SCROLL AND FOCUS. history.scrollRestoration is set to "manual", so the router
// owns every restore. It keeps scrollY in history.state (after scrolling stops,
// when the page is hidden, and on pagehide), restores it on Back/Forward through
// the router, and, because a reload, a Back after a full-page fallback navigation
// and a Back from another site never reach popstate, also reads history.state when
// it starts and applies that position once the first page's modules have mounted.
// After each swap focus moves to the new <h1> (without scrolling) and a polite
// live region announces the new title. The reading position saved in progress is
// applied only on a first load of a story, never by the router.
//
// OVERLAPPING NAVIGATIONS. A newer go() wins: a swapped-in view whose modules
// were still mounting (or whose before-mount hooks were pending) when the next
// navigation started does not run its after-mount hooks, focus, scroll or
// announcement, and is not mounted at all if the hooks had not finished.
import { basePath } from "./dom.mjs";
import { nav } from "./nav.mjs";

export const KILL_KEY = "stories-router";
export const GUARD_KEY = "stories-router-forced";
export const GUARD_WINDOW_MS = 10_000;

// ---------------------------------------------------------------------------
// Lifecycle hooks for modules outside #view (the dock/player)

const beforeMountHooks = new Set();
const afterMountHooks = new Set();

/** Runs after #view's children were replaced and before its modules mount. @returns {() => void} */
export function onBeforeMount(fn) {
  beforeMountHooks.add(fn);
  return () => beforeMountHooks.delete(fn);
}
/** Runs after the new view's modules were mounted. @returns {() => void} */
export function onAfterMount(fn) {
  afterMountHooks.add(fn);
  return () => afterMountHooks.delete(fn);
}
async function runHooks(set, info) {
  for (const fn of [...set]) {
    try {
      await fn(info);
    } catch (err) {
      console.warn("router hook failed", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Storage (every access can throw when site data is blocked)

function local() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function session() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Kill switch

/** Applies ?router=off / ?router=on from the address to the localStorage flag. */
export function applyRouterQuery(search = globalThis.location?.search ?? "") {
  const value = new URLSearchParams(search).get("router");
  const store = local();
  if (!store || (value !== "off" && value !== "on")) return;
  try {
    if (value === "off") store.setItem(KILL_KEY, "off");
    else store.removeItem(KILL_KEY);
  } catch {
    // storage full or blocked: the query alone cannot persist
  }
}

/** True when the build flag or the device flag turns the router off. */
export function routerDisabled() {
  if (document.documentElement.dataset.router === "off") return true;
  try {
    return local()?.getItem(KILL_KEY) === "off";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Link filtering

const URL_ATTRS = ["href", "src", "xlink:href", "action", "formaction", "data", "poster", "background", "ping", "srcdoc"];
const DROP = "script, iframe, frame, frameset, object, embed, base, meta, link, style, template, noscript";

/**
 * Removes everything that could run or reshape the page from a parsed view:
 * script-like elements, every on* attribute, and javascript:/vbscript: URLs
 * (and data: URLs anywhere except <img src>). Never executes anything: the
 * input is an inert DOMParser document.
 */
export function sanitizeView(root) {
  for (const el of root.querySelectorAll(DROP)) el.remove();
  for (const el of root.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (URL_ATTRS.includes(name)) {
        const value = attr.value.replace(/[\u0000- ]/g, "").toLowerCase();
        const dataOk = value.startsWith("data:image/") && name === "src" && el.localName === "img";
        if (/^(javascript|vbscript):/.test(value) || (value.startsWith("data:") && !dataOk)) {
          el.removeAttribute(attr.name);
        }
      }
    }
  }
  return root;
}

/** The page a location shows, ignoring ?autoplay=1 (story-resume strips it from the address after the swap). */
export function docKey(loc) {
  const params = new URLSearchParams(loc.search);
  params.delete("autoplay");
  const query = params.toString();
  return `${loc.pathname}${query ? `?${query}` : ""}`;
}

const sameDocument = (url, loc) => url.pathname === loc.pathname && url.search === loc.search;

function inScope(url, loc, base) {
  if (url.origin !== loc.origin || !/^https?:$/.test(url.protocol)) return false;
  if (base && url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return false;
  const last = url.pathname.split("/").pop();
  return !(last.includes(".") && !last.endsWith(".html")); // .mp3, .json, .png: let the browser have them
}

/**
 * Decides whether a click is a plain in-scope page navigation.
 * @returns {URL|null} the target, or null to leave the click to the browser
 */
export function interceptTarget(event, { loc = window.location, base = basePath() } = {}) {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
  const anchor = origin?.closest("a[href]");
  if (!anchor) return null;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  if (anchor.hasAttribute("download") || anchor.dataset.router === "off") return null;
  if (/\bexternal\b/i.test(anchor.getAttribute("rel") ?? "")) return null;
  let url;
  try {
    url = new URL(anchor.getAttribute("href"), loc.href);
  } catch {
    return null;
  }
  if (!inScope(url, loc, base)) return null;
  if (sameDocument(url, loc) && url.hash) return null; // an in-page anchor
  return url;
}

// ---------------------------------------------------------------------------
// The router

/**
 * @param {{mountAll: (root: Element) => Promise<void>, unmountAll: (root: Element) => void,
 *          now?: () => number, ready?: Promise<unknown>}} deps `ready` settles when the first
 *   page's modules have mounted; the saved scroll position is applied then
 * @returns {{navigate: (href: string, opts?: object) => Promise<void>, stop: () => void}|null}
 *   null when the router is disabled or the browser lacks what it needs
 */
export function startRouter({ mountAll, unmountAll, now = () => Date.now(), ready = Promise.resolve() }) {
  applyRouterQuery();
  if (routerDisabled()) return null;
  if (!window.history?.pushState || typeof fetch !== "function" || typeof DOMParser === "undefined") return null;
  const view = document.getElementById("view");
  if (!view) return null;

  const base = basePath();
  const previousRestoration = (() => {
    try {
      return history.scrollRestoration;
    } catch {
      return undefined;
    }
  })();
  try {
    history.scrollRestoration = "manual";
  } catch {
    // older browsers: the router still restores explicitly
  }

  let token = 0;
  let stopped = false;
  let controller = null;
  let announcer = null;
  let announceTimer = 0;
  let currentDoc = docKey(location);
  const memoryGuard = new Map();

  // --- guard against reload loops ------------------------------------------
  function wasForced(href) {
    try {
      const entry = JSON.parse(session()?.getItem(GUARD_KEY) ?? "null");
      if (entry && entry.href === href && now() - entry.at < GUARD_WINDOW_MS) return true;
    } catch {
      // unreadable marker: fall through to the in-memory one
    }
    const at = memoryGuard.get(href);
    return at !== undefined && now() - at < GUARD_WINDOW_MS;
  }
  function markForced(href) {
    memoryGuard.set(href, now());
    try {
      session()?.setItem(GUARD_KEY, JSON.stringify({ href, at: now() }));
    } catch {
      // the in-memory marker still covers this document
    }
  }

  const runningBuild = () => document.querySelector('meta[name="build-id"]')?.content ?? null;

  function fallback(url) {
    nav.go(url.href);
  }

  // --- small DOM chores -----------------------------------------------------
  function announce(text) {
    if (!announcer) {
      announcer = document.createElement("div");
      announcer.className = "visually-hidden";
      announcer.setAttribute("role", "status");
      announcer.setAttribute("aria-live", "polite");
      announcer.dataset.role = "router-announcer";
      document.body.append(announcer);
    }
    announcer.textContent = "";
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      announcer.textContent = text;
    }, 100);
  }

  function updateNavState(url) {
    for (const link of document.querySelectorAll('nav[aria-label="Main"] a[href]')) {
      const path = new URL(link.getAttribute("href"), location.href).pathname;
      if (path === url.pathname) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }

  function focusHeading() {
    const target = view.querySelector("h1") ?? view;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  function scrollTo(url, savedY) {
    if (url.hash) {
      let id = url.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        // a malformed escape: use the raw text, which finds nothing, so the saved place is used
      }
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, savedY ?? 0);
  }

  /** A reload (and Back after a full navigation or from another site) arrives with no popstate. */
  function restoreInitialScroll() {
    const saved = history.state?.scrollY;
    if (stopped || !(typeof saved === "number" && saved > 0)) return;
    window.scrollTo(0, saved);
  }

  function rememberScroll() {
    if (docKey(location) !== currentDoc) return; // mid-navigation: location already moved
    try {
      history.replaceState({ ...(history.state ?? {}), stories: true, scrollY: window.scrollY }, "");
    } catch {
      // history unavailable: Back falls back to the top of the page
    }
  }

  // --- the navigation -------------------------------------------------------
  async function go(url, { push = true, scrollY = 0 } = {}) {
    const mine = ++token;
    controller?.abort();
    controller = new AbortController();

    let parsed;
    let finalUrl = url;
    try {
      const res = await fetch(url.href, {
        signal: controller.signal,
        credentials: "same-origin",
        headers: { Accept: "text/html" },
      });
      if (mine !== token) return;
      if (res.url) finalUrl = new URL(res.url, url.href);
      if (!res.ok || !/html/i.test(res.headers?.get?.("content-type") ?? "text/html") || !inScope(finalUrl, location, base)) {
        return fallback(url);
      }
      const html = await res.text();
      if (mine !== token) return;
      parsed = new DOMParser().parseFromString(html, "text/html");
    } catch (err) {
      if (err?.name === "AbortError" || mine !== token) return;
      return fallback(url);
    }

    const incoming = parsed.getElementById("view");
    if (!incoming) return fallback(url);

    const running = runningBuild();
    const incomingBuild = parsed.querySelector('meta[name="build-id"]')?.content ?? null;
    if (running && incomingBuild !== running) {
      if (!wasForced(finalUrl.href)) {
        markForced(finalUrl.href);
        return fallback(finalUrl);
      }
      console.warn("router: page is from a different build; swapping anyway (already forced once)");
    }

    try {
      sanitizeView(incoming);
      const imported = document.importNode(incoming, true);
      if (push) rememberScroll();
      unmountAll(view);
      view.replaceChildren(...imported.childNodes);
      document.title = parsed.title || document.title;
      const target = finalUrl.href;
      if (push && target !== location.href) history.pushState({ stories: true, scrollY: 0 }, "", target);
      else if (push) history.replaceState({ stories: true, scrollY: 0 }, "", target);
      currentDoc = docKey(finalUrl);
      updateNavState(finalUrl);
      await runHooks(beforeMountHooks, { url: finalUrl, view });
      if (mine !== token) return; // a newer navigation replaced this view; it mounts its own
      await mountAll(view);
      if (mine !== token) return; // replaced while mounting: the newer one owns focus, scroll and hooks
      await runHooks(afterMountHooks, { url: finalUrl, view });
      if (mine !== token) return;
      focusHeading();
      scrollTo(finalUrl, scrollY);
      announce(document.title);
    } catch (err) {
      console.warn("router: swap failed, loading the page normally", err);
      fallback(finalUrl);
    }
  }

  // --- listeners ------------------------------------------------------------
  function onClick(event) {
    const url = interceptTarget(event, { base });
    if (!url) return;
    event.preventDefault();
    go(url);
  }
  function onPopState(event) {
    const url = new URL(location.href);
    if (docKey(url) === currentDoc) {
      scrollTo(url, event.state?.scrollY); // same document: a hash change, or Back to a hash
      return;
    }
    go(url, { push: false, scrollY: event.state?.scrollY ?? 0 });
  }
  // Back/Forward cannot read the scroll of the page being left (location has
  // already moved), so the position is kept in history.state as the user scrolls.
  let scrollTimer = 0;
  function onScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(rememberScroll, 150);
  }
  document.addEventListener("click", onClick);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pagehide", rememberScroll);
  // Mobile browsers can discard a hidden page without ever firing pagehide.
  const onVisibility = () => { if (document.visibilityState === "hidden") rememberScroll(); };
  document.addEventListener("visibilitychange", onVisibility);
  Promise.resolve(ready).then(restoreInitialScroll, restoreInitialScroll);

  const navigate = (href, options) => go(new URL(href, location.href), options);
  nav.router = navigate; // modules call nav.open(), which now stays inside the app

  return {
    navigate,
    stop() {
      stopped = true;
      if (nav.router === navigate) nav.router = null;
      controller?.abort();
      token++;
      clearTimeout(announceTimer);
      clearTimeout(scrollTimer);
      announcer?.remove();
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", rememberScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        if (previousRestoration) history.scrollRestoration = previousRestoration;
      } catch {
        // ignore
      }
    },
  };
}
