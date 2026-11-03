// data-mount="dock": the fixed chrome at the bottom. The server renders the real
// Home and Library links; this module adds the mini-player row (title,
// play/pause, a button that opens the player sheet) and the player sheet (seek,
// skip, speed, sleep timer, a link to the story). It also starts the persistent
// player (player.mjs) and the sleep timer for the <audio> outside #view.
//
// The dock lives outside #view, so the router never unmounts it. It listens to
// the router's hooks to re-bind the audio to the new page and to re-assert
// Media Session handlers that a page module may have cleared when it unmounted.
//
// Accessibility: the sheet is a modal dialog (labelled, focus trapped, Escape
// closes, the rest of the page is inert while open, focus returns to the
// opener). The live region announces user-triggered actions only (sleep timer,
// speed), never playback progress or part changes.
import { cover } from "./cover.mjs";
import { h } from "./dom.mjs";
import { safeHref } from "./escape.mjs";
import { createPlayer, SKIP_SEC, SPEEDS } from "./player.mjs";
import { onAfterMount, onBeforeMount } from "./router.mjs";
import { createSleepTimer, SLEEP_MINUTES } from "./sleep-timer.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const PATHS = {
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zM14 5h4v14h-4z",
  prev: "M6 6h2v12H6zM9.5 12 18 18V6z",
  next: "M16 6h2v12h-2zM14.5 12 6 18V6z",
  back: "M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z",
  forward: "M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z",
};

function icon(name, label) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", PATHS[name]);
  svg.append(path);
  if (label) {
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", "12");
    text.setAttribute("y", "15.5");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "7");
    text.setAttribute("font-weight", "700");
    text.setAttribute("class", "icon-label");
    text.textContent = label;
    svg.append(text);
  }
  return svg;
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

