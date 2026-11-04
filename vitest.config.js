import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/_site/**", "**/.claude/worktrees/**", "test/e2e/**"], // e2e runs under Playwright (npm run test:e2e)
  },
});
