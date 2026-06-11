import { matchPath } from "./match";
import { PageCache } from "./cache";
import { runTransition } from "./transitions";
import { ScrollManager } from "./scroll";
import { LayoutChainManager, toLayoutChain } from "./layoutChain";
import { HoverPrefetcher, preloadCriticalRoutes } from "./prefetch";
import type {
	LayoutLoader,
	NavigateOptions,
	NavigationStatus,
	PageModule,
	RouteContext,
	RouteDefinition,
} from "./types";

interface ResolvedRoute {
	route: RouteDefinition;
	params: Record<string, string>;
}

export type StatusListener = (status: NavigationStatus) => void;

/**
 * Client-side SPA router: link interception, History API, route matching,
 * lazy-loaded pages, loaders, guards, caching, prefetching and scroll restoration.
 */
export class Router {
	private cache = new PageCache();
	private cleanupCurrentPage: (() => void) | null = null;
	private statusListeners = new Set<StatusListener>();
	private scroll = new ScrollManager();
	private navId = 0;
	private layoutChain = new LayoutChainManager();
	private abortController: AbortController | null = null;
	private prefetcher = new HoverPrefetcher((path) => void this.prefetch(path));

	constructor(
		private routes: RouteDefinition[],
		private container: HTMLElement,
	) {
		history.scrollRestoration = "manual";
	}

	/** Starts the router: subscribes to popstate/click/hover-prefetch and renders the current route. */
	start(): void {
		window.addEventListener("popstate", () => {
			void this.render({ isPopState: true });
		});
		document.addEventListener("click", this.onClick);
		this.prefetcher.attach();
		void this.render();
		preloadCriticalRoutes(this.routes);
	}

	/** Subscribes to navigation status changes (loading/success/error). Returns an unsubscribe function. */
	onStatusChange(listener: StatusListener): () => void {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	}

	/** Navigates to the given path: updates the History API and re-renders the page. */
	navigate(path: string, options: NavigateOptions = {}): void {
		const current = location.pathname + location.search;
		if (path === current && !options.replace) return;

		this.scroll.save(current);

		if (options.replace) {
			history.replaceState(options.state ?? {}, "", path);
		} else {
			history.pushState(options.state ?? {}, "", path);
		}

		void this.render();
	}

	/** Intercepts clicks on internal links and performs SPA navigation instead of a full page reload. */
	private onClick = (event: MouseEvent): void => {
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

		const target = event.target;
		if (!(target instanceof Element)) return;

		const link = target.closest("a");
		if (!link) return;
		if (link.target && link.target !== "_self") return;
		if (link.hasAttribute("download")) return;
		if (link.dataset.noRouter !== undefined) return;

		const url = new URL(link.href, location.href);
		if (url.origin !== location.origin) return;

		event.preventDefault();
		this.navigate(url.pathname + url.search);
	};

	/** Prefetches page data on link hover (Next.js-style). */
	private async prefetch(path: string): Promise<void> {
		if (this.cache.has(path)) return;

		const resolved = this.resolve(path.split("?")[0]);
		if (!resolved || resolved.route.redirectTo) return;

		try {
			const module = await resolved.route.load();
			const loader = module.default.loader;
			if (!loader) return;

			const ctx = this.buildContext(path, resolved.params, new AbortController().signal);
			const data = await loader(ctx);
			this.cache.set(path, data);
		} catch {
			// Best-effort prefetch: errors are silently ignored, the main navigation will retry the request
		}
	}

	/** Finds the route matching the given pathname and extracts its params. */
	private resolve(pathname: string): ResolvedRoute | null {
		for (const route of this.routes) {
			if (route.path === "*") continue;
			const params = matchPath(route.path, pathname);
			if (params) return { route, params };
		}
		return null;
	}

	/** Builds the route context (path, params, query string, abort signal) for loader/guard/render. */
	private buildContext(
		path: string,
		params: Record<string, string>,
		signal: AbortSignal,
	): RouteContext {
		const [pathname, search = ""] = path.split("?");
		return { path: pathname, params, query: new URLSearchParams(search), signal };
	}

	/** Notifies all subscribers about a navigation status change. */
	private setStatus(status: NavigationStatus): void {
		this.statusListeners.forEach((listener) => listener(status));
	}

