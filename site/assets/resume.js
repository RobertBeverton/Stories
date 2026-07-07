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
  localStorage.setItem(storageKey, JSON.stringify({ ...existing, ...partial, savedAt: Date.now() }));
}

const saved = readProgress();
if (saved && (saved.audioTime > 5 || saved.scrollY > 200)) {
  banner.hidden = false;
  banner.innerHTML = `
    <button id="resume-btn" type="button">⏪ Resume where you left off</button>
    <button id="restart-btn" type="button">🔄 Start over</button>
  `;
  document.getElementById("resume-btn").addEventListener("click", () => {
    if (audio && saved.audioTime) audio.currentTime = saved.audioTime;
    if (saved.scrollY) window.scrollTo({ top: saved.scrollY, behavior: "smooth" });
    banner.hidden = true;
  });
  document.getElementById("restart-btn").addEventListener("click", () => {
    // Per design: don't discard the old save immediately — only overwrite once
    // the new session actually progresses past the start, so an accidental
    // tap here is still recoverable.
    banner.hidden = true;
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
