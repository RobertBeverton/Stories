// The Library groups stories into collapsed series cards. Open the E2E series
// (a no-op if it is already open) so its story rows are reachable.
export async function openSeries(page) {
  const toggle = page.getByRole("button", { name: /E2E Series/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}
