import { test, expect } from "@playwright/test";

declare global {
	interface Window {
		// Exposed by the test app (app/main.ts) for direct, hover-free
		// client-side navigation in tests.
		__router__: { navigate(path: string): void };
	}
}

// Layout reuse: `/layout-demo/a` and `/layout-demo/b` both declare the SAME
// `shellLayout` loader function reference (see `app/main.ts`). The router's
// `LayoutChainManager` (packages/spa-router/src/layoutChain.ts) compares
// consecutive navigations' layout chains by `===` on the loader function and,
// when a prefix of the chain is unchanged, reuses the already-mounted layout
// instance (calling its `update()` hook) instead of tearing it down and
// remounting it from scratch.
//
// These tests verify that behavior end-to-end in a real browser:
//   - the first navigation into the layout mounts it (async loader runs,
//     ~400ms), and mounting increments `window.__calls__.layoutMounts`;
//   - a second navigation into a sibling route under the same layout does
//     NOT remount it (layoutMounts stays the same) but instead calls
//     `update()` on the existing instance (layoutUpdates increments);
//   - the DOM node identity of the layout shell is preserved across the
//     second navigation (proven via a custom marker attribute surviving),
//     not just visually identical but literally the same element.

test("navigating between sibling routes under the same layout reuses the mounted layout instead of remounting it", async ({
	page,
}) => {
	// --- Step 1: initial navigation into the layout via /layout-demo/a ---
	await page.goto("/");
	await page.getByTestId("link-layout-a").click();

	// The layout's loader simulates a slow lazy-loaded chunk (~400ms), so
	// wait for the shell and the nested page content to actually appear
	// rather than asserting immediately.
	await expect(page.getByTestId("layout-shell")).toBeVisible();
	await expect(page.getByTestId("layout-page")).toBeVisible();
	await expect(page.getByTestId("layout-page")).toHaveText("a");

	// The layout's own render() stamps the current path into layout-active.
	await expect(page.getByTestId("layout-active")).toHaveText("/layout-demo/a");

	// Fresh mount: the async loader ran exactly once, and since this is the
	// very first mount there's nothing yet to have called update() on.
	let calls = await page.evaluate(() => window.__calls__);
	expect(calls.layoutMounts).toBe(1);
	expect(calls.layoutUpdates).toBe(0);

	// --- Marker for DOM node identity check ---
	// Stamp a custom attribute directly on the mounted shell element. If the
	// router reuses the same DOM node across the next navigation (rather
	// than replacing it with a visually-identical new one), this attribute
	// must still be present afterwards.
	await page.evaluate(() => {
		const shell = document.querySelector('[data-testid="layout-shell"]') as HTMLElement;
		shell.dataset.marker = "same-instance";
	});

	// --- Step 2: navigate directly to the sibling route /layout-demo/b ---
	// There is no link from inside the layout's outlet straight to sibling
	// route "b" (the only links to it live on the home page, outside the
	// layout), and going via the home page first would itself unmount the
	// layout (home has no layout in its chain), which would legitimately
	// force a remount on the way back in — defeating the point of this
	// test. So we drive the router's own client-side `navigate()` API
	// directly (exposed as `window.__router__` in app/main.ts), which is
	// exactly what a click handler does under the hood, without a full
	// document reload and without detouring through a non-layout route.
	await page.evaluate(() => window.__router__.navigate("/layout-demo/b"));

	await expect(page.getByTestId("layout-page")).toHaveText("b");
	await expect(page.getByTestId("layout-active")).toHaveText("/layout-demo/b");

	// Key assertion: the layout must NOT have been remounted — the async
	// loader must not have run again.
	calls = await page.evaluate(() => window.__calls__);
	expect(calls.layoutMounts).toBe(1);

	// Key assertion: instead, the router called update() on the still-
	// mounted layout instance to refresh its content for the new path.
	expect(calls.layoutUpdates).toBe(1);

	// DOM node identity: the marker stamped on the original shell element
	// must still be present, proving the shell is literally the same DOM
	// node, not a new element that merely looks the same.
	const shellHandle = page.getByTestId("layout-shell");
	await expect(shellHandle).toHaveAttribute("data-marker", "same-instance");
});
