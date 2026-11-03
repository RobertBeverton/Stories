// The one place that names where narration audio is hosted (docs/audio-hosting.md).
// Used by the page CSP (media-src) and by the front matter `audioUrl` check.
// Override at build time with AUDIO_BASE_URL (any URL on that origin).
export const DEFAULT_AUDIO_ORIGIN = "https://audio.kinly.download";

export function audioOrigin(env = process.env) {
  const raw = env.AUDIO_BASE_URL;
  if (!raw) return DEFAULT_AUDIO_ORIGIN;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error("not https");
    return url.origin;
  } catch {
    throw new Error(`AUDIO_BASE_URL must be an absolute https URL, got '${raw}'`);
  }
}

export const AUDIO_ORIGIN = audioOrigin();

/** True for an absolute https URL on the audio origin (what a story's front matter `audioUrl` may be). */
export function isAudioUrl(value, origin = AUDIO_ORIGIN) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.origin === origin && url.pathname.length > 1;
  } catch {
    return false;
  }
}
