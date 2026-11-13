// Offline listening, in a real browser: save a story, go offline, reload, play and seek it, remove it.
import { expect, test } from "@playwright/test";
import { routeAudio } from "./support/audio.mjs";
import { FIXTURE_STORIES } from "./support/build-fixture-site.mjs";
import { openSeries } from "./support/library.mjs";
import { expectNoViolations, watchForViolations } from "./support/guards.mjs";

const HOME = "/Stories/";
const OFFLINE = "/Stories/offline/";
const ONE = "/Stories/stories/e2e-series/tale-one/";
const LIBRARY = "/Stories/library/";
const WITH_AUDIO = FIXTURE_STORIES.filter((s) => s.audio).length;

test.beforeEach(async ({ page, context }) => {
  await routeAudio(context);
  await watchForViolations(page);
});
test.afterEach(async ({ page }) => expectNoViolations(page));

async function controlled(page, url) {
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // the first load is not controlled by the new worker
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

const audio = (page) => page.evaluate(() => {
  const a = document.querySelector("audio");
  return { time: a.currentTime, paused: a.paused, error: a.error?.code ?? null, slug: a.dataset.slug ?? null };
});

test("a saved story plays and seeks with no network, and can be removed", async ({ page, context }) => {
  await controlled(page, ONE);

  const save = page.getByRole("button", { name: /^Save for offline/ });
  await expect(save).toBeVisible();
  await save.click();
  const saved = page.getByRole("button", { name: "Saved for offline" });
  await expect(saved).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);
  await page.goto(ONE); // served by the worker from the shell cache
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tale One");
  await page.getByRole("button", { name: /^Play/ }).first().click();
  await expect.poll(async () => (await audio(page)).time, { timeout: 10_000 }).toBeGreaterThan(0.5);
  await page.evaluate(() => { document.querySelector("audio").currentTime = 20; });
  await expect.poll(async () => (await audio(page)).time, { timeout: 10_000 }).toBeGreaterThanOrEqual(20);
  expect((await audio(page)).error).toBeNull();
  // The worker answers a Range request from the cache with a 206 (what seeking relies on), with no network.
  const probe = await page.evaluate(async (url) => {
    const res = await fetch(url, { headers: { Range: "bytes=100-199" } });
    return { status: res.status, range: res.headers.get("content-range"), bytes: (await res.arrayBuffer()).byteLength };
  }, await page.evaluate(() => document.querySelector("audio").src));
  expect(probe.status).toBe(206);
  expect(probe.bytes).toBe(100);
  expect(probe.range).toMatch(/^bytes 100-199\//);

  // The Offline page lists the saved story, from the cache.
  await page.goto(OFFLINE);
  await expect(page.locator('[data-role="meter-text"]')).toContainText("Saved on this tablet");
  const row = page.locator('[data-role="story"][data-slug="e2e-series/tale-one"]');
  await page.locator('[data-role="world-toggle"]').first().click();
  await expect(row).toContainText("Saved");
  await expect(row.locator('[data-role="story-remove"]')).toBeVisible();

  // The Library marks it Saved and the rest as Not saved while offline.
  await page.goto(LIBRARY);
  await openSeries(page);
  const libRow = (title) => page.locator('[data-role="story-row"]').filter({ hasText: title });
  await expect(libRow("Tale One").locator('[data-role="saved-badge"]')).toBeVisible();
  await expect(libRow("Tale Two").locator('[data-role="unsaved-badge"]')).toBeVisible();
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("button", { name: "Saved on this tablet" }).click();
  await page.keyboard.press("Escape");
  await expect(libRow("Tale One")).toBeVisible();
  await expect(libRow("Tale Two")).toBeHidden();

  await context.setOffline(false);
  await page.goto(ONE);
  await page.getByRole("button", { name: "Saved for offline" }).click();
  await expect(page.getByRole("button", { name: /^Save for offline/ })).toBeVisible();
  // Gone for good: reload and the button still offers to save.
  await page.reload();
  await expect(page.getByRole("button", { name: /^Save for offline/ })).toBeVisible();
  await page.goto(OFFLINE);
  await page.locator('[data-role="world-toggle"]').first().click();
  await expect(page.locator('[data-role="story"][data-slug="e2e-series/tale-one"]')).toContainText("Not saved");
});

test("the Offline page shows the meter, saves a world and reports it", async ({ page }) => {
  await controlled(page, OFFLINE);
  await expect(page.getByRole("heading", { level: 1, name: "Offline" })).toBeVisible();
  await expect(page.locator('[data-role="meter-text"]')).toContainText("Saved on this tablet");
  await page.locator('[data-role="world-toggle"]').first().click();
  const pick = await page.locator('[data-role="story-pick"]').first().boundingBox();
  expect(Math.min(pick.width, pick.height)).toBeGreaterThanOrEqual(44); // a real 44px tap target, not just margin
  await page.locator('[data-role="all-save"]').click();
  await expect(page.locator('[data-role="job-text"]')).toContainText(/Saved \d+ stories|Saving/, { timeout: 20_000 });
  await expect(page.locator('[data-role="all-detail"]')).toContainText(`${WITH_AUDIO} saved`, { timeout: 20_000 });
  await page.locator('[data-role="all-remove"]').click();
  await page.locator('[data-role="all-remove"]').click(); // second tap confirms
  await expect(page.locator('[data-role="all-detail"]')).toContainText("0 saved");
});

test("offline, an unsaved page shows the Offline page rather than a browser error", async ({ page, context }) => {
  await controlled(page, HOME);
  await context.setOffline(true);
  await page.goto("/Stories/stories/e2e-series/tale-two/");
  await expect(page.getByRole("heading", { level: 1, name: "Offline" })).toBeVisible();
  await context.setOffline(false);
});

test("?sw=off unregisters the worker", async ({ page }) => {
  await controlled(page, HOME);
  await page.goto(`${HOME}?sw=off`);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await page.goto(`${HOME}?sw=on`);
});
