import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // "forks" (vitest's default pool) crashes/times out sporadically on Windows in this
    // repo, silently dropping coverage for whichever test file's worker died. Spawning
    // one thread-worker per file is also unstable here; running all files in a single
    // worker (fileParallelism: false) is what's actually reliable — verified over
    // multiple consecutive runs at deterministic 100% coverage.
    pool: "threads",
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.test-d.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      reporter: ["text", "json-summary"],

      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },

  },
});
