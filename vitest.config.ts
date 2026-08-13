import { defineConfig } from "vitest/config";

/**
 * Standalone Vitest config for the verbatra action repository.
 *
 * In the monorepo this file called `createVitestConfig` from `@verbatra/config/vitest`, a
 * `workspace:*` dependency that cannot exist outside the workspace. The preset is inlined here
 * instead, with the same v8 provider, the same reporters, and the same four 90 percent coverage
 * thresholds. No threshold is lowered or dropped.
 *
 * The preset also baked in three excludes scoped to a `src/` directory (`src/**\/*.test.ts`,
 * `src/index.ts`, `src/**\/types.ts`). This repository has no `src/` directory, so those globs
 * matched nothing and are omitted rather than carried over as dead configuration.
 */
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
