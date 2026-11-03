// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nav } from "../../site/assets/js/nav.mjs";
import {
  GUARD_KEY, GUARD_WINDOW_MS, KILL_KEY, applyRouterQuery, interceptTarget, onAfterMount, onBeforeMount,
  routerDisabled, sanitizeView, startRouter,
} from "../../site/assets/js/router.mjs";

const BUILD = "111";

function page({ title, h1, body = "", build = BUILD }) {
  return `<!doctype html><html data-base="/Stories"><head><title>${title}</title>
<meta name="build-id" content="${build}"></head><body>
<main id="view"><h1>${h1}</h1>${body}</main><nav aria-label="Main"><a href="/Stories/">Home</a><a href="/Stories/library/">Library</a></nav></body></html>`;
}

const pages = {
  "/Stories/": page({ title: "Home", h1: "Welcome", body: '<a id="to-lib" href="/Stories/library/">Library</a>' }),
  "/Stories/library/": page({ title: "Library", h1: "All stories", body: '<a id="to-story" href="/Stories/stories/a/">A</a><div id="deep">deep</div>' }),
  "/Stories/stories/a/": page({ title: "A tale", h1: "A tale", body: '<p data-mount="story-resume">x</p>' }),
};

function response(html, { url, status = 200, type = "text/html; charset=utf-8" }) {
  return { ok: status < 400, status, url, headers: { get: () => type }, text: async () => html };
}

