// Real-device bugs, reproduced on a phone-sized touch viewport (390x844, touch, mobile):
// the text size control, the dock's progress and skip buttons, Play on an
// already-loaded story, live progress on Home, and the lore chips on a story page.
// Same fixture site as smoke.e2e.mjs (invented stories, silent audio).
import { expect, test } from "@playwright/test";
import { routeAudio } from "./support/audio.mjs";
import { openSeries } from "./support/library.mjs";
import { FIXTURE_LORE, FIXTURE_STORIES } from "./support/build-fixture-site.mjs";
import { expectNoViolations, watchForViolations } from "./support/guards.mjs";

const HOME = "/Stories/";
const LIBRARY = "/Stories/library/";
const [ONE, TWO] = FIXTURE_STORIES;
const ONE_URL = "/Stories/stories/e2e-series/tale-one/";
const TWO_URL = "/Stories/stories/e2e-series/tale-two/";
const SLUG_ONE = "e2e-series/tale-one";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page, context }) => {
  await routeAudio(context);
  await watchForViolations(page);
});
test.afterEach(async ({ page }) => expectNoViolations(page));

const audioState = (page) => page.evaluate(() => {
  const audio = document.querySelector("audio");
  return { paused: audio.paused, time: audio.currentTime, slug: audio.dataset.slug ?? null };
});
const currentTime = (page) => page.evaluate(() => document.querySelector("audio").currentTime);
const isPlaying = (page) => audioState(page).then((s) => !s.paused);
const seedRecord = (page, slug, data) => page.evaluate(([key, value]) => {
  localStorage.setItem(`story-progress:${key}`, JSON.stringify({ v: 2, scrollY: 0, playing: false, savedAt: Date.now(), ...value }));
}, [slug, data]);
// Leaving a page saves the position of a story that is playing, which would overwrite the seed: pause
// first, and wait for the `pause` event (it is queued, and its handler saves the position too).
const reseed = async (page, slug, data) => {
  await page.evaluate(() => new Promise((resolve) => {
    const audio = document.querySelector("audio");
    if (audio.paused) return resolve();
    audio.addEventListener("pause", () => setTimeout(resolve, 0), { once: true });
    audio.pause();
  }));
  await seedRecord(page, slug, data);
  await page.reload();
};
const headerPlay = (page) => page.locator('.story-actions [data-mount="play-button"]');
const mini = (page) => page.locator('[data-dock-slot="mini"]');

async function playFromStoryPage(page, url = ONE_URL) {
  await page.goto(url);
  await headerPlay(page).tap();
  await expect.poll(() => isPlaying(page)).toBe(true);
  await expect(mini(page)).toBeVisible();
}

// ---------------------------------------------------------------------------
// 1. Text size: A-, A and A+ can all be tapped

test("text size: A-, A and A+ are 44px targets, hit-test as themselves, and each tap works and persists", async ({ page }) => {
  await page.goto(ONE_URL);
  const fontSize = () => page.evaluate(() => getComputedStyle(document.querySelector(".story-body")).fontSize);
  const md = await fontSize();

  for (const size of ["sm", "lg", "md", "sm"]) {
    const label = page.locator(`label[for="ts-${size}"]`);
    await label.scrollIntoViewIfNeeded();
    const box = await label.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    // Whatever sits at the centre of the button must be the button (or its text), not an overlapping input.
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest("label")?.getAttribute("for") ?? `${el?.tagName}#${el?.id}`;
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(hit, `what a finger hits at the centre of ${size}`).toBe(`ts-${size}`);
    await label.tap();
    await expect(page.locator(`#ts-${size}`)).toBeChecked();
  }
  expect(await fontSize()).not.toBe(md); // A- is smaller than normal
  expect(parseFloat(await fontSize())).toBeLessThan(parseFloat(md));
  expect(await page.evaluate(() => localStorage.getItem("stories-text-size"))).toBe("sm");

  await page.reload();
  await expect(page.locator("#ts-sm")).toBeChecked();
  await page.locator('label[for="ts-lg"]').tap();
  expect(parseFloat(await fontSize())).toBeGreaterThan(parseFloat(md));
  expect(await page.evaluate(() => localStorage.getItem("stories-text-size"))).toBe("lg");
});

