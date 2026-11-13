// data-mount="offline-save" data-slug="<slug>": the story page's "Save for offline" button.
// States: Save for offline · 28 MB, Saving 40% · tap to cancel, Waiting to save,
// Saved for offline (a pressed toggle; a press removes it), Update available · 28 MB,
// Retry · 28 MB after a failure (with the reason in plain words).
// Title, size and audio URL come from library.json, never from the page or storage.
import { h } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import * as offline from "./offline.mjs";
import { failureWords, formatBytes, spaceCheck, spaceMessage, storyBytes } from "./offline-core.mjs";

export function mount(el) {
  const slug = el.dataset.slug;
  if (!slug || !offline.offlineSupported()) {
    el.hidden = true;
    return () => {};
  }
  const store = offline.getStore();
  const button = h("button", { type: "button", class: "btn offline-save-button", "data-role": "save", disabled: "" });
  const note = h("p", { class: "offline-note", role: "status", "aria-live": "polite", "data-role": "note" });
  el.replaceChildren(button, note);
  let story = null;
  let message = "";
  let checking = false;
  let disposed = false;

  function size() {
    const b = storyBytes(story);
    return b.bytes ? ` · ${formatBytes(b.bytes, b.exact)}` : "";
  }

  const queuedIn = (job, status) => job?.state === "running" && job.slugs.includes(slug) && status !== "saved";

  function render() {
    if (disposed || !story) return;
    const status = store.status(story);
    const job = store.getJob();
    const queued = queuedIn(job, status);
    const failed = job?.state === "error" && job.failed?.includes(slug) && status !== "saved";
    button.removeAttribute("aria-pressed");
    button.dataset.state = "none";
    button.disabled = false;
    if (queued && job.current === slug) {
      const total = storyBytes(story).bytes;
      const pct = total ? Math.min(99, Math.round((job.currentBytes / total) * 100)) : 0;
      button.dataset.state = "saving";
      button.textContent = `Saving ${pct}% · tap to cancel`;
    } else if (queued) {
      button.dataset.state = "queued";
      button.textContent = "Waiting to save";
    } else if (status === "saved") {
      button.dataset.state = "saved";
      button.setAttribute("aria-pressed", "true");
      button.textContent = "Saved for offline";
    } else if (status === "stale") {
      button.dataset.state = "stale";
      button.textContent = `Update available${size()}`;
    } else if (failed) {
      button.dataset.state = "error";
      button.textContent = `Retry${size()}`;
    } else {
      button.textContent = `Save for offline${size()}`;
    }
    let text = message;
    if (!text && failed) {
      const why = failureWords(job.failedReasons?.[slug]);
      text = why ? `Could not save: ${why}.` : "Could not save. Try again.";
    }
    note.textContent = text;
  }

  async function onClick() {
    if (!story || checking) return;
    const status = store.status(story);
    if (queuedIn(store.getJob(), status)) return store.cancel();
    if (status === "saved") return store.remove(slug);
    message = "";
    checking = true;
    try {
      const info = await store.storageInfo();
      const check = spaceCheck({ needBytes: storyBytes(story).bytes, ...info });
      if (!check.fits) {
        message = spaceMessage(check);
        render();
        return;
      }
      render();
      store.startJob([story])?.catch?.(() => {});
    } finally {
      checking = false;
    }
  }

  button.addEventListener("click", onClick);
  const stop = store.subscribe(() => { message = ""; render(); });
  loadLibrary().then((lib) => {
    if (disposed) return;
    story = lib?.bySlug.get(slug) ?? null;
    if (!story?.audioUrl) el.hidden = true;
    else render();
  });

  return () => {
    disposed = true;
    button.removeEventListener("click", onClick);
    stop();
  };
}
