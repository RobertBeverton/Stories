const STALE_AFTER_MS = 20_000; // a bit more than resume.js's ~5s timeupdate write cadence

function readAllProgress() {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("story-progress:")) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key));
      if (value) entries.push({ slug: key.slice("story-progress:".length), ...value });
    } catch {
      // Ignore malformed entries.
    }
  }
  return entries;
}

function currentlyPlaying() {
  const now = Date.now();
  return readAllProgress()
    .filter((e) => e.playing && e.savedAt && now - e.savedAt < STALE_AFTER_MS)
    .sort((a, b) => b.savedAt - a.savedAt)[0];
}

function renderBar(playing) {
  let bar = document.getElementById("mini-player");
  if (!playing) {
    if (bar) bar.remove();
    return;
  }
  const localAudio = document.getElementById("story-audio");
  const currentSlug = document.querySelector("script[data-slug]")?.dataset.slug;
  const isLocalStory = localAudio && currentSlug === playing.slug;

  if (!bar) {
    bar = document.createElement("div");
    bar.id = "mini-player";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Now playing");
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <a href="${playing.url ?? "#"}" class="mini-player-title">${playing.title ?? playing.slug}</a>
    <button id="mini-player-toggle" type="button" aria-label="Play or pause">${playing.playing ? "⏸" : "▶"}</button>
  `;

  const toggle = document.getElementById("mini-player-toggle");
  if (isLocalStory) {
    const sync = () => { toggle.textContent = localAudio.paused ? "▶" : "⏸"; };
    localAudio.addEventListener("play", sync);
    localAudio.addEventListener("pause", sync);
    sync();
    toggle.addEventListener("click", () => {
      if (localAudio.paused) localAudio.play().catch(() => {});
      else localAudio.pause();
    });
  } else {
    toggle.addEventListener("click", () => {
      const key = `story-progress:${playing.slug}`;
      try {
        const existing = JSON.parse(localStorage.getItem(key) || "{}");
        localStorage.setItem(key, JSON.stringify({ ...existing, playing: !playing.playing, savedAt: Date.now() }));
      } catch {
        // Ignore write failures.
      }
      renderBar(currentlyPlaying());
    });
  }
}

renderBar(currentlyPlaying());
window.addEventListener("storage", () => renderBar(currentlyPlaying()));