// ---------------------------------------------------------------------------
// 2. The dock shows progress and time, and the whole row opens the player

test("dock: thin progress line and elapsed / total time follow the audio, and tapping the row opens the sheet", async ({ page }) => {
  await playFromStoryPage(page);
  const time = page.locator('[data-role="mini-time"]');
  await expect(time).toBeVisible();
  await expect(time).toHaveText(/^\d+:\d\d \/ \d+:\d\d$/);
  const bar = page.locator('[data-role="mini-progress"]');
  await expect(bar).toBeVisible();
  const fill = () => bar.evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue("--fill")) || 0);
  await mini(page).getByRole("button", { name: /^Forward 15 seconds/ }).tap();
  await expect.poll(fill).toBeGreaterThan(40); // ~15 s of 30 s
  await expect(time).toHaveText(/^0:1[5-9] \/ 0:30$/);

  // A visible affordance (chevron) and a name; the whole title area is one button, not a tiny control.
  const open = page.getByRole("button", { name: /^Open player/ });
  await expect(open.locator('[data-role="mini-chevron"]')).toBeVisible();
  const box = await open.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThan(150);
  // Tap the far left of the row, nowhere near a control.
  await page.touchscreen.tap(box.x + 8, box.y + box.height / 2);
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();

  // The sheet: a seek slider that follows playback, elapsed and remaining times, back to the opener on close.
  const seek = sheet.getByRole("slider", { name: "Seek" });
  const before = Number(await seek.inputValue());
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(before);
  await expect(sheet.locator('[data-role="elapsed"]')).toHaveText(/^0:\d\d$/);
  await expect(sheet.locator('[data-role="remaining"]')).toHaveText(/^-0:\d\d$/);
  await seek.fill("3");
  expect(await currentTime(page)).toBeLessThan(5);
  await sheet.getByRole("button", { name: "Close player" }).tap();
  await expect(sheet).toBeHidden();
  await expect(open).toBeFocused();
});

// ---------------------------------------------------------------------------
// 7. Skip back / forward 15 s everywhere playback is controlled

