import { test, expect } from "@playwright/test";

// defer(): the /defer-demo route's loader returns a "critical" field
// immediately and wraps a slow (600ms) inner loader in defer() for the
// "extra" field. This test verifies the router's streaming semantics in a
// real browser:
//   1. The initial commit does NOT wait for the deferred value — it renders
//      with the critical data and a "loading" placeholder almost instantly.
//   2. Once the deferred inner loader resolves (~600ms later), the router
//      re-renders the same page (via renderBackground) with the resolved
//      value, and the inner loader only ever runs once.
//   3. Race safety: if the user navigates away before the deferred value
//      resolves, the late-arriving deferred update must never leak into
//      whatever page is showing afterwards.

test("defer() commits critical data immediately and streams in the deferred value later", async ({ page }) => {
	await page.goto("/");
	await page.getByTestId("link-defer").click();

	// The initial commit must happen fast, well before the 600ms deferred
	// value could possibly be ready. A short timeout here is the point: if
	// the router incorrectly waited for the deferred promise before
	// committing, this would fail.
	await expect(page.getByTestId("defer-critical")).toHaveText("critical-value", { timeout: 200 });
	// At this same early point, the deferred field must still be showing its
	// placeholder — proving it genuinely hasn't resolved yet, not that it
	// resolved suspiciously fast.
	await expect(page.getByTestId("defer-extra")).toHaveText("loading");

	// Wait past the 600ms deferred delay, then confirm the page re-rendered
	// in the background with the resolved deferred value.
	await page.waitForTimeout(900);
	await expect(page.getByTestId("defer-extra")).toHaveText("deferred-value");

	// The deferred inner loader must have resolved exactly once.
	const deferCalls = await page.evaluate(() => window.__calls__.defer);
	expect(deferCalls).toBe(1);
});

test("a deferred value that resolves after navigating away must not leak into the new page", async ({ page }) => {
	await page.goto("/");
	await page.getByTestId("link-defer").click();

	// Confirm the defer-demo page committed before racing away from it.
	await expect(page.getByTestId("defer-critical")).toHaveText("critical-value", { timeout: 200 });

	// Navigate away well before the 600ms deferred value resolves (~150ms
	// in), abandoning the /defer-demo navigation while its deferred promise
	// is still in flight. The "user-fast" link only lives in the home
	// page's nav, not on /defer-demo, so we drive the navigation directly
	// through the router instance the app exposes on `window.__router__`
	// (equivalent to clicking a same-app link to /user/2).
	await page.waitForTimeout(150);
	await page.evaluate(() => {
		(window as unknown as { __router__: { navigate(path: string): void } }).__router__.navigate("/user/2");
	});

	// The new page should render correctly.
	await expect(page.getByTestId("user-page")).toHaveText("user-2");

	// Wait past the point where the original deferred value would resolve
	// (total time since navigating away from /defer-demo exceeds 600ms).
	await page.waitForTimeout(700);

	// The key race assertion: the stale deferred update from the abandoned
	// /defer-demo navigation must never overwrite the current DOM. The
	// user page must still be showing, and no trace of the defer-demo page
	// should remain.
	await expect(page.getByTestId("user-page")).toHaveText("user-2");
	await expect(page.getByTestId("defer-critical")).toHaveCount(0);
	await expect(page.getByTestId("defer-extra")).toHaveCount(0);

	// The abandoned inner loader may still fire in the background (defer()
	// doesn't necessarily cancel work in flight), but it must not have
	// produced more than the single resolution.
	const deferCalls = await page.evaluate(() => window.__calls__.defer);
	expect(deferCalls).toBeLessThanOrEqual(1);
});
