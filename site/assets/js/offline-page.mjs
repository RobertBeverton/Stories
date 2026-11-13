// data-mount="offline-page": the Offline page. A storage meter, an Everything row,
// one row per world that expands to a checklist of its stories, a selection bar and
// the progress of the running download. Titles, worlds, accents, icons and sizes come
// from library.json; what is saved comes from the offline store. Built with h() and
// textContent only, never innerHTML.
import { paletteByName } from "./accent-colors.mjs";
import { iconSvg } from "./cover.mjs";
import { h, renderIfChanged } from "./dom.mjs";
import { loadLibrary } from "./library.mjs";
import * as offline from "./offline.mjs";
import { failureWords, formatBytes, spaceCheck, spaceMessage, totalBytes } from "./offline-core.mjs";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const OFFLINE_NOTE = "You are offline. Saved stories still play.";

export function mount(el) {
  let store = null;
  try {
    if (offline.offlineSupported()) store = offline.getStore();
  } catch {
    store = null;
  }
  if (!store) {
    el.replaceChildren(h("p", { class: "empty" }, "This browser cannot save stories for offline."));
    return () => {};
  }

  let library = null;
  let info = { quota: undefined, usage: undefined };
  let notice = "";
  let disposed = false;
  const open = new Set();
  const picked = new Set();
  const timers = new Set();

  const meter = h("section", { class: "offline-meter", "aria-label": "Storage on this tablet" });
  const jobBox = h("div", { class: "offline-job", "data-role": "job", hidden: true });
  const noticeEl = h("p", { class: "offline-note", role: "status", "data-role": "notice" });
  const lists = h("div", { class: "offline-lists" });
  const selection = h("div", { class: "offline-selection", "data-role": "selection", hidden: true });
  el.replaceChildren(meter, jobBox, noticeEl, lists, selection);

  const online = () => navigator.onLine !== false;
  const withAudio = () => (library?.stories ?? []).filter((s) => s.audioUrl);
  const unsaved = (stories) => stories.filter((s) => store.status(s) !== "saved");
  const savedSlugs = (stories) => stories.filter((s) => store.status(s) === "saved").map((s) => s.slug);

  /** First press asks (and says so aloud), a second press within 4 seconds does it. */
  function twoStep(button, ask, spoken, action) {
    const label = button.textContent;
    let timer = null;
    const reset = () => {
      clearTimeout(timer);
      timers.delete(timer);
      timer = null;
      button.textContent = label;
    };
    button.addEventListener("click", () => {
      if (timer === null) {
        button.textContent = ask;
        setNotice(spoken);
        timer = setTimeout(() => {
          reset();
          if (notice === spoken) setNotice("");
        }, 4000);
        timers.add(timer);
        return;
      }
      reset();
      setNotice("");
      action();
    });
  }

  function setNotice(text) {
    notice = text;
    noticeEl.textContent = online() ? notice : OFFLINE_NOTE;
  }

  async function readInfo() {
    try {
      info = (await store.storageInfo()) ?? info;
    } catch {
      info = { quota: undefined, usage: undefined };
    }
  }

  async function refreshInfo() {
    await readInfo();
    if (!disposed) renderMeter();
  }

  async function saveStories(list) {
    if (list.length === 0) return;
    if (!online()) { setNotice(OFFLINE_NOTE); return; }
    await readInfo();
    if (disposed) return;
    const check = spaceCheck({ needBytes: totalBytes(list).bytes, ...info });
    if (!check.fits) { setNotice(spaceMessage(check)); renderMeter(); return; }
    setNotice("");
    picked.clear();
    try {
      await store.startJob(list);
    } catch { /* the job reports its own failures */ }
  }

  // ---- meter ----
  function renderMeter() {
    const saved = store.saved();
    const free = Number.isFinite(info.quota) && Number.isFinite(info.usage) ? Math.max(0, info.quota - info.usage) : null;
    const parts = [`Saved on this tablet ${formatBytes(saved.bytes)}`];
    if (free !== null) parts.push(`${formatBytes(free)} free`);
    const bar = free !== null
      ? h("progress", { class: "offline-bar", "data-role": "meter-bar", max: saved.bytes + free || 1, value: saved.bytes, "aria-label": "Storage used by saved stories" })
      : null;
    meter.replaceChildren(h("p", { class: "offline-meter-text", "data-role": "meter-text" }, parts.join(" · ")), bar);
  }

  // ---- job ----
  // A job finished before this page mounted is old news: do not show it. A job that
  // finishes while the page is open is shown (it is a different object).
  const startedWith = store.getJob();
  const staleJob = startedWith && (startedWith.state === "done" || startedWith.state === "cancelled") ? startedWith : null;
  let jobSig = "";
  let jobText = null;
  let jobBar = null;

  const jobProgress = (job) => (job.bytesTotal ? Math.min(99, Math.round((((job.bytesDone ?? 0) + (job.currentBytes ?? 0)) / job.bytesTotal) * 100)) : 0);
  const runningMessage = (job, pct) => `Saving ${Math.min(job.total, job.done + 1)} of ${job.total} \u00b7 ${pct}%`;

  /** Rebuilds the job box only when its shape changes; a progress tick just updates the bar and text in place. */
  function renderJob() {
    const job = store.getJob();
    const shown = job && job !== staleJob ? job : null;
    jobBox.hidden = !shown;
    if (!shown) { jobSig = ""; jobText = jobBar = null; jobBox.replaceChildren(); return; }
    const failed = shown.failed ?? [];
    const pct = jobProgress(shown);
    const sig = JSON.stringify([shown.state, failed, shown.total, shown.done, shown.state === "failed" ? shown.failedReasons ?? null : null]);
    if (sig === jobSig) {
      if (shown.state === "running" && jobBar && jobText) {
        jobBar.value = pct;
        jobText.textContent = runningMessage(shown, pct);
      }
      return;
    }
    jobSig = sig;
    jobText = jobBar = null;
    let message;
    const controls = [];
    if (shown.state === "running") {
      message = runningMessage(shown, pct);
      jobBar = h("progress", { class: "offline-bar", "data-role": "job-bar", max: 100, value: pct, "aria-label": "Download progress" });
      controls.push(jobBar, h("button", { type: "button", class: "btn", "data-role": "job-cancel" }, "Cancel"));
    } else if (shown.state === "done") {
      message = shown.total ? `Saved ${plural(shown.done, "story", "stories")}.` : "Everything chosen is already saved.";
    } else if (shown.state === "cancelled") {
      message = `Cancelled. ${plural(shown.done, "story", "stories")} saved.`;
    } else {
      message = `${failed.length} could not be saved`;
      const titles = new Map((library?.stories ?? []).map((s) => [s.slug, s.title]));
      const why = h("ul", { class: "offline-failures", "data-role": "job-failures" }, failed.map((slug) => {
        const reason = failureWords(shown.failedReasons?.[slug]) ?? "Try again";
        return h("li", {}, `${titles.get(slug) ?? slug}: ${reason}`);
      }));
      controls.push(why, h("button", { type: "button", class: "btn btn-primary", "data-role": "job-retry" }, "Retry"));
    }
    const hadFocus = jobBox.contains(document.activeElement);
    jobText = h("p", { "data-role": "job-text" }, message);
    jobBox.replaceChildren(jobText, ...controls);
    jobBox.querySelector('[data-role="job-cancel"]')?.addEventListener("click", () => store.cancel());
    jobBox.querySelector('[data-role="job-retry"]')?.addEventListener("click", () => {
      const again = new Set(failed);
      saveStories(withAudio().filter((s) => again.has(s.slug)));
    });
    if (hadFocus) (jobBox.querySelector("button") ?? jobText).focus?.();
  }

  // ---- the lists (rebuilt only when the saved set, the open worlds or the ticks change) ----
  function signature() {
    return JSON.stringify([
      withAudio().map((s) => [s.slug, store.status(s)]),
      [...open].sort(),
      [...picked].sort(),
      online(),
      store.getJob()?.state === "running",
    ]);
  }

  function focusKey(node) {
    if (!node || !lists.contains(node)) return null;
    const owner = node.closest("[data-world], [data-slug]");
    return { role: node.dataset.role, world: owner?.dataset.world, slug: owner?.dataset.slug };
  }

  function refocus(key) {
    if (!key) return;
    const find = (role, world, slug) => {
      for (const node of lists.querySelectorAll(`[data-role="${role}"]`)) {
        const owner = node.closest("[data-world], [data-slug]");
        if (owner?.dataset.world === world && owner?.dataset.slug === slug) return node;
      }
      return null;
    };
    const direct = find(key.role, key.world, key.slug);
    if (direct) { direct.focus(); return; }
    // A removed story swaps its Remove button for a checkbox: follow the focus there, or to its world.
    if (key.role === "story-remove") {
      const pick = find("story-pick", key.world, key.slug);
      if (pick) { pick.focus(); return; }
      lists.querySelector('[data-role="world-toggle"]')?.focus();
    }
  }

  function renderLists() {
    const all = withAudio();
    const key = focusKey(document.activeElement);
    const rebuilt = renderIfChanged(lists, signature(), () => {
      if (all.length === 0) return [h("p", { class: "empty" }, library ? "No stories with audio yet." : "")];
      const busy = store.getJob()?.state === "running";
      const left = unsaved(all);
      const savedAll = savedSlugs(all);
      const leftSize = totalBytes(left);

      const everything = h(
        "section",
        { class: "offline-row offline-all", "data-role": "all" },
        h("div", { class: "offline-row-text" },
          h("h2", { class: "offline-row-title" }, "Everything"),
          h("p", { class: "offline-row-detail", "data-role": "all-detail" },
            `${plural(all.length, "story", "stories")} · ${savedAll.length} saved${left.length ? ` · ${formatBytes(leftSize.bytes, leftSize.exact)} left to save` : ""}`)),
        h("div", { class: "offline-row-actions" },
          h("button", { type: "button", class: "btn btn-primary", "data-role": "all-save", disabled: busy || !online() || left.length === 0 }, "Save all"),
          savedAll.length ? h("button", { type: "button", class: "btn", "data-role": "all-remove", disabled: busy }, "Remove all") : null),
      );
      everything.querySelector('[data-role="all-save"]').addEventListener("click", () => saveStories(left));
      const removeAll = everything.querySelector('[data-role="all-remove"]');
      if (removeAll) {
        twoStep(removeAll, "Remove all? Tap again",
          `Tap Remove all again to delete ${plural(savedAll.length, "saved story", "saved stories")} from this tablet.`,
          () => store.removeMany(savedAll));
      }

      const parts = [everything];
      if (!online() && store.saved().count === 0) {
        parts.unshift(h("p", { class: "empty", "data-role": "offline-empty" }, "You are offline and nothing is saved on this tablet yet. Connect to save stories."));
      }
      for (const world of library.worlds ?? []) {
        const section = worldSection(world, all.filter((s) => s.world === world.name), busy);
        if (section) parts.push(section);
      }
      return parts;
    });
    if (rebuilt) refocus(key);
    renderSelection();
  }

  function worldSection(world, stories, busy) {
    if (stories.length === 0) return null;
    const left = unsaved(stories);
    const savedIn = savedSlugs(stories);
    const size = totalBytes(left);
    const accent = paletteByName(world.accent);
    const expanded = open.has(world.name);
    const section = h(
      "section",
      { class: "offline-row offline-world", "data-role": "world", "data-world": world.name, style: accent ? `--tile: ${accent.background}; --tile-ink: ${accent.text};` : null },
      h("span", { class: "offline-world-icon" }, iconSvg(world.icon)),
      h("button", { type: "button", class: "offline-world-toggle", "data-role": "world-toggle", "aria-expanded": String(expanded) },
        h("span", { class: "offline-row-title" }, world.title),
        h("span", { class: "offline-row-detail", "data-role": "world-detail" },
          `${savedIn.length} of ${stories.length} saved${left.length ? ` · ${formatBytes(size.bytes, size.exact)} to save` : ""}`)),
      h("div", { class: "offline-row-actions" },
        left.length ? h("button", { type: "button", class: "btn btn-primary", "data-role": "world-save", disabled: busy || !online() }, "Save") : null,
        savedIn.length ? h("button", { type: "button", class: "btn", "data-role": "world-remove", disabled: busy }, "Remove") : null),
    );
    section.querySelector('[data-role="world-toggle"]').addEventListener("click", () => {
      if (open.has(world.name)) open.delete(world.name); else open.add(world.name);
      renderLists();
    });
    section.querySelector('[data-role="world-save"]')?.addEventListener("click", () => saveStories(left));
    const remove = section.querySelector('[data-role="world-remove"]');
    if (remove) {
      twoStep(remove, "Remove? Tap again",
        `Tap Remove again to delete ${plural(savedIn.length, "saved story", "saved stories")} of ${world.title} from this tablet.`,
        () => store.removeMany(savedIn));
    }
    if (expanded) section.append(storyList(stories, busy));
    return section;
  }

  function storyList(stories, busy) {
    return h("ul", { class: "offline-stories" }, stories.map((story) => {
      const status = store.status(story);
      const bytes = totalBytes([story]);
      const sizeText = formatBytes(bytes.bytes, bytes.exact);
      const state = status === "saved" ? "Saved" : status === "stale" ? "Update available" : "Not saved";
      const control = status === "saved"
        ? h("button", { type: "button", class: "btn", "data-role": "story-remove", "aria-label": `Remove ${story.title}`, disabled: busy }, "Remove")
        : h("input", { type: "checkbox", "data-role": "story-pick", "aria-label": `Select ${story.title}, ${sizeText}`, checked: picked.has(story.slug), disabled: busy || !online() });
      const li = h("li", { class: "offline-story", "data-role": "story", "data-slug": story.slug },
        control,
        h("span", { class: "offline-story-title" }, story.title),
        h("span", { class: "offline-story-size" }, sizeText),
        h("span", { class: "offline-story-state", "data-role": "story-state" }, state));
      li.querySelector('[data-role="story-pick"]')?.addEventListener("change", (e) => {
        if (e.target.checked) picked.add(story.slug); else picked.delete(story.slug);
        renderLists();
      });
      li.querySelector('[data-role="story-remove"]')?.addEventListener("click", () => store.removeMany([story.slug]));
      return li;
    }));
  }

  function renderSelection() {
    const chosen = withAudio().filter((s) => picked.has(s.slug) && store.status(s) !== "saved");
    selection.hidden = chosen.length === 0;
    if (chosen.length === 0) { selection.replaceChildren(); return; }
    const size = totalBytes(chosen);
    const save = h("button", { type: "button", class: "btn btn-primary", "data-role": "selection-save" }, `Save ${plural(chosen.length, "story", "stories")} · ${formatBytes(size.bytes, size.exact)}`);
    const clear = h("button", { type: "button", class: "btn", "data-role": "selection-clear" }, "Clear");
    save.addEventListener("click", () => saveStories(chosen));
    clear.addEventListener("click", () => { picked.clear(); renderLists(); });
    selection.replaceChildren(save, clear);
  }

  function renderAll() {
    if (disposed) return;
    noticeEl.textContent = online() ? notice : OFFLINE_NOTE;
    renderMeter();
    renderJob();
    renderLists();
  }

  // The storage estimate is read when a job starts or ends, and at most every 2 seconds otherwise,
  // not on each ~250 ms progress notification.
  let infoState = null;
  let infoAt = 0;
  const stop = store.subscribe(() => {
    renderAll();
    const state = store.getJob()?.state ?? null;
    const now = Date.now();
    if (state !== infoState || now - infoAt >= 2000) {
      infoState = state;
      infoAt = now;
      refreshInfo();
    }
  });
  const onNet = () => renderAll();
  window.addEventListener("online", onNet);
  window.addEventListener("offline", onNet);

  renderMeter();
  loadLibrary().then(async (lib) => {
    if (disposed || !lib) return;
    library = lib;
    if (online()) {
      try { await store.reconcile(withAudio()); } catch { /* try again next visit */ }
    }
    renderAll();
    refreshInfo();
  }).catch(() => {});

  return () => {
    disposed = true;
    stop();
    for (const timer of timers) clearTimeout(timer);
    window.removeEventListener("online", onNet);
    window.removeEventListener("offline", onNet);
  };
}
