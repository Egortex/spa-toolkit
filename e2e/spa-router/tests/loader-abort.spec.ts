import { test, expect } from "@playwright/test";

// Loader abort: verifies the router's AbortSignal machinery for a superseded
// navigation actually fires *promptly* in a real browser event loop.
//
// /loader-abort's loader deliberately takes 2000ms unless its ctx.signal
// (documented as: "fires if this navigation was superseded by a newer one
// before the loader finished") is aborted, in which case it resolves
// immediately and increments window.__calls__.loaderAbortSignalled.
//
// This can't be verified meaningfully in jsdom: a naive/broken implementation
// that "eventually" settles things only when polled, or only on next tick of
// some unrelated timer, would look identical to a correct one if we only
// waited long enough. The key move here is asserting the signal fires within
// a tight window (well under 2s) right after being superseded — that's the
// only way to distinguish "the signal fired promptly because it was aborted"
// from "we just happened to wait past the natural 2s timeout anyway."

test("aborting a superseded navigation fires ctx.signal promptly, exactly once, without delaying the new navigation", async ({
	page,
}) => {
	await page.goto("/");

	// Start the slow loader-abort navigation (2000ms loader).
	await page.getByTestId("link-loader-abort").click();

	// Wait briefly — long enough for the navigation to be in flight, but far
	// short of the loader's 2000ms natural resolution — then navigate away.
	// This supersedes the in-flight /loader-abort navigation.
	await page.waitForTimeout(100);
	await page.getByTestId("link-user-fast").click();

	// Core assertion: the abort signal must fire promptly after being
	// superseded, not just "eventually" once the original 2s elapses.
	// expect.poll's short timeout (well under 2000ms) is what proves
	// promptness — if the implementation only resolved the loader via its
	// own setTimeout(2000) regardless of abort, this would time out here.
	await expect
		.poll(() => page.evaluate(() => window.__calls__.loaderAbortSignalled), {
			timeout: 500,
		})
		.toBe(1);

	// The navigation that superseded the aborted one must render promptly and
	// correctly — the abort bookkeeping must not block or delay it.
	await expect(page.getByTestId("user-page")).toHaveText("user-2");

	// Wait past where the original 2000ms loader timer would have fired
	// naturally, then confirm the counter is still exactly 1: the abort
	// handler must fire exactly once, never repeatedly (e.g. from the timer
	// callback *also* eventually running and somehow re-triggering it).
	await page.waitForTimeout(2000);
	expect(await page.evaluate(() => window.__calls__.loaderAbortSignalled)).toBe(1);

	// The destination page must still be showing correctly after the dust
	// settles.
	await expect(page.getByTestId("user-page")).toHaveText("user-2");
});

test("a loader-abort navigation that is never superseded completes naturally without ever signalling abort", async ({
	page,
}) => {
	await page.goto("/");

	// Navigate to /loader-abort and this time do NOT navigate away. Let its
	// loader run to completion on its own 2000ms timer.
	await page.getByTestId("link-loader-abort").click();

	// The page should render once the loader naturally resolves (~2000ms).
	await expect(page.getByTestId("loader-abort-page")).toBeVisible({ timeout: 3000 });

	// Contrast with the first test: since this navigation was never
	// superseded, ctx.signal must never have fired, even though the loader
	// took the full 2 seconds to resolve.
	expect(await page.evaluate(() => window.__calls__.loaderAbortSignalled)).toBe(0);
});
