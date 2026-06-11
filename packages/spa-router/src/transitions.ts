/**
 * Performs a DOM update via the View Transitions API (`document.startViewTransition`)
 * if the browser supports it and the user hasn't requested reduced motion
 * (`prefers-reduced-motion: reduce`). Otherwise just runs `update()` directly.
 */
export function runTransition(update: () => void): void {
	const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown };
	if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		update();
		return;
	}
	doc.startViewTransition(update);
}
