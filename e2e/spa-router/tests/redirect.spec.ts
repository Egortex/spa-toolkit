import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

// Redirect correctness: `/redirect/from` is defined with `redirectTo:
// "/redirect/to"` and a `load()` that deliberately rejects
// (`() => Promise.reject(new Error("must not load a redirect route"))`).
// By the router's design (see `resolveWithRedirects` in
// `packages/spa-router/src/Router.ts`), a route carrying `redirectTo` must
// never have its own `load()` invoked — the router should detect the
// redirect during resolution and jump straight to resolving
// `/redirect/to`. If `/redirect/from`'s `load()` were ever called, the
// rejection would surface as an uncaught error (page error / console
// error), which these tests watch for.

/**
 * Attaches `pageerror` and `console.error` listeners to `page` and returns
 * an array that accumulates human-readable descriptions of anything caught.
 * Must be called *before* navigating, since listeners only see events after
 * they're registered.
 */
function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on("pageerror", (err) => {
		errors.push(`pageerror: ${err.message}`);
	});
	page.on("console", (msg: ConsoleMessage) => {
		if (msg.type() === "error") {
			errors.push(`console.error: ${msg.text()}`);
		}
	});
	return errors;
}

test("client-side click on a redirect route jumps straight to the target, without invoking the redirect route's own loader", async ({
	page,
}) => {
	const errors = collectErrors(page);

	await page.goto("/");
	await page.getByTestId("link-redirect").click();

	// Final URL must be the redirect target, not the intermediate route.
	await expect(page).toHaveURL(/\/redirect\/to$/);

	// The target's content must be rendered.
	await expect(page.getByTestId("redirect-target")).toHaveText("redirect-target");

	// No page errors or console errors — in particular, none of the
	// "must not load a redirect route" rejection that /redirect/from's
	// load() would produce if it were ever (incorrectly) invoked.
	expect(errors).toEqual([]);

	// The phase-event log must never contain an "error" phase for this
	// navigation.
	const events = await page.evaluate(() => window.__events__);
	const errorEvents = events.filter((e) => e.phase === "error");
	expect(errorEvents).toEqual([]);

	// Sanity: we did in fact get a "success" event for the resolved target.
	const successEvents = events.filter((e) => e.phase === "success");
	expect(successEvents.some((e) => e.path === "/redirect/to")).toBe(true);
});

test("directly loading the redirect URL (full browser navigation) resolves to the target on initial render", async ({
	page,
}) => {
	const errors = collectErrors(page);

	// A real browser navigation straight to the redirecting route, rather
	// than a client-side navigate() — this exercises the redirect as part
	// of the router's own first render in router.start(), a different code
	// path than navigating via a click.
	await page.goto("/redirect/from");

	await expect(page).toHaveURL(/\/redirect\/to$/);
	await expect(page.getByTestId("redirect-target")).toHaveText("redirect-target");

	expect(errors).toEqual([]);

	const events = await page.evaluate(() => window.__events__);
	const errorEvents = events.filter((e) => e.phase === "error");
	expect(errorEvents).toEqual([]);
});

test("a redirect navigation superseded mid-flight by another click settles cleanly, without errors or stale content", async ({
	page,
}) => {
	const errors = collectErrors(page);

	await page.goto("/");

	// Fire the redirecting navigation twice back-to-back without waiting
	// for either to finish. The redirect target has no loader, so it can
	// resolve fast enough that a second `.click()` on the same locator
	// would find the link already gone from the DOM (the app has already
	// committed the redirect target, which has no nav). To reliably
	// reproduce "a second navigation starts while the first is still
	// in-flight" regardless of that timing, drive the router directly via
	// the `window.__router__` instance exposed by the test app (the same
	// `navigate()` the link's click handler would call).
	await page.evaluate(() => {
		const router = (window as unknown as { __router__: { navigate: (path: string) => void } }).__router__;
		router.navigate("/redirect/from");
		router.navigate("/redirect/from");
	});

	// Whichever navigation ultimately wins, the router must settle into a
	// single consistent state: the redirect target's content visible and
	// the URL matching it. No half-transitioned DOM, no thrown errors.
	await expect(page).toHaveURL(/\/redirect\/to$/);
	await expect(page.getByTestId("redirect-target")).toHaveText("redirect-target");

	expect(errors).toEqual([]);

	const events = await page.evaluate(() => window.__events__);
	const errorEvents = events.filter((e) => e.phase === "error");
	expect(errorEvents).toEqual([]);

	// At most one navigation should have actually reached "success" for
	// /redirect/to — the cancelled duplicate must not also report success
	// (it should instead show up as "cancel", if it shows up at all).
	const successToTarget = events.filter((e) => e.phase === "success" && e.path === "/redirect/to");
	expect(successToTarget.length).toBeLessThanOrEqual(1);
});