test("skip: the dock and the player sheet have labelled 15 second buttons that seek", async ({ page }) => {
  await playFromStoryPage(page);
  await page.getByRole("button", { name: "Pause", exact: false }).first().tap(); // keep the clock still
  await expect.poll(() => isPlaying(page)).toBe(false);
  const start = await currentTime(page);

  const forward = mini(page).getByRole("button", { name: /^Forward 15 seconds/ });
  const back = mini(page).getByRole("button", { name: /^Back 15 seconds/ });
  for (const button of [forward, back]) {
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await forward.tap();
  await expect.poll(() => currentTime(page)).toBeCloseTo(start + 15, 0);
  await back.tap();
  await expect.poll(() => currentTime(page)).toBeCloseTo(start, 0);

  await page.getByRole("button", { name: /^Open player/ }).tap();
  const sheet = page.getByRole("dialog");
  const sheetForward = sheet.getByRole("button", { name: /^Forward 15 seconds/ });
  const sheetBack = sheet.getByRole("button", { name: /^Back 15 seconds/ });
  await expect(sheetForward).toContainText("15 sec");
  await expect(sheetBack).toContainText("15 sec");
  await sheetForward.tap();
  await expect.poll(() => currentTime(page)).toBeCloseTo(start + 15, 0);
  await sheetBack.tap();
  await expect.poll(() => currentTime(page)).toBeCloseTo(start, 0);
});

test("skip: a story with parts gets previous and next part buttons in the sheet", async ({ page }) => {
  await playFromStoryPage(page, TWO_URL); // parts at 0 s and 10 s
  await page.getByRole("button", { name: /^Open player/ }).tap();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Next part" }).tap();
  await expect.poll(() => currentTime(page)).toBeGreaterThanOrEqual(10);
  await sheet.getByRole("button", { name: "Previous part" }).tap();
  await expect.poll(() => currentTime(page)).toBeLessThan(3);
});

test("skip: a story without parts has no part buttons", async ({ page }) => {
  await playFromStoryPage(page);
  await page.getByRole("button", { name: /^Open player/ }).tap();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: "Back 15 seconds" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /part$/ })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 3. Play, Resume, Play again and Start over act on audio that is already loaded

test("play: a loaded story's Play becomes Pause while it plays, and Resume while it is paused", async ({ page }) => {
  await page.goto(ONE_URL);
  await headerPlay(page).tap(); // the page's story is already loaded, paused
  await expect.poll(() => isPlaying(page)).toBe(true);
  await expect(headerPlay(page)).toHaveAccessibleName(/^Pause/);
  await expect(headerPlay(page).locator('[data-role="label"]')).toHaveText("Pause");
  await headerPlay(page).tap();
  await expect.poll(() => isPlaying(page)).toBe(false);
  await expect(headerPlay(page).locator('[data-role="label"]')).toHaveText(/^(Play|Resume)$/);
  await headerPlay(page).tap();
  await expect.poll(() => isPlaying(page)).toBe(true);
});

test("play: Resume where you left off and Start over play, whether the story is paused or already playing", async ({ page }) => {
  await page.goto(ONE_URL);
  await reseed(page, SLUG_ONE, { audioTime: 12 });
  // Loaded, paused: Resume seeks to 12 s and plays.
  await page.getByRole("button", { name: "Resume where you left off" }).tap();
  await expect.poll(() => isPlaying(page)).toBe(true);
  expect(await currentTime(page)).toBeGreaterThanOrEqual(12);

  // Loaded, paused: Start over goes to the start and plays.
  await reseed(page, SLUG_ONE, { audioTime: 12 });
  await expect(headerPlay(page)).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).tap();
  await expect.poll(() => isPlaying(page)).toBe(true);
  expect(await currentTime(page)).toBeLessThan(4);

  // Pressing Play removes the banner, so it cannot later seek back to a stale place.
  await reseed(page, SLUG_ONE, { audioTime: 12 });
  await headerPlay(page).tap();
  await expect(page.getByRole("button", { name: "Resume where you left off" })).toHaveCount(0);

  // Already playing when the page opens (left for the Library and came back through the router): Resume
  // jumps to the saved place and Start over to 0, both still playing.
  const backToStory = async () => {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).tap();
    await openSeries(page);
    await seedRecord(page, SLUG_ONE, { audioTime: 12 });
    await page.getByRole("link", { name: ONE.title, exact: true }).tap();
    await expect(page).toHaveURL(ONE_URL);
    await page.evaluate(() => { document.querySelector("audio").currentTime = 25; });
  };
  await backToStory();
  await page.getByRole("button", { name: "Resume where you left off" }).tap();
  expect(await currentTime(page)).toBeLessThan(20);
  expect(await isPlaying(page)).toBe(true);
  await backToStory();
  await page.getByRole("button", { name: "Start over" }).tap();
  expect(await currentTime(page)).toBeLessThan(4);
  expect(await isPlaying(page)).toBe(true);
});

test("play: Play again restarts a finished story, loaded or at the end", async ({ page }) => {
  await page.goto(ONE_URL);
  await seedRecord(page, SLUG_ONE, { audioTime: 0, completedAt: Date.now() });
  await page.reload();
  await expect(headerPlay(page).locator('[data-role="label"]')).toHaveText("Play again");
  await headerPlay(page).tap();
  await expect.poll(() => isPlaying(page)).toBe(true);
  expect(await currentTime(page)).toBeLessThan(5);

  // Let it reach the end, then Play again restarts it.
  await page.evaluate(() => { document.querySelector("audio").currentTime = 29; });
  await expect.poll(() => page.evaluate(() => document.querySelector("audio").ended)).toBe(true);
  await expect(headerPlay(page).locator('[data-role="label"]')).toHaveText("Play again");
  await headerPlay(page).tap();
  await expect.poll(() => isPlaying(page)).toBe(true);
  expect(await currentTime(page)).toBeLessThan(5);
});

