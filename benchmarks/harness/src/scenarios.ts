import type { Page } from "playwright";
import { measureAction, measureRepeated } from "./metrics";

export interface ScenarioContext {
	page: Page;
	baseUrl: string;
}

export interface ScenarioDefinition {
	id: string;
	label: string;
	/** How many timed repeats to run (median is reported) — see SPEC.md for what each scenario measures. */
	iterations: number;
	run(ctx: ScenarioContext): Promise<{ medianMs: number; samples: number[] }>;
}

async function goto(page: Page, baseUrl: string, route: string, readySelector: string): Promise<void> {
	await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
	await page.waitForSelector(readySelector, { state: "attached", timeout: 15_000 });
}

const click = (page: Page, selector: string, timeoutMs = 30_000) => async () => {
	await page.click(selector, { timeout: timeoutMs });
};

export const scenarios: ScenarioDefinition[] = [
	{
		id: "initial-render",
		label: "Initial render (/)",
		iterations: 5,
		async run({ page, baseUrl }) {
			const samples: number[] = [];
			for (let i = 0; i < 6; i++) {
				await page.goto(`${baseUrl}/`, { waitUntil: "load" });
				await page.waitForSelector("#app-ready", { state: "attached", timeout: 15_000 });
				const ms = await page.evaluate(() => {
					const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
					return nav.domInteractive - nav.startTime;
				});
				samples.push(ms);
			}
			const warmedUp = samples.slice(1);
			warmedUp.sort((a, b) => a - b);
			const mid = Math.floor(warmedUp.length / 2);
			const medianMs = warmedUp.length % 2 === 0 ? (warmedUp[mid - 1] + warmedUp[mid]) / 2 : warmedUp[mid];
			return { medianMs, samples };
		},
	},
	{
		id: "create-1k",
		label: "Create 1,000 rows (#run)",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/table", "#table");
				const { ms } = await measureAction(page, click(page, "#run"));
				return ms;
			});
		},
	},
	{
		id: "create-10k",
		label: "Create 10,000 rows (#runlots)",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/table", "#table");
				const { ms } = await measureAction(page, click(page, "#runlots"));
				return ms;
			});
		},
	},
	{
		id: "create-100k",
		label: "Create 100,000 rows (#run100k)",
		// Deliberately a single shot, no repeat/warm-up: this is an extreme stress scenario
		// (100k rows x 4 cells x 2 listeners) that can crash the renderer outright on some
		// frameworks. A second navigation on the same page, right after tearing down 100k
		// nodes, was observed crashing Chromium mid-navigation ("frame was detached") — so
		// this scenario gets exactly one fresh page (see runner.ts's per-scenario page
		// isolation) and one measurement, not measureRepeated's usual warm-up-then-median.
		iterations: 0,
		async run({ page, baseUrl }) {
			await goto(page, baseUrl, "/table-100k", "#table");
			const { ms } = await measureAction(page, click(page, "#run100k", 60_000));
			return { medianMs: ms, samples: [ms] };
		},
	},
	{
		id: "append-1k",
		label: "Append 1,000 rows to 1,000 (#add)",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/table", "#table");
				await page.click("#run");
				await page.waitForSelector("#table tbody tr");
				const { ms } = await measureAction(page, click(page, "#add"));
				return ms;
			});
		},
	},
	{
		id: "update-every-10th",
		label: "Update every 10th of 1,000 rows (#update)",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/table", "#table");
				await page.click("#run");
				await page.waitForSelector("#table tbody tr");
				const { ms } = await measureAction(page, click(page, "#update"));
				return ms;
			});
		},
	},
	{
		id: "select-row",
		label: "Select a row",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/table", "#table");
				await page.click("#run");
				await page.waitForSelector("#table tbody tr");
				const { ms } = await measureAction(page, click(page, "#table tbody tr:nth-child(500) a"));
				return ms;
			});
		},
	},
	{
		id: "swap-rows",
		label: "Swap rows (#swaprows)",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/table", "#table");
				await page.click("#run");
				await page.waitForSelector("#table tbody tr");
				const { ms } = await measureAction(page, click(page, "#swaprows"));
				return ms;
			});
		},
	},
	{
		id: "remove-row",
		label: "Remove a row",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/table", "#table");
				await page.click("#run");
				await page.waitForSelector("#table tbody tr");
				const { ms } = await measureAction(page, click(page, "#table tbody tr:nth-child(500) [data-action=remove]"));
				return ms;
			});
		},
	},
	{
		id: "clear-1k",
		label: "Clear 1,000 rows (#clear)",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/table", "#table");
				await page.click("#run");
				await page.waitForSelector("#table tbody tr");
				const { ms } = await measureAction(page, click(page, "#clear"));
				return ms;
			});
		},
	},
	{
		id: "updates-1000-sequential",
		label: "1,000 sequential point updates",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(3, async () => {
				await goto(page, baseUrl, "/updates-1000", "#app-ready");
				const { ms } = await measureAction(page, click(page, "#update-1000-sequential"));
				return ms;
			});
		},
	},
	{
		id: "mount-1000-components",
		label: "Mount 1,000 components",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/components-1000", "#app-ready");
				const { ms } = await measureAction(page, click(page, "#mount-1000"));
				await page.click("#unmount-1000").catch(() => undefined);
				return ms;
			});
		},
	},
	{
		id: "large-form-fill",
		label: "Fill 200-field form (#fill-form)",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/large-form", "#large-form");
				const { ms } = await measureAction(page, click(page, "#fill-form"));
				return ms;
			});
		},
	},
	{
		id: "large-table-render",
		label: "Large table initial render (10k rows, 5+ cols)",
		iterations: 3,
		async run({ page, baseUrl }) {
			const samples: number[] = [];
			for (let i = 0; i < 4; i++) {
				await page.goto(`${baseUrl}/large-table`, { waitUntil: "load" });
				await page.waitForSelector("#big-table tbody tr", { timeout: 20_000 });
				const ms = await page.evaluate(() => {
					const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
					return nav.domInteractive - nav.startTime;
				});
				samples.push(ms);
			}
			const warmedUp = samples.slice(1).sort((a, b) => a - b);
			const mid = Math.floor(warmedUp.length / 2);
			const medianMs = warmedUp.length % 2 === 0 ? (warmedUp[mid - 1] + warmedUp[mid]) / 2 : warmedUp[mid];
			return { medianMs, samples };
		},
	},
	{
		id: "large-table-sort",
		label: "Large table sort (10k rows)",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/large-table", "#big-table");
				await page.waitForSelector("#big-table tbody tr");
				const { ms } = await measureAction(page, click(page, "#big-table-sort"));
				return ms;
			});
		},
	},
	{
		id: "large-table-filter",
		label: "Large table filter (10k rows)",
		iterations: 5,
		async run({ page, baseUrl }) {
			return measureRepeated(5, async () => {
				await goto(page, baseUrl, "/large-table", "#big-table");
				await page.waitForSelector("#big-table tbody tr");
				const { ms } = await measureAction(page, click(page, "#big-table-filter"));
				return ms;
			});
		},
	},
	{
		id: "route-navigation",
		label: "SPA route navigation (a -> b, fresh each time)",
		iterations: 8,
		async run({ page, baseUrl }) {
			return measureRepeated(8, async () => {
				await goto(page, baseUrl, "/route-a", "#route-ready");
				const { ms } = await measureAction(page, click(page, "#nav-to-b"));
				return ms;
			});
		},
	},
];
