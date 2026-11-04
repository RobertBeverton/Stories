// Fails a test on any CSP violation, console error or uncaught error in the page.
import { expect } from "@playwright/test";

const found = new WeakMap();

export async function watchForViolations(page) {
  const violations = [];
  found.set(page, violations);
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
}

export async function expectNoViolations(page) {
  const inPage = await page.evaluate(() => window.__violations ?? []).catch(() => []);
  expect([...(found.get(page) ?? []), ...inPage]).toEqual([]);
}
