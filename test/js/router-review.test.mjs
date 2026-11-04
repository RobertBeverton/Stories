// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nav } from "../../site/assets/js/nav.mjs";
import { docKey, startRouter } from "../../site/assets/js/router.mjs";

const page = (h1, body = "") => `<!doctype html><html data-base="/Stories"><head><title>${h1}</title>
<meta name="build-id" content="1"></head><body><main id="view"><h1>${h1}</h1>${body}</main></body></html>`;
const pages = {
  "/Stories/": page("Home"),
  "/Stories/library/": page("Library", "<div id='x'>x</div>"),
  "/Stories/stories/a/": page("A tale"),
};
const deps = () => ({ mountAll: async () => {}, unmountAll: () => {} });

let router;
beforeEach(() => {
  window.history.replaceState(null, "", "/Stories/");
  document.documentElement.dataset.base = "/Stories";
  document.head.innerHTML = "<meta name='build-id' content='1'>";
  document.body.innerHTML = "<main id='view'><h1>Home</h1></main>";
  vi.stubGlobal("fetch", vi.fn(async (href) => ({
    ok: true, status: 200, url: href, headers: { get: () => "text/html" }, text: async () => pages[new URL(href).pathname] ?? "",
  })));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(nav, "go").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  router?.stop();
  router = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe("nav.open", () => {
  it("falls back to a full load without a router", () => {
    nav.open("/Stories/library/");
    expect(nav.go).toHaveBeenCalledWith("/Stories/library/");
  });

  it("goes through the router while it runs (so audio keeps playing), and not after stop()", async () => {
    router = startRouter(deps());
    nav.open("/Stories/library/");
    await settle();
    expect(document.querySelector("#view h1").textContent).toBe("Library");
    expect(nav.go).not.toHaveBeenCalled();
    router.stop();
    nav.open("/Stories/");
    expect(nav.go).toHaveBeenCalledWith("/Stories/");
  });
});

describe("docKey", () => {
  it("ignores ?autoplay=1 but keeps other query parameters", () => {
    expect(docKey(new URL("https://x/Stories/stories/a/?autoplay=1"))).toBe("/Stories/stories/a/");
    expect(docKey(new URL("https://x/Stories/library/?q=a&autoplay=1"))).toBe("/Stories/library/?q=a");
  });

  it("keeps remembering scroll after story-resume strips ?autoplay=1 from the address", async () => {
    router = startRouter(deps());
    router.navigate("/Stories/stories/a/?autoplay=1");
    await settle();
    window.history.replaceState(window.history.state, "", "/Stories/stories/a/"); // what story-resume does
    Object.defineProperty(window, "scrollY", { value: 321, configurable: true });
    window.dispatchEvent(new Event("pagehide"));
    expect(window.history.state.scrollY).toBe(321);
  });
});

describe("a malformed #hash", () => {
  it("does not throw or force a full page load", async () => {
    router = startRouter(deps());
    await router.navigate("/Stories/library/#%E0%A4%A");
    await settle();
    expect(document.querySelector("#view h1").textContent).toBe("Library");
    expect(nav.go).not.toHaveBeenCalled();
  });
});
