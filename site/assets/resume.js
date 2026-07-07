const script = document.currentScript;
const slug = script.dataset.slug;
const storageKey = `story-progress:${slug}`;
const audio = document.getElementById("story-audio");
const banner = document.getElementById("resume-banner");

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

const saved = readProgress();
if (saved && (saved.audioTime > 5 || saved.scrollY > 200)) {
  banner.hidden = false;
  banner.setAttribute("role", "status");
  banner.innerHTML = `
    <button id="resume-btn" type="button">⏪ Resume where you left off</button>
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
      saveProgress({ audioTime: audio.currentTime });
      lastSaved = audio.currentTime;
    }
  });
}

window.addEventListener("beforeunload", () => {
  saveProgress({ scrollY: window.scrollY });
});
