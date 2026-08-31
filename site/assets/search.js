const searchBox = document.getElementById("search-box");
const rows = Array.from(document.querySelectorAll(".story-row"));

searchBox?.addEventListener("input", () => {
  const query = searchBox.value.trim().toLowerCase();
  for (const row of rows) {
    const haystack = (
      row.dataset.title + " " + row.dataset.tags + " " + row.dataset.description
    ).toLowerCase();
    const match = query === "" || haystack.includes(query);
    row.style.display = match ? "" : "none";
  }
});
