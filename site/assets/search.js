const searchBox = document.getElementById("search-box");
const cards = Array.from(document.querySelectorAll(".story-card"));

searchBox?.addEventListener("input", () => {
  const query = searchBox.value.trim().toLowerCase();
  for (const card of cards) {
    const haystack = (
      card.dataset.title + " " + card.dataset.tags + " " + card.dataset.description
    ).toLowerCase();
    const match = query === "" || haystack.includes(query);
    card.style.display = match ? "" : "none";
  }
});
