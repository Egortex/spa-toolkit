import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		// See packages/spa-router/vitest.config.ts for why: vitest's default "forks" pool
		// crashes/times out sporadically on Windows in this repo once enough test files
		// spawn workers in parallel. Applied here proactively for consistency.
		pool: "threads",
		fileParallelism: false,
		include: ["tests/**/*.test.ts"],
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
