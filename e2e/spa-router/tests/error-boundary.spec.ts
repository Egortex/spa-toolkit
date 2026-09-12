import { test, expect } from "@playwright/test";

// Error boundary behavior:
//   1. A loader that always rejects should have its rejection caught
//      internally by the router and rendered via the route's errorBoundary,
//      never surfacing as an unhandled browser-level pageerror.
//   2. If the navigation whose loader eventually fails has already been
//      superseded by a newer navigation, the stale failure must never flash
//      the error boundary onto the screen, must never corrupt whatever the
//      newer navigation is currently displaying, and must never surface as
//      an unhandled pageerror either — it should simply be swallowed as a
//      cancelled navigation.

test("loader rejection is caught and rendered via the error boundary", async ({ page }) => {
	// Collect any uncaught exceptions the page itself throws. The router is
	// expected to catch the loader's rejection internally, so this must stay
	// empty for the whole test.
	const pageErrors: Error[] = [];
	page.on("pageerror", (err) => pageErrors.push(err));

	await page.goto("/");
	await page.getByTestId("link-error").click();

	// The loader takes ~300ms and then always throws. expect() polls/retries,
	// so this proves the boundary eventually renders.
	await expect(page.getByTestId("error-boundary")).toBeVisible();
	await expect(page.getByTestId("error-boundary")).toHaveText("Error: boom");

	// The loader must actually have run (not skipped/cached).
	const errorLoaderCalls = await page.evaluate(() => window.__calls__.errorLoader);
	expect(errorLoaderCalls).toBeGreaterThan(0);

	// The phase-event log must record an "error" phase for /error-demo.
	const events = await page.evaluate(() => window.__events__);
	const errorEvents = events.filter((e) => e.phase === "error" && e.path === "/error-demo");
	expect(errorEvents.length).toBeGreaterThan(0);

	// No unhandled browser-level exception should have occurred — the router
	// must have caught the rejection itself.
	expect(pageErrors).toEqual([]);
});

test("a superseded navigation's loader failure must never surface", async ({ page }) => {
	const pageErrors: Error[] = [];
	page.on("pageerror", (err) => pageErrors.push(err));

	await page.goto("/");

	// Start the slow-failing navigation (/error-demo: 300ms loader delay,
	// then always throws), but don't wait for it to settle.
	await page.getByTestId("link-error").click();

	// Well before the 300ms failure fires, navigate away to a fast route.
	await page.waitForTimeout(80);
	await page.getByTestId("link-user-fast").click();

	// The fast navigation should win and render promptly.
	await expect(page.getByTestId("user-page")).toHaveText("user-2");

	// Wait past the point where /error-demo's loader would have thrown
	// (300ms from the original click; we've already waited 80ms, plus
	// whatever the /user/2 navigation and assertion took, so pad generously).
	await page.waitForTimeout(400);

	// The stale error boundary must never appear in the DOM at all.
	await expect(page.getByTestId("error-boundary")).toHaveCount(0);

	// The /user/2 content must still be showing, undisturbed by the
	// abandoned navigation's late-arriving failure.
	await expect(page.getByTestId("user-page")).toHaveText("user-2");

	// The loader did genuinely run and fail in the background...
	const errorLoaderCalls = await page.evaluate(() => window.__calls__.errorLoader);
	expect(errorLoaderCalls).toBeGreaterThan(0);

	// ...but no "error" phase event should ever have been logged for
	// /error-demo, since that navigation was cancelled before it could
	// settle. This is the concrete, DOM-visible harm this test guards
	// against: a cancelled navigation's error boundary must never be shown.
	const events = await page.evaluate(() => window.__events__);
	const staleErrorEvents = events.filter((e) => e.phase === "error" && e.path === "/error-demo");
	expect(staleErrorEvents.length).toBe(0);

	// ...and it must not have surfaced as an unhandled browser-level
	// exception either.
	expect(pageErrors).toEqual([]);
});
