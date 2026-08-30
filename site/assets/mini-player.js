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

export function buildMediaMetadata({ title, artworkUrl }) {
  return {
    title: title || "The Isles of Yum",
    artist: "The Isles of Yum",
    artwork: artworkUrl ? [
      { src: artworkUrl, sizes: "512x512", type: "image/png" },
    ] : [],
  };
}

function setupMediaSession(playing, audio) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata(buildMediaMetadata({
    title: playing.title,
    artworkUrl: playing.artworkUrl,
  }));
  if (audio) {
    navigator.mediaSession.setActionHandler("play", () => audio.play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      // audio.duration is NaN until metadata loads; `|| Infinity` avoids poisoning currentTime with NaN.
      audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 10));
    });
    if (playing.prevUrl) {
      navigator.mediaSession.setActionHandler("previoustrack", () => { window.location.href = playing.prevUrl + "?autoplay=1"; });
    }
    if (playing.nextUrl) {
      navigator.mediaSession.setActionHandler("nexttrack", () => { window.location.href = playing.nextUrl + "?autoplay=1"; });
    }
  }
}

function renderBar(playing) {
  let bar = document.getElementById("mini-player");
  if (!playing) {
    if (bar) bar.remove();
    document.body.classList.remove("has-mini-player");
    return;
  }
  document.body.classList.add("has-mini-player");
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
    <button id="mini-player-toggle" type="button" aria-label="Play or pause">${playing.playing ? "⏸︎" : "▶︎"}</button>
  `;

  const toggle = document.getElementById("mini-player-toggle");
  if (isLocalStory) {
    const sync = () => { toggle.textContent = localAudio.paused ? "▶︎" : "⏸︎"; };
    localAudio.addEventListener("play", sync);
    localAudio.addEventListener("pause", sync);
    sync();
    toggle.addEventListener("click", () => {
      if (localAudio.paused) localAudio.play().catch(() => {});
      else localAudio.pause();
    });
    setupMediaSession(playing, localAudio);
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

if (typeof window !== "undefined") {
  renderBar(currentlyPlaying());
  window.addEventListener("storage", () => renderBar(currentlyPlaying()));
}
