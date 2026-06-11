/** Stores and restores the scroll position between navigations (for back/forward buttons). */
export class ScrollManager {
	private positions = new Map<string, number>();

	/** Remembers the current scroll position for the given path (before leaving the page). */
	save(path: string): void {
		this.positions.set(path, window.scrollY);
	}

	/** Restores the scroll position on back/forward navigation, or scrolls to top on a regular navigation. */
	restore(path: string, isPopState: boolean): void {
		if (isPopState) {
			window.scrollTo(0, this.positions.get(path) ?? 0);
		} else {
			window.scrollTo(0, 0);
		}
	}
}
