import {
	Router,
	defer,
	type ErrorBoundary,
	type LayoutLoader,
	type PageModule,
	type RouteDefinition,
} from "@chepchik/spa-router";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

declare global {
	interface Window {
		__calls__: {
			user: Array<{ id: string; at: number }>;
			prefetchTarget: number;
			layoutMounts: number;
			layoutUpdates: number;
			errorLoader: number;
			defer: number;
			loaderAbortSignalled: number;
		};
		__events__: Array<{ phase: string; id: number; path: string }>;
	}
}

window.__calls__ = {
	user: [],
	prefetchTarget: 0,
	layoutMounts: 0,
	layoutUpdates: 0,
	errorLoader: 0,
	defer: 0,
	loaderAbortSignalled: 0,
};
window.__events__ = [];

function moduleOf(page: PageModule): () => Promise<{ default: PageModule }> {
	return async () => ({ default: page });
}

// ---- home ---------------------------------------------------------------

const home: PageModule = {
	render(container) {
		container.innerHTML = `
			<nav>
				<a href="/user/1" data-testid="link-user-slow">User 1 (slow, 1500ms)</a>
				<a href="/user/2" data-testid="link-user-fast">User 2 (fast, 50ms)</a>
				<a href="/prefetch/target" data-testid="link-prefetch">Prefetch target</a>
				<a href="/redirect/from" data-testid="link-redirect">Redirect</a>
				<a href="/loader-abort" data-testid="link-loader-abort">Loader abort</a>
				<a href="/defer-demo" data-testid="link-defer">Defer demo</a>
				<a href="/layout-demo/a" data-testid="link-layout-a">Layout A</a>
				<a href="/layout-demo/b" data-testid="link-layout-b">Layout B</a>
				<a href="/error-demo" data-testid="link-error">Error demo</a>
			</nav>
		`;
	},
};

// ---- navigation race: /user/:id (loader delay depends on id) ------------

const userPage: PageModule = {
	async loader(ctx) {
		const id = ctx.params.id;
		window.__calls__.user.push({ id, at: performance.now() });
		await sleep(id === "1" ? 1500 : 50);
		return { id };
	},
	render(container, data) {
		container.innerHTML = `<div data-testid="user-page">user-${(data as { id: string }).id}</div>`;
	},
};

// ---- prefetch: hover should load ahead of click --------------------------

const prefetchTarget: PageModule = {
	async loader() {
		window.__calls__.prefetchTarget++;
		await sleep(800);
		return { loadedAt: performance.now() };
	},
	render(container) {
		container.innerHTML = `<div data-testid="prefetch-page">prefetch-loaded</div>`;
	},
};

// ---- loader: must observe its AbortSignal when superseded -----------------

const loaderAbort: PageModule = {
	loader(ctx) {
		return new Promise((resolve) => {
			const timer = setTimeout(() => resolve({}), 2000);
			ctx.signal.addEventListener("abort", () => {
				window.__calls__.loaderAbortSignalled++;
				clearTimeout(timer);
				resolve({});
			});
		});
	},
	render(container) {
		container.innerHTML = `<div data-testid="loader-abort-page">loader-abort-page</div>`;
	},
};

// ---- redirect --------------------------------------------------------------

const redirectTarget: PageModule = {
	render(container) {
		container.innerHTML = `<div data-testid="redirect-target">redirect-target</div>`;
	},
};

// ---- defer: critical data commits immediately, extra streams in later ----

const deferDemo: PageModule = {
	async loader(ctx) {
		return {
			critical: "critical-value",
			extra: defer(async () => {
				await sleep(600);
				window.__calls__.defer++;
				return "deferred-value";
			})(ctx),
		};
	},
	render(container, data) {
		const { critical, extra } = data as { critical: string; extra: string | undefined };
		container.innerHTML = `
			<div data-testid="defer-critical">${critical}</div>
			<div data-testid="defer-extra">${extra ?? "loading"}</div>
		`;
	},
};

// ---- layout: shared, slow-loading shell reused across sub-routes ---------

const shellLayout: LayoutLoader = async () => {
	window.__calls__.layoutMounts++;
	await sleep(400);
	return {
		default: {
			render(container, ctx) {
				container.innerHTML = `
					<div data-testid="layout-shell">
						<nav data-testid="layout-active">${ctx.path}</nav>
						<div data-testid="layout-outlet"></div>
					</div>
				`;
				const outlet = container.querySelector<HTMLElement>('[data-testid="layout-outlet"]')!;
				return {
					outlet,
					update(updatedCtx) {
						window.__calls__.layoutUpdates++;
						container.querySelector('[data-testid="layout-active"]')!.textContent = updatedCtx.path;
					},
				};
			},
		},
	};
};

function layoutPage(label: string): PageModule {
	return {
		render(container) {
			container.innerHTML = `<div data-testid="layout-page">${label}</div>`;
		},
	};
}

// ---- error boundary --------------------------------------------------------

const errorBoundary: ErrorBoundary = (container, error) => {
	container.innerHTML = `<div data-testid="error-boundary">Error: ${(error as Error).message}</div>`;
};

const errorDemo: PageModule = {
	async loader() {
		window.__calls__.errorLoader++;
		await sleep(300);
		throw new Error("boom");
	},
	render() {
		throw new Error("should never render — loader always throws");
	},
	errorBoundary,
};

// ---- route table -----------------------------------------------------------

const routes: RouteDefinition[] = [
	{ path: "/", load: moduleOf(home) },
	{ path: "/user/:id", load: moduleOf(userPage) },
	{ path: "/prefetch/target", load: moduleOf(prefetchTarget) },
	{ path: "/loader-abort", load: moduleOf(loaderAbort) },
	{ path: "/redirect/from", redirectTo: "/redirect/to", load: () => Promise.reject(new Error("must not load a redirect route")) },
	{ path: "/redirect/to", load: moduleOf(redirectTarget) },
	{ path: "/defer-demo", load: moduleOf(deferDemo) },
	{ path: "/layout-demo/a", layout: shellLayout, load: moduleOf(layoutPage("a")) },
	{ path: "/layout-demo/b", layout: shellLayout, load: moduleOf(layoutPage("b")) },
	{ path: "/error-demo", load: moduleOf(errorDemo) },
	{ path: "*", load: moduleOf({ render(container) { container.innerHTML = `<div data-testid="not-found">not found</div>`; } }) },
];

const container = document.getElementById("app")!;
const router = new Router(routes, container);
router.onPhaseChange(({ phase, navigation }) => {
	window.__events__.push({ phase, id: navigation.id, path: navigation.to.pathname });
});
(window as unknown as { __router__: Router }).__router__ = router;
router.start();
