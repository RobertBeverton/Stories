// @vitest-environment jsdom
// A router swap can unmount a view while one of its modules is still being
// imported. The late module must not mount onto a detached element (nothing would
// ever unmount it), and a mount that does slip through is unmounted at once.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLibrary } from "../../site/assets/js/library.mjs";
import { stubLibraryFetch } from "./helpers.mjs";

const gate = vi.hoisted(() => {
  const state = { release: () => {}, wait: null, mount: null, unmount: null };
  return state;
});

// text-size stands in for "a module whose dynamic import is slow".
vi.mock("../../site/assets/js/text-size.mjs", async () => {
  await gate.wait;
  return { mount: (el) => gate.mount(el) };
});

let main;

beforeEach(async () => {
  localStorage.clear();
  resetLibrary();
  stubLibraryFetch();
  gate.wait = new Promise((resolve) => { gate.release = resolve; });
  gate.unmount = vi.fn();
  gate.mount = vi.fn(() => gate.unmount);
  document.documentElement.dataset.base = "/Stories";
  document.body.replaceChildren();
  vi.resetModules(); // the mock factory (and its gate) runs again for each test
  main = await import("../../site/assets/js/main.js"); // its own start-up mount finds an empty page
  document.body.innerHTML = '<main id="view"><fieldset data-mount="text-size"></fieldset></main>';
});
afterEach(() => {
  main.unmountAll();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("mountAll racing unmountAll", () => {
  it("does not mount a module whose element left the page while it was importing", async () => {
    const view = document.getElementById("view");
    const pending = main.mountAll(view);
    main.unmountAll(view);
    view.replaceChildren(); // the router swapped the view
    gate.release();
    await pending;
    expect(gate.mount).not.toHaveBeenCalled();
  });

  it("does not mount onto an element that was unmounted but is still in the page", async () => {
    const view = document.getElementById("view");
    const pending = main.mountAll(view);
    main.unmountAll(view); // the claim is released
    gate.release();
    await pending;
    expect(gate.mount).not.toHaveBeenCalled();
    // and a later mount of the same element works normally
    await main.mountAll(view);
    expect(gate.mount).toHaveBeenCalledTimes(1);
  });

  it("calls the unmount of a mount that completes after its claim was released", async () => {
    const view = document.getElementById("view");
    const el = view.firstElementChild;
    gate.mount = vi.fn((target) => {
      main.unmountAll(view); // released during mount itself
      expect(target).toBe(el);
      return gate.unmount;
    });
    gate.release();
    await main.mountAll(view);
    expect(gate.mount).toHaveBeenCalledTimes(1);
    expect(gate.unmount).toHaveBeenCalledTimes(1);
  });

  it("mounts normally when nothing interferes, and unmounts once", async () => {
    gate.release();
    const view = document.getElementById("view");
    await main.mountAll(view);
    expect(gate.mount).toHaveBeenCalledTimes(1);
    main.unmountAll(view);
    expect(gate.unmount).toHaveBeenCalledTimes(1);
  });
});