test("play: started elsewhere (dock, then Library), the story page's button reflects and controls it", async ({ page }) => {
  await playFromStoryPage(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).tap();
  await expect(page).toHaveURL(LIBRARY);
  await openSeries(page);
  await page.getByRole("link", { name: ONE.title }).tap();
  await expect(page).toHaveURL(ONE_URL);
  await expect(headerPlay(page).locator('[data-role="label"]')).toHaveText("Pause");
  await headerPlay(page).tap();
  await expect.poll(() => isPlaying(page)).toBe(false);
  await mini(page).getByRole("button", { name: /^Play / }).tap();
  await expect.poll(() => isPlaying(page)).toBe(true);
  await expect(headerPlay(page).locator('[data-role="label"]')).toHaveText("Pause");
});

// ---------------------------------------------------------------------------
// 6. Home follows live progress

test("home: Continue and Played lately follow a story started elsewhere, through the router, and keep moving while it plays", async ({ page }) => {
  await page.goto(HOME);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).tap();
  await expect(page).toHaveURL(LIBRARY);
  await openSeries(page);
  await page.getByRole("link", { name: ONE.title }).tap();
  await expect(page).toHaveURL(ONE_URL);
  await headerPlay(page).tap();
  await expect.poll(() => isPlaying(page)).toBe(true);

  // Back to Library, then Home, all client-side, within the first seconds of playback.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).tap();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).tap();
  await expect(page).toHaveURL(HOME);
  const card = page.locator('[data-mount="continue"] [data-role="card"]');
  await expect(card).toHaveAttribute("data-state", "resume");
  await expect(card).toContainText(ONE.title);
  const bar = card.locator('[data-role="bar"]');
  const value = () => bar.evaluate((el) => el.value);
  const first = await value();
  await expect.poll(value, { timeout: 8000 }).toBeGreaterThan(first); // moves with the audio clock
  await expect(page.locator('[data-mount="played-lately"] a[data-slug="' + SLUG_ONE + '"]')).toHaveAttribute("data-state", "in-progress");

  // Skipping moves it at once.
  const mid = await value();
  await mini(page).getByRole("button", { name: /^Forward 15 seconds/ }).tap();
  await expect.poll(value).toBeGreaterThan(mid + 20);

  // Let it finish: the card flips to the next unfinished story and Played lately says Finished.
  await page.evaluate(() => { document.querySelector("audio").currentTime = 29; });
  await expect.poll(() => page.evaluate(() => document.querySelector("audio").ended)).toBe(true);
  await expect(page.locator('[data-mount="played-lately"] a[data-slug="' + SLUG_ONE + '"]')).toHaveAttribute("data-state", "finished");
  await expect(card).not.toContainText(ONE.title);
});

// ---------------------------------------------------------------------------
// 4. Lore is discoverable from the top of a story page

test("lore: a story with lore links shows tappable cards near the top, also when reached through the router", async ({ page }) => {
  await page.goto(LIBRARY);
  await openSeries(page);
  await page.getByRole("link", { name: ONE.title }).tap();
  await expect(page).toHaveURL(ONE_URL);
  const section = page.locator('[data-role="story-lore"]');
  await expect(section).toBeVisible();
  const chip = section.getByRole("link", { name: new RegExp(`About ${FIXTURE_LORE.title}`) });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(FIXTURE_LORE.tradition);
  await expect(chip).toContainText(FIXTURE_LORE.summary);
  const box = await chip.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  // Above the fold on a phone, above the Play button's row.
  expect(box.y + box.height).toBeLessThan(844 * 1.5);
  const play = await headerPlay(page).boundingBox();
  expect(box.y).toBeLessThan(play.y);
  // One list, not a second copy at the bottom of the story.
  await expect(page.locator(".story-lore")).toHaveCount(1);
  await expect(page.locator(".story-hero .story-lore")).toHaveCount(1);

  await chip.tap();
  await expect(page).toHaveURL(/\/lore\/e2e-world\/old-mariner\/$/);
  await expect(page.getByRole("heading", { level: 1, name: FIXTURE_LORE.title })).toBeVisible();

  // A story without lore links shows no section.
  await page.goto(TWO_URL);
  await expect(page.locator('[data-role="story-lore"]')).toHaveCount(0);
});
