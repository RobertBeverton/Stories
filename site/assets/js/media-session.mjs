// Media Session wiring for the in-page audio element (replaces the old
// mini-player.js). Metadata comes from library.json; the wave 2 player owns
// previous/next.
import { basePath } from "./dom.mjs";

export function buildMediaMetadata({ title, artworkUrl }) {
  return {
    title: title || "Stories",
    artist: "Stories",
    artwork: artworkUrl ? [{ src: artworkUrl, sizes: "512x512", type: "image/png" }] : [],
  };
}

/** @returns {() => void} a disposer that clears the handlers */
export function setupMediaSession(story, audio) {
  const session = typeof navigator !== "undefined" ? navigator.mediaSession : null;
  if (!session || typeof MediaMetadata === "undefined") return () => {};
  session.metadata = new MediaMetadata(
    buildMediaMetadata({ title: story?.title, artworkUrl: `${basePath()}/assets/app-icon-512.png` }),
  );
  const handlers = {
    play: () => audio.play()?.catch?.(() => {}),
    pause: () => audio.pause(),
    seekbackward: (d) => { audio.currentTime = Math.max(0, audio.currentTime - (d?.seekOffset || 10)); },
    seekforward: (d) => {
      // audio.duration is NaN until metadata loads; Infinity avoids poisoning currentTime.
      const limit = Number.isFinite(audio.duration) ? audio.duration : Infinity;
      audio.currentTime = Math.min(limit, audio.currentTime + (d?.seekOffset || 10));
    },
  };
  for (const [action, fn] of Object.entries(handlers)) {
    try { session.setActionHandler(action, fn); } catch { /* unsupported action */ }
  }
  return () => {
    for (const action of Object.keys(handlers)) {
      try { session.setActionHandler(action, null); } catch { /* ignore */ }
    }
  };
}
