import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.mjs", "scripts/**/*.mjs"],
      exclude: ["**/*.test.mjs"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 90 },
    },
  },
});
