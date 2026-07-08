const script = document.currentScript;
const slug = script.dataset.slug;
const storageKey = `story-progress:${slug}`;
const audio = document.getElementById("story-audio");
const banner = document.getElementById("resume-banner");
banner.setAttribute("role", "status");

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
}

function saveProgress(partial) {
  const existing = readProgress() || {};
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...existing, ...partial, savedAt: Date.now() }));
  } catch {
    // Ignore write failures (e.g. Safari private browsing, quota exceeded).
  }
}

saveProgress({ title: document.title.replace(" — Stories", ""), url: window.location.pathname });

const autoplayFallback = document.getElementById("autoplay-fallback");
const autoplaySignal = new URLSearchParams(window.location.search).get("autoplay") === "1";

const saved = readProgress();
if (autoplaySignal && audio) {
  // Explicit user intent (they tapped Play on the library card) — attempt
  // immediate playback, resuming from saved position if present. This
  // branch is mutually exclusive with the resume banner below: showing
  // both would offer a redundant/contradictory choice for a decision the
  // user already made by tapping Play.
  if (saved && saved.audioTime) audio.currentTime = saved.audioTime;
  audio.play().catch(() => {
    // Browser autoplay policy does not treat a user gesture on the PREVIOUS
    // page as authorization for play() on this freshly-loaded page — this
    // is expected to be blocked on some browsers (notably first-visit
    // mobile Safari/Chrome), not a bug. Show a highly visible fallback
    // instead of leaving the user with silent, unexplained nothing.
    if (autoplayFallback) autoplayFallback.hidden = false;
  });
} else if (saved && (saved.audioTime > 5 || saved.scrollY > 200) && banner) {
  banner.hidden = false;
  banner.innerHTML = `
    <button id="resume-btn" type="button">▶ Resume where you left off</button>
    <button id="restart-btn" type="button">🔄 Start over</button>
  `;
  document.getElementById("resume-btn").focus();
  document.getElementById("resume-btn").addEventListener("click", () => {
    if (audio && saved.audioTime) audio.currentTime = saved.audioTime;
    if (saved.scrollY) window.scrollTo({ top: saved.scrollY, behavior: "smooth" });
    banner.hidden = true;
  });
  document.getElementById("restart-btn").addEventListener("click", () => {
    localStorage.removeItem(storageKey);
    banner.hidden = true;
    if (audio) audio.currentTime = 0;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

if (audio) {
  let lastSaved = 0;
  audio.addEventListener("timeupdate", () => {
    if (audio.currentTime - lastSaved > 5) {
      saveProgress({ audioTime: audio.currentTime, playing: true });
      lastSaved = audio.currentTime;
    }
  });
  audio.addEventListener("pause", () => saveProgress({ playing: false }));
  audio.addEventListener("play", () => saveProgress({ playing: true }));
}

window.addEventListener("beforeunload", () => {
  saveProgress({ scrollY: window.scrollY });
});
