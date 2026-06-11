export interface RouteParams {
	[key: string]: string;
}

export interface RouteContext {
	path: string;
	params: RouteParams;
	query: URLSearchParams;
	/** Abort signal: fires if this navigation was superseded by a newer one before the loader finished. */
	signal: AbortSignal;
}

export type NavigationStatus = "idle" | "loading" | "success" | "error";

export type RenderResult = void | (() => void);

/**
 * Page contract: an optional loader (GET data), an optional guard
 * (route access check) and a required render. Methods are declared with
 * shorthand syntax so parameters are checked bivariantly — this allows
 * concrete PageModule<T> values to be assigned where the router expects
 * PageModule<unknown>.
 */
export interface PageModule<TData = unknown> {
	/** Loads page data before rendering (supports cache and prefetch). */
	loader?(ctx: RouteContext): Promise<TData>;
	/** Checks access to the route; on false it must perform the redirect itself. */
	guard?(ctx: RouteContext): Promise<boolean> | boolean;
	/**
	 * Renders temporary skeleton markup right after the layout is mounted,
	 * while the `loader` result is pending (only if there's no cached data yet).
	 * Replaced by the real content after `render`.
	 */
	skeleton?(container: HTMLElement): void;
	/** Renders the page into the container; may return a cleanup function called before leaving the page. */
	render(container: HTMLElement, data: TData, ctx: RouteContext): RenderResult;
}

/** Result of mounting a layout: the container for the page and optional update/cleanup hooks. */
export interface LayoutRenderResult {
	/** Element into which the router will render the current page. */
	outlet: HTMLElement;
	/** Called on every navigation if the layout is not recreated (e.g. to highlight the active link). */
	update?(ctx: RouteContext): void;
	/** Called before unmounting the layout (when navigating to a route with a different layout). */
	cleanup?(): void;
}

/** Layout contract: shared chrome (header, navigation) wrapping the pages of one section. */
export interface LayoutModule {
	render(container: HTMLElement, ctx: RouteContext): LayoutRenderResult;
}

/**
 * Lazily loads a layout module. Must be the same function reference for all routes
 * in one section, so the router can detect (by reference) that the layout hasn't
 * changed and avoid recreating it.
 */
export type LayoutLoader = () => Promise<{ default: LayoutModule }>;

export interface RouteDefinition {
	/** Route path, e.g. "/tasks/:id". The special value "*" is the fallback (404). */
	path: string;
	/** If set, the router immediately redirects to this path. */
	redirectTo?: string;
	/** Lazily loads the page module (code splitting). */
	load: () => Promise<{ default: PageModule }>;
	/**
	 * Lazily loads the layout (or chain of nested layouts) for this route.
	 * Each next layout is mounted into the `outlet` of the previous one (master-detail,
	 * nested sections, etc.). The router compares chains by function references
	 * and recreates only the changed "tail".
	 */
	layout?: LayoutLoader | LayoutLoader[];
	/** If true, the route module is preloaded right after the router starts (for frequently visited pages). */
	preload?: boolean;
}

export interface NavigateOptions {
	replace?: boolean;
	state?: Record<string, unknown>;
}
