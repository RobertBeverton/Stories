// Playwright smoke test (test/e2e). Run with `npm run test:e2e`; CI runs it as the
// `verify` job in .github/workflows/build.yml, which the deploy waits for. It builds a
// small fixture site (invented stories, no audio files) and serves it itself:
// see test/e2e/support/. Not part of `npx vitest run`.
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "test/e2e",
  testMatch: "**/*.e2e.mjs",
  fullyParallel: false,
  workers: 1,
  // No retries: a test that passes only on the second try is a flaky test, and
  // build.yml gates the deploy on this suite. Fix the cause instead.
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "node test/e2e/support/serve.mjs",
    url: `http://127.0.0.1:${PORT}/Stories/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
  },
});
