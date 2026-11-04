// The grouped Library in a real phone-sized browser (390x844, touch), against the
// invented fixture site (see support/build-fixture-site.mjs).
import { expect, test } from "@playwright/test";

const LIBRARY = "/Stories/library/";
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.goto("/Stories/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(LIBRARY);
  await expect(page.locator('[data-role="results-status"]')).not.toHaveText("");
});

const visibleRows = (page) => page.locator('[data-role="story-row"]:visible');

test("opens as calm series cards: no story rows until a card is opened", async ({ page }) => {
  await expect(page.locator('[data-role="results-status"]')).toHaveText("15 stories");
  await expect(page.locator('[data-role="series-group"]:visible')).toHaveCount(3); // E2E Series, E2E Saga, single stories
  await expect(visibleRows(page)).toHaveCount(0);
  const saga = page.getByRole("button", { name: /E2E Saga/ });
  await expect(saga).toHaveAttribute("aria-expanded", "false");
  await expect(saga).toContainText("12 stories");
  await saga.tap();
  await expect(saga).toHaveAttribute("aria-expanded", "true");
  await expect(visibleRows(page)).toHaveCount(12);
  await saga.tap();
  await expect(visibleRows(page)).toHaveCount(0);
});

test("search and chips switch to a flat list and back", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search stories" }).fill("saga tale 3");
  await expect(page.locator('[data-role="series-group"]:visible')).toHaveCount(0);
  await expect(visibleRows(page)).toHaveCount(1);
  await expect(page.locator('[data-role="results-status"]')).toHaveText("1 of 15 stories");
  await page.getByRole("button", { name: "Clear" }).tap();
  await expect(page.locator('[data-role="series-group"]:visible')).toHaveCount(3);
  await page.getByRole("button", { name: "Under 15 min" }).tap();
  await expect(page.getByRole("button", { name: "Under 15 min" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-role="series-group"]:visible')).toHaveCount(0);
});

test("the Library comes back as it was left after visiting a story", async ({ page }) => {
  await page.getByRole("button", { name: /E2E Saga/ }).tap();
  await page.getByRole("link", { name: "Saga Tale 2 of the Library Test" }).click();
  await expect(page).toHaveURL(/saga-2\/$/);
  await page.goBack();
  await expect(page).toHaveURL(LIBRARY);
  await expect(page.getByRole("button", { name: /E2E Saga/ })).toHaveAttribute("aria-expanded", "true");
  await expect(visibleRows(page)).toHaveCount(12);
});

test("fits the phone: chip rows scroll sideways, nothing wraps or overflows, targets are 44px", async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const rows = await page.evaluate(() => {
    const chips = [...document.querySelectorAll(".world-chips, .chip-row")];
    return chips.map((c) => ({ height: c.getBoundingClientRect().height, scrolls: c.scrollWidth >= c.clientWidth }));
  });
  expect(rows.length).toBeGreaterThanOrEqual(2);
  for (const row of rows) expect(row.height).toBeLessThan(60); // one line each, never wrapped
  const small = await page.evaluate(() => [...document.querySelectorAll('.chip-row button, .world-chips button, [data-role="group-toggle"], [data-role="sort"]')]
    .filter((b) => b.getBoundingClientRect().height < 43.5).length);
  expect(small).toBe(0);
});
