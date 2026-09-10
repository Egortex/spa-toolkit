import type { Page } from "playwright";

/**
 * Waits for two consecutive animation frames (guarantees the browser has committed
 * a layout/paint after the triggering action's synchronous work) plus a small grace
 * window for async rendering (microtasks, short timers some frameworks use internally).
 *
 * Deliberately NOT MutationObserver-based: an earlier version watched `document.body`
 * with `subtree: true` and blew up the harness's own Node process with an out-of-memory
 * crash on the 100k-row scenario (100k rows x 4 cells = 400k+ queued mutation records).
 * Double-rAF + a fixed grace period is O(1) regardless of DOM size, and — since every
 * framework gets the exact same treatment — stays fair for cross-framework comparison
 * even though it's less precise than watching every mutation.
 */
async function waitForDomSettle(page: Page, graceMs = 100): Promise<void> {
	// Passed as a plain source string (not a TS closure) on purpose: tsx/esbuild can
	// inject a `__name(...)` helper call when transpiling named functions, which then
	// fails at runtime inside the browser's isolated evaluate context (no such helper
	// there). A string bypasses that transform entirely for this payload.
	await page.evaluate(`new Promise((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, ${graceMs})));
	})`);
}

export interface ActionMeasurement {
	/** Wall-clock ms from just before the trigger to DOM settle, measured via the in-page performance timeline. */
	ms: number;
}

/**
 * Measures one user-triggered action: marks the start right before `trigger()`,
 * runs it, waits for the DOM to settle (see `waitForDomSettle`), marks the end
 * and reads the duration back from the page's own `performance.measure` — this
 * keeps the measured window free of Node<->browser IPC round-trip noise.
 */
export async function measureAction(page: Page, trigger: () => Promise<void>): Promise<ActionMeasurement> {
	await page.evaluate(() => performance.mark("bench-start"));
	await trigger();
	await waitForDomSettle(page);
	const ms = await page.evaluate(() => {
		performance.mark("bench-end");
		const entry = performance.measure("bench", "bench-start", "bench-end");
		performance.clearMarks("bench-start");
		performance.clearMarks("bench-end");
		performance.clearMeasures("bench");
		return entry.duration;
	});
	return { ms };
}

/** Median of a list of numbers (odd length assumed after dropping the first warm-up sample). */
export function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Runs `action` `iterations + 1` times, discards the first (JIT/cache warm-up)
 * run and returns the median of the rest — standard noise-reduction for
 * micro/meso-benchmarks in a JIT'd environment.
 */
export async function measureRepeated(
	iterations: number,
	action: () => Promise<number>,
): Promise<{ medianMs: number; samples: number[] }> {
	const samples: number[] = [];
	for (let i = 0; i < iterations + 1; i++) samples.push(await action());
	const warmedUp = samples.slice(1);
	return { medianMs: median(warmedUp), samples };
}

/** Reads Chrome's (non-standard but Chromium-only-fine-here) JS heap size, after forcing GC via CDP. */
export async function measureHeapUsedMb(page: Page): Promise<number> {
	const client = await page.context().newCDPSession(page);
	await client.send("HeapProfiler.enable");
	await client.send("HeapProfiler.collectGarbage");
	const bytes = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
	await client.detach();
	return bytes / (1024 * 1024);
}
