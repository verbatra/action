import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.mjs"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["*.mjs"],
      exclude: ["**/*.test.mjs"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 90 },
    },
  },
});
