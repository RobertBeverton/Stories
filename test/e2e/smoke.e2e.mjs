// Smoke test for the app shell, in a real browser. It runs against a fixture
// site (invented stories, see support/build-fixture-site.mjs). The narration
// audio is a short silent WAV generated here and served in place of the audio
// origin, so nothing story-shaped is committed.
import { expect, test } from "@playwright/test";
import { AUDIO_ORIGIN } from "../../scripts/audio-origin.mjs";
import { FIXTURE_STORIES } from "./support/build-fixture-site.mjs";

const HOME = "/Stories/";
const LIBRARY = "/Stories/library/";
const [ONE, TWO] = FIXTURE_STORIES;
const ONE_URL = "/Stories/stories/e2e-series/tale-one/";
const TWO_URL = "/Stories/stories/e2e-series/tale-two/";

/** A mono 8 kHz 16-bit PCM WAV of digital silence. */
function silentWav(seconds) {
  const rate = 8000;
  const data = Buffer.alloc(rate * seconds * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
const WAV = silentWav(30);

/** The Library groups stories into collapsed series cards: open the E2E series (a no-op if it is open already). */
async function openSeries(page) {
  const toggle = page.getByRole("button", { name: /E2E Series/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

let violations;

test.beforeEach(async ({ page, context }) => {
  violations = [];
  // The browser asks the audio origin for the story; answer with the silent WAV, honouring Range requests.
  await context.route(`${AUDIO_ORIGIN}/**`, async (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? "");
    const headers = { "Content-Type": "audio/wav", "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
    if (!range) return route.fulfill({ status: 200, headers, body: WAV });
    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : WAV.length - 1, WAV.length - 1);
    return route.fulfill({
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${WAV.length}`, "Content-Length": String(end - start + 1) },
      body: WAV.subarray(start, end + 1),
    });
  });
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  page.on("console", (message) => {
    const text = message.text();
    if (/content security policy|refused to (load|execute|apply|connect)/i.test(text)) violations.push(`console: ${text}`);
    if (message.type() === "error" && !/favicon/.test(text)) violations.push(`console error: ${text}`);
  });
  page.on("pageerror", (error) => violations.push(`pageerror: ${error.message}`));
});

test.afterEach(async ({ page }) => {
  const inPage = await page.evaluate(() => window.__violations ?? []).catch(() => []);
  expect([...violations, ...inPage]).toEqual([]);
});

const audioState = (page) => page.evaluate(() => {
  const audio = document.querySelector("audio");
  return { paused: audio.paused, time: audio.currentTime, slug: audio.dataset.slug ?? null, id: audio.id, count: document.querySelectorAll("audio").length };
});

test("home loads with the dock, one silent audio element and a build id", async ({ page }) => {
  await page.goto(HOME);
  await expect(page.getByRole("heading", { level: 1, name: "Stories" })).toBeVisible();
  const dock = page.getByRole("navigation", { name: "Main" });
  await expect(dock.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await expect(dock.getByRole("link", { name: "Library" })).toBeVisible();
  expect((await audioState(page)).count).toBe(1);
  await expect(page.locator('meta[name="build-id"]')).toHaveAttribute("content", /\d+/);
  // The dock module mounted: no mini player until something plays.
  await expect(page.locator('[data-dock-slot="mini"]')).toBeHidden();
});

test("the router keeps the same <audio> element, and playback keeps advancing, across navigation", async ({ page }) => {
  let documentLoads = 0;
  page.on("request", (request) => { if (request.resourceType() === "document") documentLoads++; });

  await page.goto(HOME);
  await page.evaluate(() => {
    window.__shell = true; // lost on any full page load
    document.querySelector("audio").__marker = "same-element";
  });

  // Home to Library to a story, all through the router.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(LIBRARY);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused(); // focus moves to the new heading
  await openSeries(page);
  await page.getByRole("link", { name: ONE.title }).click();
  await expect(page).toHaveURL(ONE_URL);
  await expect(page.getByRole("heading", { level: 1, name: ONE.title })).toBeVisible();
  expect(await page.title()).toContain(ONE.title);

  // Start it from the story page.
  await page.getByRole("button", { name: /^Play/ }).first().click();
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  await expect(page.locator('[data-dock-slot="mini"]')).toBeVisible();
  await expect(page.locator('[data-role="mini-title"]')).toHaveText(ONE.title);
  const first = await audioState(page);
  expect(first.slug).toBe("e2e-series/tale-one");
  await expect.poll(async () => (await audioState(page)).time).toBeGreaterThan(first.time + 0.5);

  // Browse away while it plays.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(LIBRARY);
  const afterLibrary = await audioState(page);
  expect(afterLibrary.paused).toBe(false);
  expect(afterLibrary.slug).toBe("e2e-series/tale-one");
  await expect.poll(async () => (await audioState(page)).time).toBeGreaterThan(afterLibrary.time + 0.5);

  // Open the OTHER story's page: the dock keeps playing the first one.
  await page.getByRole("link", { name: TWO.title }).click(); // the Library came back with the series still open
  await expect(page).toHaveURL(TWO_URL);
  const onOtherPage = await audioState(page);
  expect(onOtherPage.paused).toBe(false);
  expect(onOtherPage.slug).toBe("e2e-series/tale-one");
  expect(onOtherPage.id).toBe("player"); // ownership follows the slug, not an id (see the next tests)
  await expect(page.locator('[data-role="mini-title"]')).toHaveText(ONE.title);

  // Back and Forward are handled by the router too.
  await page.goBack();
  await expect(page).toHaveURL(LIBRARY);
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(TWO_URL);

  // The same element all the way, in one document: nothing reloaded.
  expect(await page.evaluate(() => ({ shell: window.__shell, marker: document.querySelector("audio").__marker }))).toEqual({ shell: true, marker: "same-element" });
  expect(documentLoads).toBe(1);
  expect((await audioState(page)).count).toBe(1);
});

test("the player sheet opens as a dialog, sets a sleep timer and closes with Escape", async ({ page }) => {
  await page.goto(ONE_URL);
  await page.getByRole("button", { name: /^Play/ }).first().click();
  await expect(page.locator('[data-dock-slot="mini"]')).toBeVisible();
  await page.getByRole("button", { name: /^Open player/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: ONE.title })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Close player" })).toBeFocused();
  await sheet.getByRole("button", { name: "15 min" }).click();
  await expect(sheet.getByRole("button", { name: "15 min" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByText(/Sleep timer: about 15 minutes left/)).toBeVisible();
  await sheet.getByRole("slider", { name: "Seek" }).press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: /^Open player/ })).toBeFocused();
});

test("the kill switch gives plain full page loads", async ({ page }) => {
  let documentLoads = 0;
  page.on("request", (request) => { if (request.resourceType() === "document") documentLoads++; });

  await page.goto(`${HOME}?router=off`);
  await page.evaluate(() => { window.__shell = true; });
  expect(await page.evaluate(() => localStorage.getItem("stories-router"))).toBe("off");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(LIBRARY);
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  expect(await page.evaluate(() => window.__shell)).toBeUndefined(); // a real navigation replaced the document
  expect(documentLoads).toBe(2);

  // ?router=on switches it back on.
  await page.goto(`${HOME}?router=on`);
  expect(await page.evaluate(() => localStorage.getItem("stories-router"))).toBeNull();
  await page.evaluate(() => { window.__shell = true; });
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(LIBRARY);
  expect(await page.evaluate(() => window.__shell)).toBe(true); // swapped in place
});

test("a story with no audio still renders and leaves the dock empty", async ({ page }) => {
  await page.goto(`${HOME}stories/quiet-tale/`);
  await expect(page.getByRole("heading", { level: 1, name: FIXTURE_STORIES[2].title })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Play/ })).toHaveCount(0);
  await expect(page.locator('[data-dock-slot="mini"]')).toBeHidden();
});

const SLUG_ONE = "e2e-series/tale-one";
const SLUG_TWO = "e2e-series/tale-two";
const record = (page, slug) => page.evaluate((key) => JSON.parse(localStorage.getItem(`story-progress:${key}`) ?? "null"), slug);
const seedRecord = (page, slug, data) => page.evaluate(([key, value]) => {
  localStorage.setItem(`story-progress:${key}`, JSON.stringify({ v: 2, scrollY: 0, playing: false, savedAt: Date.now(), ...value }));
}, [slug, data]);
const currentTime = (page) => page.evaluate(() => document.querySelector("audio").currentTime);

test("a story page opened while another story plays: its Play, part list and Start over work once it is loaded", async ({ page }) => {
  await page.goto(ONE_URL);
  await seedRecord(page, SLUG_TWO, { audioTime: 12 }); // in progress: Tale Two will show the resume banner
  await page.getByRole("button", { name: /^Play/ }).first().click();
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);

  // Open the other story through the router while the first plays.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).click();
  await openSeries(page);
  await page.getByRole("link", { name: TWO.title, exact: true }).click();
  await expect(page).toHaveURL(TWO_URL);
  expect((await audioState(page)).slug).toBe(SLUG_ONE);
  const parts = page.locator('[data-role="parts-list"] [data-role="part"]');
  await expect(parts).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Start over" })).toBeVisible();
  const before = await record(page, SLUG_ONE);

  // Play on THIS page: the player loads Tale Two and the page's own modules follow it.
  await page.getByRole("button", { name: /^Resume/ }).first().click();
  await expect.poll(async () => (await audioState(page)).slug).toBe(SLUG_TWO);
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  await expect(parts.nth(1)).toHaveAttribute("aria-current", "true"); // started at 12 s: part two (from 10 s)
  await parts.nth(0).click();
  await expect(parts.nth(0)).toHaveAttribute("aria-current", "true");
  expect(await currentTime(page)).toBeLessThan(3);
  await parts.nth(1).click();
  await expect(parts.nth(1)).toHaveAttribute("aria-current", "true");
  expect(await currentTime(page)).toBeGreaterThanOrEqual(10);

  // Start over (the banner is still there) works on the audio that now holds this story.
  await page.getByRole("button", { name: "Start over" }).click();
  expect(await currentTime(page)).toBeLessThan(3);
  await expect(parts.nth(0)).toHaveAttribute("aria-current", "true");

  // The first story's record was saved when it was replaced, and is not touched any more.
  const after = await record(page, SLUG_ONE);
  expect(after.audioTime).toBeGreaterThanOrEqual(before.audioTime);
  await page.waitForTimeout(1200);
  expect((await record(page, SLUG_ONE)).audioTime).toBe(after.audioTime);
});

test("dock Next and Previous never write one story's progress into the other's record", async ({ page }) => {
  await page.goto(ONE_URL);
  await page.getByRole("button", { name: /^Play/ }).first().click();
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  await expect(page.locator('[data-dock-slot="mini"]')).toBeVisible();
  await page.getByRole("button", { name: /^Open player/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Next story" }).click();
  await expect.poll(async () => (await audioState(page)).slug).toBe(SLUG_TWO);
  await expect(sheet.getByRole("heading", { name: TWO.title })).toBeVisible();

  // Still on Tale One's page, Tale Two playing: let it cross a 5 s save boundary.
  expect(page.url()).toContain(ONE_URL);
  const oneAtSwitch = await record(page, SLUG_ONE);
  await expect.poll(async () => (await record(page, SLUG_TWO))?.audioTime ?? 0, { timeout: 12_000 }).toBeGreaterThan(4);
  const one = await record(page, SLUG_ONE);
  expect(one.audioTime).toBe(oneAtSwitch.audioTime);
  expect(one.completedAt).toBeUndefined();

  // Previous within the first 5 s goes back to Tale One; Tale Two keeps its place and is not finished.
  await sheet.getByRole("slider", { name: "Seek" }).press("Home");
  await sheet.getByRole("button", { name: /^Previous story/ }).click();
  await expect.poll(async () => (await audioState(page)).slug).toBe(SLUG_ONE);
  const twoAtSwitch = await record(page, SLUG_TWO);
  await expect.poll(async () => (await record(page, SLUG_ONE))?.audioTime ?? 0, { timeout: 12_000 }).toBeGreaterThan(oneAtSwitch.audioTime);
  const two = await record(page, SLUG_TWO);
  expect(two.audioTime).toBe(twoAtSwitch.audioTime);
  expect(two.completedAt).toBeUndefined();
});

test("a page from a different build forces one full navigation, once", async ({ page }) => {
  let documentLoads = 0;
  page.on("request", (request) => { if (request.resourceType() === "document") documentLoads++; });
  // The router's fetch (not the browser's own navigation) sees a page from another deploy.
  await page.route("**/Stories/library/", async (route) => {
    if (route.request().resourceType() !== "fetch") return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace(/(<meta name="build-id" content=")[^"]*"/, '$1other-deploy"');
    return route.fulfill({ response, body });
  });

  await page.goto(HOME);
  await page.evaluate(() => { window.__shell = true; });
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(LIBRARY);
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  expect(await page.evaluate(() => window.__shell)).toBeUndefined(); // a real navigation replaced the document
  await page.waitForTimeout(500);
  expect(documentLoads).toBe(2); // the first load plus exactly one forced one: no loop
});

test("a reload, and Back from another site, restore the scroll position", async ({ page }) => {
  await page.goto(ONE_URL);
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect.poll(() => page.evaluate(() => history.state?.scrollY ?? 0)).toBeGreaterThan(600);

  await page.reload();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);

  await page.goto("about:blank");
  await page.goBack();
  await expect(page).toHaveURL(ONE_URL);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
});
