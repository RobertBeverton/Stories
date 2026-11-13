// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerOffline } from "../../site/assets/js/offline-register.mjs";

function fakeNav() {
  const registration = { unregister: vi.fn(async () => true) };
  return {
    registration,
    serviceWorker: {
      register: vi.fn(async () => registration),
      getRegistrations: vi.fn(async () => [registration]),
    },
  };
}

describe("registerOffline", () => {
  beforeEach(() => localStorage.clear());

  it("registers a module worker at <base>/sw.js with the base as scope", async () => {
    const nav = fakeNav();
    await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "" });
    expect(nav.serviceWorker.register).toHaveBeenCalledWith("/Stories/sw.js", { scope: "/Stories/", type: "module", updateViaCache: "none" });
  });

  it("does nothing without service worker support", async () => {
    expect(await registerOffline({ nav: {}, base: "/Stories", storage: localStorage, search: "" })).toBeNull();
  });

  it("?sw=off turns it off, unregisters and remembers", async () => {
    const nav = fakeNav();
    await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "?sw=off" });
    expect(nav.serviceWorker.register).not.toHaveBeenCalled();
    expect(nav.registration.unregister).toHaveBeenCalled();
    expect(localStorage.getItem("stories-sw")).toBe("off");
  });

  it("stays off on the next page, and ?sw=on turns it back on", async () => {
    localStorage.setItem("stories-sw", "off");
    const nav = fakeNav();
    await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "" });
    expect(nav.serviceWorker.register).not.toHaveBeenCalled();
    await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "?sw=on" });
    expect(nav.serviceWorker.register).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("stories-sw")).toBeNull();
  });

  it("swallows a registration failure", async () => {
    const nav = fakeNav();
    nav.serviceWorker.register = vi.fn(async () => { throw new Error("blocked"); });
    expect(await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "" })).toBeNull();
  });
});