	/**
	 * Main render cycle: matches the route, runs the guard and loader (taking the cache
	 * into account), then mounts the page into the container and restores scroll.
	 */
	private async render(options: { isPopState?: boolean } = {}): Promise<void> {
		const navId = ++this.navId;
		this.abortController?.abort();
		const abortController = new AbortController();
		this.abortController = abortController;

		const path = location.pathname + location.search;
		const resolved = this.resolve(location.pathname);
		const fallback = this.routes.find((route) => route.path === "*");
		const matched = resolved?.route ?? fallback;

		this.setStatus("loading");

		try {
			if (!matched) throw new Error("No route matched and no '*' fallback route is registered.");

			if (matched.redirectTo) {
				this.navigate(matched.redirectTo, { replace: true });
				return;
			}

			const ctx = this.buildContext(path, resolved?.params ?? {}, abortController.signal);

			// The page module and the modules of new (changed) layouts in the chain are loaded in parallel
			const layoutChain = toLayoutChain(matched.layout);
			const common = this.layoutChain.commonPrefixLength(layoutChain);
			const pageModulePromise = matched.load();
			const layoutModulePromises = new Map<LayoutLoader, ReturnType<LayoutLoader>>();
			for (let i = common; i < layoutChain.length; i++) {
				layoutModulePromises.set(layoutChain[i], layoutChain[i]());
			}

			const module = await pageModulePromise;
			const page = module.default;

			if (page.guard) {
				const allowed = await page.guard(ctx);
				if (!allowed) return; // guard performs its own redirect (e.g. to /login)
			}

			const cached = page.loader ? this.cache.get<unknown>(path) : undefined;

			if (navId !== this.navId) return; // superseded by a newer navigation

			const pageContainer = await this.layoutChain.mount(
				layoutChain,
				common,
				ctx,
				layoutModulePromises,
				this.container,
				() => {
					this.cleanupCurrentPage?.();
					this.cleanupCurrentPage = null;
				},
			);
			if (navId !== this.navId) return; // superseded by a newer navigation

			let data: unknown;
			let usedSkeleton = false;

			// Instant part: clean up the previous page and either render from cache,
			// show a skeleton, or render pages without a loader — wrapped in a View
			// Transition for a smooth swap between pages.
			runTransition(() => {
				this.cleanupCurrentPage?.();
				pageContainer.innerHTML = "";

				if (page.loader && cached !== undefined) {
					data = cached.data;
					const cleanup = page.render(pageContainer, data, ctx);
					this.cleanupCurrentPage = typeof cleanup === "function" ? cleanup : null;
				} else if (page.loader && page.skeleton) {
					page.skeleton(pageContainer);
					document.body.classList.add("has-skeleton");
					usedSkeleton = true;
				} else if (!page.loader) {
					const cleanup = page.render(pageContainer, data, ctx);
					this.cleanupCurrentPage = typeof cleanup === "function" ? cleanup : null;
				}
			});

			if (page.loader) {
				if (cached !== undefined) {
					if (cached.stale) {
						void this.revalidate(page, ctx, path, navId);
					}
				} else {
					data = await page.loader(ctx);
					if (navId !== this.navId) return; // superseded by a newer navigation
					this.cache.set(path, data);

					if (usedSkeleton) {
						document.body.classList.remove("has-skeleton");
						pageContainer.innerHTML = "";
					}

					const cleanup = page.render(pageContainer, data, ctx);
					this.cleanupCurrentPage = typeof cleanup === "function" ? cleanup : null;
				}
			}

			this.scroll.restore(path, options.isPopState ?? false);
			this.setStatus("success");
		} catch (error) {
			document.body.classList.remove("has-skeleton");
			if (navId !== this.navId) return;
			console.error("Navigation error:", error);
			this.setStatus("error");
		}
	}

	/**
	 * Background refresh of stale page data: re-runs the page's `loader`, updates the
	 * cache, and re-renders the page if the user is still on it.
	 */
	private async revalidate(
		page: PageModule,
		ctx: RouteContext,
		path: string,
		navId: number,
	): Promise<void> {
		if (!page.loader) return;
		try {
			const fresh = await page.loader(ctx);
			this.cache.set(path, fresh);
			if (navId !== this.navId) return; // navigated away — no need to re-render

			const container = this.layoutChain.lastOutlet(this.container);
			this.cleanupCurrentPage?.();
			container.innerHTML = "";
			const cleanup = page.render(container, fresh, ctx);
			this.cleanupCurrentPage = typeof cleanup === "function" ? cleanup : null;
		} catch {
			// Best-effort background refresh: keep the stale data on error
		}
	}
}