/** "2 minutes 5 seconds", for the seek slider's aria-valuetext. */
export function spokenTime(seconds) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const parts = [];
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (secs || parts.length === 0) parts.push(`${secs} ${secs === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}

const speedLabel = (rate) => `${rate}×`;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function mount(el) {
  const audio = document.querySelector('audio[data-role="shell-audio"]') ?? document.querySelector("audio#player");
  if (!audio) return () => {}; // a page without the shell's audio element has no dock player

  const player = createPlayer(audio);
  const timer = createSleepTimer(audio);
  const disposers = [];
  let sheetOpen = false;
  let opener = null;
  let seeking = false;
  let inerted = [];

  player.syncPage();
  const stopBefore = onBeforeMount(() => {
    closeSheet({ restoreFocus: false });
    player.syncPage();
  });
  const stopAfter = onAfterMount(() => player.refreshSession());

  // --- DOM ------------------------------------------------------------------
  let mini = el.querySelector('[data-dock-slot="mini"]');
  const ownMini = !mini;
  if (ownMini) {
    mini = h("div", { class: "dock-mini", "data-dock-slot": "mini" });
    el.prepend(mini);
  }

  const announcer = h("div", { class: "visually-hidden", role: "status", "aria-live": "polite", "data-role": "dock-announcer" });
  const miniOpen = h("button", { type: "button", class: "dock-mini-open", "aria-haspopup": "dialog", "aria-expanded": "false", "data-role": "open-player" },
    h("span", { class: "dock-mini-title", "data-role": "mini-title" }));
  const miniToggle = h("button", { type: "button", class: "btn btn-primary btn-icon btn-lg", "data-role": "mini-toggle" });

  const closeButton = h("button", { type: "button", class: "btn player-close", "data-role": "close", "aria-label": "Close player" }, "Close");
  const coverSlot = h("div", { class: "player-cover-slot" });
  const title = h("h2", { class: "player-title", id: "player-sheet-title", "data-role": "title" });
  const world = h("p", { class: "player-world", "data-role": "world" });
  const storyLink = h("a", { class: "btn player-story-link", "data-role": "story-link" }, "Read the story");
  const seekInput = h("input", { type: "range", min: "0", max: "0", step: "1", value: "0", "aria-label": "Seek", "data-role": "seek" });
  const elapsed = h("span", { "data-role": "elapsed" }, "0:00");
  const remaining = h("span", { "data-role": "remaining" }, "0:00");
  const prevButton = h("button", { type: "button", class: "btn", "data-role": "previous" }, icon("prev"));
  const backButton = h("button", { type: "button", class: "btn", "data-role": "back", "aria-label": `Back ${SKIP_SEC} seconds` }, icon("back", String(SKIP_SEC)));
  const playButton = h("button", { type: "button", class: "btn btn-primary player-play", "data-role": "play" });
  const forwardButton = h("button", { type: "button", class: "btn", "data-role": "forward", "aria-label": `Forward ${SKIP_SEC} seconds` }, icon("forward", String(SKIP_SEC)));
  const nextButton = h("button", { type: "button", class: "btn", "data-role": "next", "aria-label": "Next story" }, icon("next"));
  const speedButton = h("button", { type: "button", class: "btn", "data-role": "speed" });
  const sleepStatus = h("p", { class: "player-sleep-status", "data-role": "sleep-status" });
  const errorBox = h("div", { class: "player-error", role: "alert", hidden: true, "data-role": "error" },
    h("p", {}, "This story's audio would not load."),
    h("button", { type: "button", class: "btn", "data-role": "retry" }, "Try again"));
  const sleepButtons = [
    h("button", { type: "button", class: "btn", "data-role": "sleep-off", "aria-pressed": "true" }, "Off"),
    ...SLEEP_MINUTES.map((m) => h("button", { type: "button", class: "btn", "data-role": "sleep", "data-minutes": m, "aria-pressed": "false" }, `${m} min`)),
  ];
  const sleepGroup = h("div", { class: "player-sleep", role: "group", "aria-label": "Sleep timer" }, ...sleepButtons);

  const sheet = h("section", {
    class: "player-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "player-sheet-title", hidden: true, "data-role": "player-sheet",
  },
  closeButton, coverSlot, title, world, storyLink,
  h("div", { class: "player-seek" }, seekInput, h("div", { class: "player-time" }, elapsed, remaining)),
  h("div", { class: "player-controls" }, prevButton, backButton, playButton, forwardButton, nextButton),
  h("div", { class: "player-options" }, speedButton),
  h("div", { class: "player-sleep-wrap" }, h("h3", { class: "player-sleep-title" }, "Sleep timer"), sleepGroup, sleepStatus),
  errorBox);

  mini.replaceChildren(miniOpen, miniToggle);
  el.append(announcer, sheet);

  function listen(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    disposers.push(() => target.removeEventListener(type, fn, options));
  }
  const announce = (text) => {
    announcer.textContent = "";
    setTimeout(() => { announcer.textContent = text; }, 50);
  };

  // --- rendering --------------------------------------------------------------
  let coverSlug = null;
  function render() {
    const s = player.state();
    const name = s.story?.title ?? (s.slug ? "Story" : "");
    const show = s.active && Boolean(s.slug);
    mini.hidden = !show;
    document.body.classList.toggle("has-mini-player", show);
    miniOpen.querySelector('[data-role="mini-title"]').textContent = name;
    miniOpen.setAttribute("aria-label", `Open player: ${name}`);

    const verb = s.playing ? "Pause" : s.ended ? "Play again" : "Play";
    const label = `${verb} ${name}`.trim();
    for (const button of [miniToggle, playButton]) {
      button.setAttribute("aria-label", label);
      button.dataset.state = s.playing ? "playing" : "paused";
      button.replaceChildren(icon(s.playing ? "pause" : "play"));
    }

    title.textContent = name;
    world.textContent = s.slug ? s.world : "";
    if (s.story) {
      storyLink.hidden = false;
      storyLink.setAttribute("href", safeHref(s.story.url));
      if (coverSlug !== s.slug) {
        coverSlug = s.slug;
        coverSlot.replaceChildren(cover(s.story, "player-cover"));
      }
    } else {
      storyLink.hidden = true;
    }
    prevButton.setAttribute("aria-label", s.hasPrevStory ? "Previous story, or start of this one" : "Back to the start");
    nextButton.hidden = !s.hasNext;
    speedButton.textContent = speedLabel(s.rate);
    speedButton.setAttribute("aria-label", `Speed ${speedLabel(s.rate)}. Change speed`);
    errorBox.hidden = !s.error;
    renderTime();
  }

  function renderTime() {
    const s = player.state();
    const total = s.duration ?? 0;
    seekInput.max = String(Math.floor(total));
    seekInput.disabled = !total;
    if (!seeking) seekInput.value = String(Math.floor(s.currentTime));
    seekInput.setAttribute("aria-valuetext", `${spokenTime(s.currentTime)} of ${spokenTime(total)}`);
    elapsed.textContent = formatTime(s.currentTime);
    remaining.textContent = total ? `-${formatTime(Math.max(0, total - s.currentTime))}` : "";
  }

  function renderSleep(state = timer.state()) {
    for (const button of sleepButtons) {
      const minutes = Number(button.dataset.minutes ?? 0);
      button.setAttribute("aria-pressed", String(state.active ? minutes === state.minutes : button.dataset.role === "sleep-off"));
    }
    if (!state.active) sleepStatus.textContent = "";
    else {
      const left = Math.max(1, Math.ceil(state.remainingMs / 60_000));
      sleepStatus.textContent = `Sleep timer: about ${left} ${left === 1 ? "minute" : "minutes"} left`;
    }
  }
  // The countdown text refreshes once a second, only while the sheet is open.
  let sleepTick = 0;
  function startTick() {
    clearInterval(sleepTick);
    sleepTick = setInterval(() => renderSleep(), 1000);
  }

  // --- the sheet --------------------------------------------------------------
  function setInert(on) {
    if (on) {
      inerted = [document.getElementById("view"), ...[...el.children].filter((c) => c !== sheet && c !== announcer)].filter(Boolean);
      for (const node of inerted) node.setAttribute("inert", "");
    } else {
      for (const node of inerted) node.removeAttribute("inert");
      inerted = [];
    }
  }
  function openSheet() {
    if (sheetOpen) return;
    sheetOpen = true;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : miniOpen;
    sheet.hidden = false;
    sheet.dataset.open = "";
    miniOpen.setAttribute("aria-expanded", "true");
    setInert(true);
    render();
    renderSleep();
    startTick();
    closeButton.focus();
  }
  function closeSheet({ restoreFocus = true } = {}) {
    if (!sheetOpen) return;
    sheetOpen = false;
    clearInterval(sleepTick);
    sheet.hidden = true;
    delete sheet.dataset.open;
    miniOpen.setAttribute("aria-expanded", "false");
    setInert(false);
    if (restoreFocus) (opener?.isConnected ? opener : miniOpen).focus();
    opener = null;
  }
  function trapTab(event) {
    const items = [...sheet.querySelectorAll(FOCUSABLE)].filter((node) => !node.hidden && !node.closest("[hidden]"));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !sheet.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !sheet.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  }

  // --- wiring -----------------------------------------------------------------
  listen(miniOpen, "click", openSheet);
  listen(miniToggle, "click", () => player.toggle());
  listen(playButton, "click", () => player.toggle());
  listen(closeButton, "click", () => closeSheet());
  listen(backButton, "click", () => player.skip(-SKIP_SEC));
  listen(forwardButton, "click", () => player.skip(SKIP_SEC));
  listen(prevButton, "click", () => player.previous());
  listen(nextButton, "click", () => player.next());
  listen(storyLink, "click", () => closeSheet({ restoreFocus: false })); // the router (or the browser) then navigates
  listen(errorBox.querySelector('[data-role="retry"]'), "click", () => player.retry());
  listen(speedButton, "click", () => {
    const rate = player.state().rate;
    const next = SPEEDS[(SPEEDS.findIndex((r) => r === rate) + 1) % SPEEDS.length] ?? 1;
    player.setRate(next);
    announce(`Speed ${speedLabel(next)}`);
  });
  listen(seekInput, "input", () => {
    seeking = true;
    player.seek(Number(seekInput.value));
  });
  listen(seekInput, "change", () => {
    seeking = false;
  });
  listen(seekInput, "blur", () => {
    seeking = false;
  });
  listen(sleepGroup, "click", (event) => {
    const button = event.target.closest?.("button");
    if (!button) return;
    if (button.dataset.role === "sleep-off") {
      timer.cancel();
      announce("Sleep timer off");
    } else {
      const minutes = Number(button.dataset.minutes);
      timer.start(minutes);
      announce(`Sleep timer set for ${minutes} minutes`);
    }
  });
  listen(document, "keydown", (event) => {
    if (!sheetOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeSheet();
    } else if (event.key === "Tab") {
      trapTab(event);
    }
  });

  disposers.push(player.onChange(render));
  disposers.push(player.onTime(() => { if (sheetOpen) renderTime(); }));
  disposers.push(timer.onChange((state) => {
    renderSleep(state);
    if (!state.active && !state.fading) render();
  }));
  render();

  return () => {
    closeSheet({ restoreFocus: false });
    stopBefore();
    stopAfter();
    for (const dispose of disposers.splice(0).reverse()) dispose();
    timer.dispose();
    player.dispose();
    clearInterval(sleepTick);
    document.body.classList.remove("has-mini-player");
    sheet.remove();
    announcer.remove();
    if (ownMini) mini.remove();
    else mini.replaceChildren();
  };
}
