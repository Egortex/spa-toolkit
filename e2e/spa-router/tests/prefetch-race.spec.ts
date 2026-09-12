import { test, expect } from "@playwright/test";

// Hover-prefetch race: the router attaches a mouseover/mouseout listener to
// `document` (HoverPrefetcher, started by router.start()) for any internal
// <a>. After the pointer hovers a link continuously for
// PREFETCH_HOVER_DELAY_MS (120ms), it eagerly invokes the target route's
// loader and caches the result. If the user then actually clicks the link,
// the router should reuse that cached, already-resolved data instead of
// re-running the (slow) loader from scratch.
//
// These tests verify that invariant holds in a real browser, where hover
// timing and mouseover/mouseout dispatch behave differently than any jsdom
// simulation could:
//   1. A sustained hover (well past the 120ms debounce) triggers exactly one
//      loader call *before* any click happens, and a subsequent click renders
//      near-instantly while NOT triggering a second loader call.
//   2. A brief, fly-by hover (well under the 120ms debounce) must not
//      trigger a prefetch at all.

test("hovering long enough prefetches the route; the follow-up click reuses the cached load", async ({ page }) => {
	await page.goto("/");

	const link = page.getByTestId("link-prefetch");

	// Hover and hold. The hover-prefetch debounce (120ms) will fire, kicking
	// off the loader, which itself takes 800ms to resolve. Wait comfortably
	// longer than both so the prefetch has genuinely completed and cached its
	// result before we do anything else.
	await link.hover();
	await page.waitForTimeout(1200);

	// The loader must have run exactly once, purely from the hover — no click
	// has happened yet. This proves prefetch genuinely ran ahead of
	// navigation.
	const callsAfterHover = await page.evaluate(() => window.__calls__.prefetchTarget);
	expect(callsAfterHover).toBe(1);

	// Now actually click the link. If the router correctly reuses the cached,
	// already-resolved prefetch data, the page should render essentially
	// immediately rather than waiting another 800ms for a fresh loader run.
	await link.click();

	// A tight 200ms timeout here is the crux of the test: if the router had
	// to re-run the 800ms loader from scratch after the click, this
	// assertion would fail.
	await expect(page.getByTestId("prefetch-page")).toBeVisible({ timeout: 200 });

	// Give any (incorrect) background re-fetch a chance to complete before
	// checking the call count, so we're not just getting lucky on timing.
	await page.waitForTimeout(900);

	// The loader must still have been called exactly once in total: the
	// click must have served the cached prefetch, not silently discarded it
	// and re-fetched.
	const callsAfterClick = await page.evaluate(() => window.__calls__.prefetchTarget);
	expect(callsAfterClick).toBe(1);
});

test("a brief fly-by hover under the debounce threshold does not trigger a prefetch", async ({ page }) => {
	await page.goto("/");

	const link = page.getByTestId("link-prefetch");

	// Hover briefly — well under the ~120ms debounce — then move the pointer
	// away before the debounce timer can fire.
	await link.hover();
	await page.waitForTimeout(30);
	await page.mouse.move(0, 0);

	// Wait well past the debounce window to make sure no delayed prefetch
	// sneaks in, then confirm the loader was never invoked.
	await page.waitForTimeout(300);

	const calls = await page.evaluate(() => window.__calls__.prefetchTarget);
	expect(calls).toBe(0);
});
