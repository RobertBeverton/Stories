// Wires up every "▶︎ Listen" button rendered by story-card.njk. The button
// carries data-play-* attributes (slug/url/title/story-url) instead of being
// a plain link because a later enhancement may want to start playback
// in-place without navigating — but no such in-place player exists yet, so
// for now this reuses the story page's own already-working autoplay
// mechanism (see resume.js's `autoplaySignal` handling) rather than
// duplicating audio/localStorage logic here.
if (typeof document !== "undefined") {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".play-button-primary[data-play-story-url]");
    if (!button) return;
    window.location.href = `${button.dataset.playStoryUrl}?autoplay=1`;
  });
}
