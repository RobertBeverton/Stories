const STALE_CONTINUE_DAYS = 30; // don't show a "continue" card for a story not touched in a month+

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

const cutoff = Date.now() - STALE_CONTINUE_DAYS * 24 * 60 * 60 * 1000;
const entries = readAllProgress().filter((e) => e.savedAt && e.savedAt > cutoff && e.url);

if (entries.length > 0) {
  const section = document.getElementById("continue-section");
  const row = document.getElementById("continue-row");
  entries.sort((a, b) => b.savedAt - a.savedAt);
  for (const entry of entries) {
    const card = document.createElement("div");
    card.className = "story-card";
    // No accent color / icon is stored in the progress entry, so this uses a
    // neutral art panel (falls back to the default --accent-bg in style.css)
    // rather than the per-story icon SVG used on the full story-card include.
    // The goal is matching height/structure with the full cards in the same
    // horizontal .card-row, not full visual parity.
    card.innerHTML = `
      <div class="story-card-art"></div>
      <a class="story-card-link" href="${entry.url}">
        <h3>${entry.title ?? entry.slug}</h3>
        <p class="card-meta">Continue</p>
      </a>
      <div class="story-card-actions">
        <a class="read-link read-link-primary" href="${entry.url}">Continue reading →</a>
      </div>
    `;
    row.appendChild(card);
  }
  section.hidden = false;
}
