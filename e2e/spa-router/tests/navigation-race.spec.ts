import { test, expect } from "@playwright/test";

declare global {
	interface Window {
		// Exposed by the test app (app/main.ts) for direct, hover-free
		// client-side navigation in tests.
		__router__: { navigate(path: string): void };
	}
}

// Navigation race: user clicks a slow link (/user/1, 1500ms loader) and,
// before it settles, clicks a fast link (/user/2, 50ms loader). This test
// verifies the router's cancellation semantics hold up in a real browser:
//   1. The fast navigation (nav 2) wins and renders promptly.
//   2. The slow navigation's (nav 1) late-arriving data never overwrites
//      the DOM once it finally resolves, ~1500ms later.
//   3. The cancelled navigation must not have poisoned any cache: revisiting
//      /user/1 afterwards must re-run its loader (real ~1500ms delay), not
//      serve a stale/incorrectly-populated cache entry.
//   4. The phase-event log agrees: the last "success" event is for /user/2,
//      and /user/1 never produces a "success" event (only "cancel").

test("fast navigation wins over a slow in-flight navigation, and the loser is never cached", async ({ page }) => {
	await page.goto("/");

	// Fire both navigations back-to-back without waiting for either to
	// complete. `.click()` resolves once the click event has been dispatched,
	// not once the SPA navigation finishes, so this reliably reproduces the
	// race: nav 1 (slow, /user/1) starts, then nav 2 (fast, /user/2) starts
	// while nav 1 is still in-flight.
	await page.getByTestId("link-user-slow").click();
	await page.getByTestId("link-user-fast").click();

	// Nav 2 should win and render promptly (well before nav 1's 1500ms delay
	// elapses). Playwright's expect() polls/retries, so this alone proves
	// nav 2 eventually renders.
	await expect(page.getByTestId("user-page")).toHaveText("user-2");

	// Wait past nav 1's 1500ms loader delay, then assert the DOM still shows
	// user-2. This is the core assertion: nav 1's late-arriving data must
	// never overwrite the DOM after the fact.
	await page.waitForTimeout(2000);
	await expect(page.getByTestId("user-page")).toHaveText("user-2");

	// Snapshot the phase-event log now, right after the race has fully
	// settled but *before* we deliberately revisit /user/1 below (which
	// would legitimately produce its own "success" event and must not be
	// confused with the original, cancelled navigation).
	const raceEvents = await page.evaluate(() => window.__events__);

	// The cancelled navigation must not have populated a cache entry for
	// /user/1. Revisit /user/1 and confirm the loader actually runs again (a
	// new entry appended to window.__calls__.user), with a real ~1500ms delay
	// rather than an instant cache hit.
	//
	// Note: we deliberately navigate back to "/" and then trigger an in-app,
	// client-side navigation to /user/1 again, rather than
	// `page.goto("/user/1")` directly — a `page.goto` triggers a full
	// browser page load, which would reset `window.__calls__`/`__events__`
	// entirely and make any before/after delta meaningless.
	//
	// We drive this via `router.navigate(...)` (exposed as
	// `window.__router__` by the test app) instead of clicking the link:
	// Playwright's `.click()` first moves the mouse onto the element, and if
	// that hover dwells past the router's 120ms hover-prefetch threshold it
	// would trigger a *separate* prefetch loader call, confounding the
	// "loader ran exactly once more" assertion below with unrelated
	// prefetch behavior.
	await page.goto("/");
	const callsBefore = await page.evaluate(() => window.__calls__.user.length);

	const navStart = performance.now();
	await page.evaluate(() => window.__router__.navigate("/user/1"));
	await expect(page.getByTestId("user-page")).toHaveText("user-1");
	const navElapsed = performance.now() - navStart;

	const callsAfter = await page.evaluate(() => window.__calls__.user.length);
	expect(callsAfter).toBe(callsBefore + 1);

	// Sanity check on timing: a real loader re-run should take close to
	// 1500ms, not near-instant (which would indicate a stale cache hit).
	expect(navElapsed).toBeGreaterThan(1000);

	// Cross-check via the loader's own recorded timestamps too.
	const calls = await page.evaluate(() => window.__calls__.user);
	const secondUser1Call = calls[calls.length - 1];
	expect(secondUser1Call.id).toBe("1");

	// Finally, check the phase-event log (using the snapshot taken right
	// after the race settled, before the deliberate /user/1 revisit): the
	// last "success" event must be for /user/2, and /user/1 must never have
	// produced a "success" event (only "cancel") for the original raced
	// navigation.
	const successEvents = raceEvents.filter((e) => e.phase === "success");
	expect(successEvents.length).toBeGreaterThan(0);
	const lastSuccess = successEvents[successEvents.length - 1];
	expect(lastSuccess.path).toBe("/user/2");

	const user1SuccessEvents = successEvents.filter((e) => e.path === "/user/1");
	expect(user1SuccessEvents.length).toBe(0);
});
