// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerOffline } from "../../site/assets/js/offline-register.mjs";

function fakeNav() {
  const registration = { scope: new URL("/Stories/", location.href).href, unregister: vi.fn(async () => true) };
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

  it("?sw=off unregisters only this app's registration, not another app on the origin", async () => {
    const nav = fakeNav();
    const foreign = { scope: new URL("/Other/", location.href).href, unregister: vi.fn(async () => true) };
    nav.serviceWorker.getRegistrations = vi.fn(async () => [foreign, nav.registration]);
    await registerOffline({ nav, base: "/Stories", storage: localStorage, search: "?sw=off" });
    expect(nav.registration.unregister).toHaveBeenCalled();
    expect(foreign.unregister).not.toHaveBeenCalled();
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

  describe("reconcile after registering", () => {
    const stories = [{ slug: "a", audioUrl: "https://x/a.mp3" }, { slug: "b" }];
    const run = (over = {}) => {
      const reconcileStories = vi.fn(async () => {});
      const p = registerOffline({
        nav: fakeNav(), base: "/Stories", storage: localStorage, search: "", reconcile: true,
        supported: () => true, loadLibrary: async () => ({ stories }), reconcileStories, online: () => true, ...over,
      });
      return { reconcileStories, p };
    };
    const settle = async (p) => { await p; await new Promise((r) => setTimeout(r, 100)); };

    it("reconciles the saved stories once registered and the library loads", async () => {
      const { reconcileStories, p } = run();
      await settle(p);
      expect(reconcileStories).toHaveBeenCalledWith([stories[0]]);
    });

    it("never reconciles when the library failed to load", async () => {
      const { reconcileStories, p } = run({ loadLibrary: async () => null });
      await settle(p);
      expect(reconcileStories).not.toHaveBeenCalled();
    });

    it("never reconciles when there are no stories with audio", async () => {
      const { reconcileStories, p } = run({ loadLibrary: async () => ({ stories: [{ slug: "b" }] }) });
      await settle(p);
      expect(reconcileStories).not.toHaveBeenCalled();
    });

    it("does nothing when offline is unsupported or the device is offline", async () => {
      const a = run({ supported: () => false });
      const b = run({ online: () => false });
      await settle(a.p); await settle(b.p);
      expect(a.reconcileStories).not.toHaveBeenCalled();
      expect(b.reconcileStories).not.toHaveBeenCalled();
    });

    it("swallows a failure and still resolves the registration", async () => {
      const { p } = run({ loadLibrary: async () => { throw new Error("boom"); } });
      await expect(p).resolves.toBeTruthy();
      await new Promise((r) => setTimeout(r, 100));
    });

    it("does not reconcile when registration failed or reconcile is off", async () => {
      const nav = fakeNav();
      nav.serviceWorker.register = vi.fn(async () => { throw new Error("blocked"); });
      const a = run({ nav });
      const b = run({ reconcile: false });
      await settle(a.p); await settle(b.p);
      expect(a.reconcileStories).not.toHaveBeenCalled();
      expect(b.reconcileStories).not.toHaveBeenCalled();
    });
  });
});
