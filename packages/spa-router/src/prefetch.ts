import type { RouteDefinition } from "./types";

/** Delay before a hover-triggered prefetch — cancelled if the cursor leaves the link sooner. */
export const PREFETCH_HOVER_DELAY_MS = 120;

/** Right after start, loads the JS chunks of routes with `preload: true` (except the current one), without waiting for a click. */
export function preloadCriticalRoutes(routes: RouteDefinition[]): void {
	for (const route of routes) {
		if (!route.preload || route.path === location.pathname) continue;
		void route.load().catch(() => {
			// Best-effort preload: errors are silently ignored
		});
	}
}

/**
 * Tracks hovers over internal links and, after a `PREFETCH_HOVER_DELAY_MS` delay,
 * calls `onPrefetch` with the link's path — this filters out "fly-by" hovers
 * (e.g. when quickly scrolling the mouse over a list of links). Cancelled on `mouseout`.
 */
export class HoverPrefetcher {
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private onPrefetch: (path: string) => void) {}

	/** Subscribes to `mouseover`/`mouseout` to intercept hovers over links. */
	attach(): void {
		document.addEventListener("mouseover", this.onMouseOver);
		document.addEventListener("mouseout", this.onMouseOut);
	}

	private onMouseOver = (event: MouseEvent): void => {
		const target = event.target;
		if (!(target instanceof Element)) return;

		const link = target.closest("a");
		if (!link) return;

		const url = new URL(link.href, location.href);
		if (url.origin !== location.origin) return;

		if (this.timer) clearTimeout(this.timer);
		const path = url.pathname + url.search;
		this.timer = setTimeout(() => {
			this.timer = null;
			this.onPrefetch(path);
		}, PREFETCH_HOVER_DELAY_MS);
	};

	private onMouseOut = (): void => {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	};
}