let router;
let deps;
let fetchMock;
let assign;
let outcomes; // [defaultPrevented] of each click that reached window

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/Stories/");
  document.documentElement.dataset.base = "/Stories";
  document.documentElement.removeAttribute("data-router");
  document.head.replaceChildren();
  const meta = document.createElement("meta");
  meta.name = "build-id";
  meta.content = BUILD;
  document.head.append(meta);
  const doc = new DOMParser().parseFromString(pages["/Stories/"], "text/html");
  document.body.replaceChildren(...doc.body.childNodes);
  document.title = "Home";

  deps = { mountAll: vi.fn(async () => {}), unmountAll: vi.fn() };
  fetchMock = vi.fn(async (href) => {
    const path = new URL(href).pathname;
    return pages[path] ? response(pages[path], { url: href }) : response("nope", { url: href, status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  assign = vi.spyOn(nav, "go").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // Records whether the router handled the click, then stops jsdom from really navigating.
  outcomes = [];
  window.addEventListener("click", recordClick);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
function recordClick(e) {
  outcomes.push(e.defaultPrevented);
  e.preventDefault();
}
afterEach(() => {
  router?.stop();
  router = null;
  window.removeEventListener("click", recordClick);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const start = () => {
  router = startRouter(deps);
  return router;
};
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const heading = () => document.querySelector("#view h1").textContent;

describe("interception", () => {
  it("swaps the view, the title and the history entry for an in-scope link", async () => {
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(outcomes).toEqual([true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(heading()).toBe("All stories");
    expect(document.title).toBe("Library");
    expect(location.pathname).toBe("/Stories/library/");
    expect(assign).not.toHaveBeenCalled();
  });

  it("marks the matching dock link aria-current and clears the others", async () => {
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    const [home, library] = document.querySelectorAll('nav[aria-label="Main"] a');
    expect(library.getAttribute("aria-current")).toBe("page");
    expect(home.hasAttribute("aria-current")).toBe(false);
  });

  const notIntercepted = {
    "external origin": (a) => a.setAttribute("href", "https://example.com/Stories/library/"),
    "a hash on the same page": (a) => a.setAttribute("href", "#top"),
    "a hash on the same page with the full path": (a) => a.setAttribute("href", "/Stories/#top"),
    "target=_blank": (a) => a.setAttribute("target", "_blank"),
    "download": (a) => a.setAttribute("download", ""),
    "rel=external": (a) => a.setAttribute("rel", "external noopener"),
    "data-router=off": (a) => a.setAttribute("data-router", "off"),
    "a path outside the base": (a) => a.setAttribute("href", "/elsewhere/page/"),
    "a file (mp3)": (a) => a.setAttribute("href", "/Stories/stories/a.mp3"),
    "a non-http scheme": (a) => a.setAttribute("href", "mailto:me@example.com"),
  };
  it.each(Object.entries(notIntercepted))("leaves %s to the browser", async (_name, tweak) => {
    start();
    const link = document.querySelector("#to-lib");
    tweak(link);
    click(link);
    await settle();
    expect(outcomes).toEqual([false]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["meta", { metaKey: true }], ["ctrl", { ctrlKey: true }], ["shift", { shiftKey: true }], ["alt", { altKey: true }],
    ["middle button", { button: 1 }],
  ])("leaves a %s click to the browser", async (_name, init) => {
    start();
    click(document.querySelector("#to-lib"), init);
    await settle();
    expect(outcomes).toEqual([false]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores clicks that something else already handled, and clicks off any link", async () => {
    start();
    const link = document.querySelector("#to-lib");
    link.addEventListener("click", (e) => e.preventDefault());
    click(link);
    click(document.querySelector("#view h1"));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("works for a click on an element inside the link", async () => {
    document.querySelector("#to-lib").innerHTML = "<span>Library</span>";
    start();
    click(document.querySelector("#to-lib span"));
    await settle();
    expect(heading()).toBe("All stories");
  });

  it("interceptTarget is a pure decision: nothing is fetched or navigated", () => {
    const link = document.querySelector("#to-lib");
    const event = { defaultPrevented: false, button: 0, target: link };
    expect(interceptTarget(event, { loc: location, base: "/Stories" }).pathname).toBe("/Stories/library/");
    expect(interceptTarget(event, { loc: location, base: "/other" })).toBeNull();
    expect(interceptTarget(event, { loc: location, base: "" }).pathname).toBe("/Stories/library/"); // no base: all paths
  });
});

describe("module remount", () => {
  it("unmounts the old view, then mounts the new one, in that order, with hooks between", async () => {
    const order = [];
    deps.unmountAll.mockImplementation(() => order.push("unmount"));
    deps.mountAll.mockImplementation(async () => { order.push("mount"); });
    const off = [onBeforeMount(() => order.push("before")), onAfterMount(() => order.push("after"))];
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(order).toEqual(["unmount", "before", "mount", "after"]);
    expect(deps.unmountAll).toHaveBeenCalledWith(document.getElementById("view"));
    expect(deps.mountAll).toHaveBeenCalledWith(document.getElementById("view"));
    off.forEach((f) => f());
  });

  it("a failing hook does not stop the swap", async () => {
    const off = onBeforeMount(() => { throw new Error("boom"); });
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(heading()).toBe("All stories");
    off();
  });

  it("falls back to a normal navigation when mounting throws", async () => {
    deps.mountAll.mockRejectedValue(new Error("module blew up"));
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(assign).toHaveBeenCalledWith(expect.stringContaining("/Stories/library/"));
  });
});

describe("fallbacks", () => {
  it.each([
    ["a 404", () => response("nope", { url: "http://localhost:3000/Stories/library/", status: 404 })],
    ["a non-HTML response", () => response("{}", { url: "http://localhost:3000/Stories/library/", type: "application/json" })],
    ["a redirect out of scope", () => response(pages["/Stories/library/"], { url: "https://example.com/x/" })],
    ["a page without #view", () => response("<html><body>plain</body></html>", { url: "http://localhost:3000/Stories/library/" })],
  ])("does a full navigation for %s", async (_name, make) => {
    fetchMock.mockImplementation(async () => make());
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(heading()).toBe("Welcome"); // nothing was swapped
  });

  it("does a full navigation when the fetch fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("only the latest of two quick clicks swaps", async () => {
    let release;
    fetchMock.mockImplementationOnce((href) => new Promise((resolve) => {
      release = () => resolve(response(pages["/Stories/library/"], { url: href }));
    }));
    start();
    click(document.querySelector("#to-lib"));
    router.navigate("/Stories/stories/a/");
    await settle();
    release();
    await settle();
    expect(heading()).toBe("A tale");
  });
});

describe("sanitising", () => {
  it("removes scripts, handlers and javascript: URLs but keeps ordinary content", () => {
    const doc = new DOMParser().parseFromString(
      `<main id="view"><h1 onclick="x()">Hi</h1><script>alert(1)</script><iframe src="/x"></iframe>
      <a href="javascript:alert(1)">bad</a><a href=" JaVa\tScript:alert(1)">bad2</a><a href="data:text/html,x">bad3</a>
      <img src="data:image/png;base64,AAAA" onerror="x()"><a href="/Stories/ok/">ok</a><svg onload="x()"><script>1</script></svg>
      <form action="javascript:x()"><button formaction="vbscript:x">b</button></form><style>*{}</style><noscript>n</noscript></main>`,
      "text/html",
    );
    const view = sanitizeView(doc.getElementById("view"));
    expect(view.querySelector("script, iframe, style, noscript")).toBeNull();
    for (const el of view.querySelectorAll("*")) {
      expect([...el.attributes].filter((a) => a.name.startsWith("on"))).toEqual([]);
    }
    const hrefs = [...view.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([null, null, null, "/Stories/ok/"]);
    expect(view.querySelector("img").getAttribute("src")).toMatch(/^data:image\/png/);
    expect(view.querySelector("form").hasAttribute("action")).toBe(false);
    expect(view.querySelector("button").hasAttribute("formaction")).toBe(false);
    expect(view.querySelector("h1").textContent).toBe("Hi");
  });

  it("never runs a fetched script during a swap", async () => {
    window.__ran = false;
    pages["/Stories/library/"] = page({ title: "Library", h1: "L", body: '<script>window.__ran = true</script><img src="x" onerror="window.__ran = true">' });
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(window.__ran).toBe(false);
    expect(document.querySelector("#view script")).toBeNull();
    pages["/Stories/library/"] = page({ title: "Library", h1: "All stories", body: '<a id="to-story" href="/Stories/stories/a/">A</a><div id="deep">deep</div>' });
  });
});

describe("build id", () => {
  const newer = () => {
    pages["/Stories/library/"] = page({ title: "Library", h1: "New build", build: "222" });
  };
  afterEach(() => {
    pages["/Stories/library/"] = page({ title: "Library", h1: "All stories", body: '<a id="to-story" href="/Stories/stories/a/">A</a><div id="deep">deep</div>' });
  });

  it("forces a full navigation when the fetched page is from a newer deploy", async () => {
    newer();
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(assign).toHaveBeenCalledWith("http://localhost:3000/Stories/library/");
    expect(heading()).toBe("Welcome");
    expect(location.pathname).toBe("/Stories/");
  });

  it("treats a page with no build id as a mismatch", async () => {
    pages["/Stories/library/"] = pages["/Stories/library/"].replace(/<meta name="build-id"[^>]*>/, "");
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("does not force again for the same URL right after a forced load (loop guard)", async () => {
    newer();
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(GUARD_KEY)).href).toBe("http://localhost:3000/Stories/library/");

    // The forced load landed on a page that still reports a mismatch.
    click(document.querySelector("#to-lib"));
    await settle();
    expect(assign).toHaveBeenCalledTimes(1); // not forced again
    expect(heading()).toBe("New build"); // swapped instead
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("different build"));
  });

  it("the guard survives a reload (sessionStorage) and expires after the window", async () => {
    newer();
    let clock = 1_000_000;
    router = startRouter({ ...deps, now: () => clock });
    click(document.querySelector("#to-lib"));
    await settle();
    expect(assign).toHaveBeenCalledTimes(1);
    router.stop();

    // New document: fresh router, same sessionStorage.
    router = startRouter({ ...deps, now: () => clock + 1000 });
    click(document.querySelector("#to-lib"));
    await settle();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(heading()).toBe("New build");

    // Much later the mismatch is a new event and forces once more.
    window.history.replaceState(null, "", "/Stories/");
    document.querySelector("#view").innerHTML = '<h1>Welcome</h1><a id="to-lib" href="/Stories/library/">Library</a>';
    router.stop();
    router = startRouter({ ...deps, now: () => clock + GUARD_WINDOW_MS + 1 });
    click(document.querySelector("#to-lib"));
    await settle();
    expect(assign).toHaveBeenCalledTimes(2);
  });

  it("a mismatch for a different URL is a separate navigation and forces", async () => {
    newer();
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    pages["/Stories/stories/a/"] = page({ title: "A tale", h1: "A tale", build: "222" });
    router.navigate("/Stories/stories/a/");
    await settle();
    expect(assign).toHaveBeenCalledTimes(2);
    pages["/Stories/stories/a/"] = page({ title: "A tale", h1: "A tale", body: '<p data-mount="story-resume">x</p>' });
  });
});

describe("kill switch", () => {
  it("the localStorage flag disables the router: no handler, no fetch, normal navigation", async () => {
    localStorage.setItem(KILL_KEY, "off");
    expect(routerDisabled()).toBe(true);
    expect(start()).toBeNull();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(outcomes).toEqual([false]); // not prevented, so the browser follows the link
    expect(fetchMock).not.toHaveBeenCalled();
    expect(heading()).toBe("Welcome");
  });

  it("the build flag (<html data-router=off>) disables it", () => {
    document.documentElement.dataset.router = "off";
    expect(routerDisabled()).toBe(true);
    expect(start()).toBeNull();
  });

  it("?router=off sets the device flag and ?router=on clears it", () => {
    applyRouterQuery("?router=off");
    expect(localStorage.getItem(KILL_KEY)).toBe("off");
    applyRouterQuery("?x=1");
    expect(localStorage.getItem(KILL_KEY)).toBe("off");
    applyRouterQuery("?router=on");
    expect(localStorage.getItem(KILL_KEY)).toBeNull();
    applyRouterQuery("?router=maybe");
    expect(localStorage.getItem(KILL_KEY)).toBeNull();
  });

  it("starting on an address with ?router=off turns the router off straight away", () => {
    window.history.replaceState(null, "", "/Stories/?router=off");
    expect(start()).toBeNull();
    expect(localStorage.getItem(KILL_KEY)).toBe("off");
  });

  it("is enabled by default", () => {
    expect(routerDisabled()).toBe(false);
    expect(start()).not.toBeNull();
  });

  it("survives blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(routerDisabled()).toBe(false);
  });
});

describe("scroll and focus", () => {
  it("moves focus to the new h1 without scrolling, and announces the title", async () => {
    start();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    click(document.querySelector("#to-lib"));
    await settle();
    const h1 = document.querySelector("#view h1");
    expect(document.activeElement).toBe(h1);
    expect(h1.getAttribute("tabindex")).toBe("-1");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    const live = document.querySelector('[data-role="router-announcer"]');
    expect(live.getAttribute("role")).toBe("status");
    expect(live.textContent).toBe(""); // cleared first so repeats are announced
    vi.advanceTimersByTime(150);
    expect(live.textContent).toBe("Library");
    expect(document.querySelectorAll('[data-role="router-announcer"]')).toHaveLength(1);
  });

  it("scrolls a forward navigation to the top, or to the #hash target", async () => {
    start();
    click(document.querySelector("#to-lib"));
    await settle();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await router.navigate("/Stories/library/#deep");
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("takes over scroll restoration and restores the saved position on Back", async () => {
    start();
    expect(history.scrollRestoration).toBe("manual");
    Object.defineProperty(window, "scrollY", { value: 480, configurable: true });
    click(document.querySelector("#to-lib"));
    await settle();
    // The Home entry now remembers where it was scrolled.
    expect(history.state).toEqual({ stories: true, scrollY: 0 });
    window.scrollTo.mockClear();
    window.history.replaceState({ stories: true, scrollY: 480 }, "", "/Stories/");
    window.dispatchEvent(new PopStateEvent("popstate", { state: { stories: true, scrollY: 480 } }));
    await settle();
    expect(heading()).toBe("Welcome");
    expect(window.scrollTo).toHaveBeenCalledWith(0, 480);
    expect(location.pathname).toBe("/Stories/");
    expect(document.activeElement).toBe(document.querySelector("#view h1"));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("a popstate within the same document (hash change) does not refetch", async () => {
    start();
    window.history.replaceState({ stories: true, scrollY: 0 }, "", "/Stories/#top");
    window.dispatchEvent(new PopStateEvent("popstate", { state: { stories: true, scrollY: 12 } }));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 12);
  });

  it("stop() puts the browser's scroll restoration back", () => {
    history.scrollRestoration = "auto";
    start();
    router.stop();
    expect(history.scrollRestoration).toBe("auto");
    router = null;
  });
});
