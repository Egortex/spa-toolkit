import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: [["list"]],
	use: {
		baseURL: "http://localhost:5391",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "pnpm exec vite",
		url: "http://localhost:5391",
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
