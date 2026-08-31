const STALE_CONTINUE_DAYS = 30; // don't show a "continue" banner for a story not touched in a month+

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
  entries.sort((a, b) => b.savedAt - a.savedAt);
  const mostRecent = entries[0];

  const section = document.getElementById("continue-section");
  const row = document.getElementById("continue-row");
  row.innerHTML = `
    <a class="continue-banner" href="${mostRecent.url}">
      <span class="continue-banner-label">Continue</span>
      <span class="continue-banner-title">${mostRecent.title ?? mostRecent.slug}</span>
      <span class="continue-banner-arrow" aria-hidden="true">→</span>
    </a>
  `;
  section.hidden = false;
}
