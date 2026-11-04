import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/_site/**", "**/.claude/worktrees/**", "test/e2e/**"], // e2e runs under Playwright (npm run test:e2e)
    coverage: {
      // `npm run test:coverage`. The browser modules and the build scripts are the code that ships.
      provider: "v8",
      include: ["site/assets/js/**/*.{js,mjs}", "scripts/**/*.mjs", "narrator/**/*.mjs"],
      exclude: ["**/*.test.mjs"],
      reporter: ["text-summary", "text"],
    },
  },
});
