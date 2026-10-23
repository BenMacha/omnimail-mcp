import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // cli.ts is the interactive entry point; it is exercised by the Docker smoke test in CI.
      exclude: ["src/cli.ts"],
      reporter: ["text", "json-summary", "lcov"],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
    },
  },
});
