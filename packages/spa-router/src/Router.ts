import { matchPath } from "./match";
import { PageCache } from "./cache";
import { runTransition } from "./transitions";
import { ScrollManager } from "./scroll";
import { LayoutChainManager, toLayoutChain } from "./layoutChain";
import { HoverPrefetcher, preloadCriticalRoutes } from "./prefetch";
import { buildRoutePath } from "./defineRoutes";
import { QueryCache, type CacheKey } from "./queryCache";
import { query } from "./query";
import { isDeferredValue, type DeferredValue } from "./composeLoaders";
import {
  createLinkedAbortController,
  isDeclarativeLoader,
  snapshotLocation,
  toRouteContext,
  type LayoutLoader,
  type NavigateOptions,
  type Navigation,
  type NavigationPhase,
  type NavigationPhaseEvent,
  type NavigationStatus,
  type PageLoader,
  type PageModule,
  type RouteContext,
  type RouteDefinition,
} from "./types";
import type { NamedRouteParams, RouteMap, RouteName } from "./defineRoutes";

interface ResolvedRoute {
  route: RouteDefinition;
  params: Record<string, string>;
  path: string;
}

export type StatusListener = (status: NavigationStatus) => void;
export type PhaseListener = (event: NavigationPhaseEvent) => void;

/**
 * Client-side SPA router: link interception, History API, route matching,
 * lazy-loaded pages, loaders, guards, caching, prefetching and scroll restoration.
 */
export class Router<Routes extends RouteMap = RouteMap> {
  private cache = new PageCache();
  private queryCache = new QueryCache();
  private cleanupCurrentPage: (() => void) | null = null;
  private statusListeners = new Set<StatusListener>();
  private phaseListeners = new Set<PhaseListener>();
  private scroll = new ScrollManager();
  private currentNavigationId = 0;
  private cancelledNavigationIds = new Set<number>();
  private layoutChain = new LayoutChainManager();
  private abortController: AbortController | null = null;
  private currentHref = location.href;
  private prefetcher = new HoverPrefetcher((path) => void this.prefetch(path));

  constructor(
    private routes: RouteDefinition[],
    private container: HTMLElement,
    private namedRoutes?: Routes,
  ) {
    history.scrollRestoration = "manual";
  }

  /** Starts the router: subscribes to popstate/click/hover-prefetch and renders the current route. */
  start(): void {
    window.addEventListener("popstate", () => {
      const previousHref = this.currentHref;
      this.scroll.save(new URL(previousHref).pathname + new URL(previousHref).search);
      void this.render({ isPopState: true, fromHref: previousHref });
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

  /** Subscribes to detailed lifecycle phase changes. Returns an unsubscribe function. */
  onPhaseChange(listener: PhaseListener): () => void {
    this.phaseListeners.add(listener);
    return () => this.phaseListeners.delete(listener);
  }

  /** Navigates using a configured route name and statically checked parameters. */
  navigate<Name extends RouteName<Routes>>(
    name: Name,
    params: NamedRouteParams<Routes, Name>,
    options?: NavigateOptions,
  ): void;
  /** @deprecated Prefer the named route overload when a route map is configured. */
  navigate(path: string, options?: NavigateOptions): void;
  navigate(pathOrName: string, paramsOrOptions: object = {}, namedOptions: NavigateOptions = {}): void {
    const namedPath = this.namedRoutes?.[pathOrName];
    const path = namedPath
      ? buildRoutePath(namedPath, paramsOrOptions as NamedRouteParams<Routes, RouteName<Routes>>)
      : pathOrName;
    const options = namedPath ? namedOptions : paramsOrOptions as NavigateOptions;
    const current = location.pathname + location.search;
    if (path === current && !options.replace) return;
    const previousHref = location.href;
    this.scroll.save(current);
    if (options.replace) history.replaceState(options.state ?? {}, "", path);
    else history.pushState(options.state ?? {}, "", path);
    void this.render({ fromHref: previousHref });
  }

  /** Returns a type-safe URL builder for a configured named route. */
  route<Name extends RouteName<Routes>>(name: Name): {
    href: (params: NamedRouteParams<Routes, Name>) => string;
  } {
    const path = this.namedRoutes?.[name];
    if (!path) throw new Error(`Unknown route '${name}'.`);
    return { href: (params) => buildRoutePath(path, params) };
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

  /** Prefetches a named route or a path into the same cache used by navigation. */
  async prefetch<Name extends RouteName<Routes>>(
    name: Name,
    params: NamedRouteParams<Routes, Name>,
  ): Promise<void>;
  async prefetch(path: string): Promise<void>;
  async prefetch(pathOrName: string, params?: object): Promise<void> {
    const template = this.namedRoutes?.[pathOrName];
    const path = template
      ? buildRoutePath(template, (params ?? {}) as NamedRouteParams<Routes, RouteName<Routes>>)
      : pathOrName;
    if (this.cache.has(path)) return;
    try {
      const resolved = this.resolveWithRedirects(new URL(path, location.href));
      const module = await resolved.route.load();
      const pageLoader = module.default.loader;
      if (!pageLoader) return;
      const controller = new AbortController();
      const navigation = this.createNavigation(0, location.href, resolved, controller.signal);
      const ctx = toRouteContext(navigation);
      if (isDeclarativeLoader(pageLoader)) {
        await query({
          key: pageLoader.key(ctx),
          loader: () => pageLoader.load(ctx),
          staleTime: pageLoader.staleTime,
          cache: this.queryCache,
        });
      } else {
        this.cache.set(path, await pageLoader(ctx));
      }
    } catch {
      // Prefetch is best-effort; regular navigation retries failures.
    }
  }

  /** Invalidates route-level query data. */
  invalidate(key: CacheKey): void {
    this.queryCache.invalidate(key);
  }

  private resolve(pathname: string): ResolvedRoute | null {
    for (const route of this.routes) {
      if (route.path === "*") continue;
      const params = matchPath(route.path, pathname);
      if (params) return { route, params, path: pathname };
    }
    return null;
  }

  private resolveWithRedirects(initial: URL): ResolvedRoute {
    let url = initial;
    const visited = new Set<string>();
    for (let redirects = 0; redirects <= 10; redirects++) {
      if (visited.has(url.pathname)) throw new Error(`Redirect cycle detected at '${url.pathname}'.`);
      visited.add(url.pathname);
      const resolved = this.resolve(url.pathname);
      const route = resolved?.route ?? this.routes.find((candidate) => candidate.path === "*");
      if (!route) throw new Error("No route matched and no '*' fallback route is registered.");
      if (!route.redirectTo) return { route, params: resolved?.params ?? {}, path: url.pathname + url.search };
      url = new URL(route.redirectTo, url);
    }
    throw new Error("Too many redirects (maximum is 10).");
  }

  private createNavigation(
    id: number,
    fromHref: string,
    resolved: ResolvedRoute,
    signal: AbortSignal,
  ): Navigation {
    const target = new URL(resolved.path, location.href);
    return {
      id,
      from: snapshotLocation(new URL(fromHref) as unknown as Location),
      to: snapshotLocation(target as unknown as Location),
      signal,
      params: resolved.params,
      search: target.searchParams,
    };
  }

  private setStatus(status: NavigationStatus): void {
    this.statusListeners.forEach((listener) => listener(status));
  }

  private setPhase(phase: NavigationPhase, navigation: Navigation): void {
    if (phase === "cancel") {
      if (this.cancelledNavigationIds.has(navigation.id)) return;
      this.cancelledNavigationIds.add(navigation.id);
    }
    this.phaseListeners.forEach((listener) => listener({ phase, navigation }));
    if (phase === "resolve") this.setStatus("loading");
    else if (phase === "success" || phase === "error") this.setStatus(phase);
  }

  private isActive(navigation: Navigation): boolean {
    if (navigation.id === this.currentNavigationId) return true;
    this.setPhase("cancel", navigation);
    return false;
  }

  private async executeLoader(
    pageLoader: PageLoader,
    ctx: RouteContext,
    path: string,
    navigation: Navigation,
  ): Promise<{ data: unknown; background?: Promise<unknown> }> {
    if (isDeclarativeLoader(pageLoader)) {
      const result = await query({
        key: pageLoader.key(ctx),
        loader: async () => {
          const data = await pageLoader.load(ctx);
          if (!this.isActive(navigation)) throw new DOMException("Navigation cancelled", "AbortError");
          return data;
        },
        staleTime: pageLoader.staleTime,
        cache: this.queryCache,
      });
      return { data: result.data, background: result.revalidation };
    }
    const cached = this.cache.get<unknown>(path);
    if (cached && !cached.stale) return { data: cached.data };
    if (cached) return { data: cached.data, background: this.revalidateLegacy(pageLoader, ctx, path, navigation) };

    const data = await pageLoader(ctx);
    if (this.isActive(navigation)) this.cache.set(path, data);
    return { data };
  }

  private async render(options: { isPopState?: boolean; fromHref?: string } = {}): Promise<void> {
    const id = ++this.currentNavigationId;
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    let resolved: ResolvedRoute | undefined;
    let navigation: Navigation | undefined;
    let page: PageModule | undefined;
    try {
      resolved = this.resolveWithRedirects(new URL(location.href));
      if (resolved.path !== location.pathname + location.search) history.replaceState(history.state, "", resolved.path);
      navigation = this.createNavigation(id, options.fromHref ?? this.currentHref, resolved, controller.signal);
      this.currentHref = navigation.to.href;
      this.setPhase("resolve", navigation);

      const layoutLoaders = toLayoutChain(resolved.route.layout);
      const common = this.layoutChain.commonPrefixLength(layoutLoaders);
      const pageModulePromise = resolved.route.load();
      const layoutModules = new Map<LayoutLoader, ReturnType<LayoutLoader>>();
      for (let index = common; index < layoutLoaders.length; index++) {
        layoutModules.set(layoutLoaders[index], layoutLoaders[index]());
      }
      page = (await pageModulePromise).default;
      if (!this.isActive(navigation)) return;

      if (page.guard) {
        this.setPhase("guard", navigation);
        const guardController = createLinkedAbortController(navigation.signal);
        try {
          if (!await page.guard(toRouteContext(navigation, guardController.signal))) {
            this.setPhase("cancel", navigation);
            return;
          }
        } finally {
          guardController.abort();
        }
      }
      if (!this.isActive(navigation)) return;

      let data: unknown;
      let background: Promise<unknown> | undefined;
      if (page.loader) {
        this.setPhase("load", navigation);
        const loaderController = createLinkedAbortController(navigation.signal);
        try {
          const result = await this.executeLoader(
            page.loader,
            toRouteContext(navigation, loaderController.signal),
            resolved.path,
            navigation,
          );
          data = result.data;
          background = result.background;
          if (background) void background.then(
            () => loaderController.abort(),
            () => loaderController.abort(),
          );
          else loaderController.abort();

        } catch (error) {
          loaderController.abort();
          throw error;
        }

      }
      if (!this.isActive(navigation)) return;

      const deferred = this.takeDeferred(data);
      this.setPhase("commit", navigation);
      this.setPhase("transition", navigation);
      await runTransition(async () => {
        if (!this.isActive(navigation!)) return;
        const pageContainer = await this.layoutChain.mount(
          layoutLoaders,
          common,
          toRouteContext(navigation!),
          layoutModules,
          this.container,
          () => this.disposePage(navigation!),
        );
        if (!this.isActive(navigation!)) return;
        this.disposePage(navigation!);
        pageContainer.innerHTML = "";
        const cleanup = page!.render(pageContainer, data, toRouteContext(navigation!));
        this.cleanupCurrentPage = typeof cleanup === "function" ? cleanup : null;
      });
      if (!this.isActive(navigation)) return;
      this.scroll.restore(resolved.path, options.isPopState ?? false);
      this.setPhase("success", navigation);
      void background?.then((fresh) => this.renderBackground(page!, fresh, navigation!)).catch(() => undefined);
      for (const job of deferred) {
        void job.value.run().then((value) => {
          job.target[job.key] = value;
          return this.renderBackground(page!, data, navigation!);
        }).catch(() => undefined);
      }
    } catch (error) {
      document.body.classList.remove("has-skeleton");
      if (navigation && !this.isActive(navigation)) return;
      console.error("Navigation error:", error);
      if (navigation) {
        this.setPhase("error", navigation);
        const boundary = page?.errorBoundary ?? resolved?.route.errorBoundary;
        if (boundary) {
          this.disposePage(navigation);
          this.layoutChain.disposeAll(this.container);
          const cleanup = boundary(this.container, error, toRouteContext(navigation));
          this.cleanupCurrentPage = typeof cleanup === "function" ? cleanup : null;
        }
      } else {
        this.setStatus("error");
      }
    }
  }

  private disposePage(navigation: Navigation): void {
    if (!this.cleanupCurrentPage) return;
    this.setPhase("dispose", navigation);
    this.cleanupCurrentPage();
    this.cleanupCurrentPage = null;
  }

  private takeDeferred(data: unknown): Array<{ target: Record<string, unknown>; key: string; value: DeferredValue<unknown> }> {
    if (typeof data !== "object" || data === null) return [];
    const target = data as Record<string, unknown>;
    const jobs: Array<{ target: Record<string, unknown>; key: string; value: DeferredValue<unknown> }> = [];
    for (const [key, value] of Object.entries(target)) {
      if (!isDeferredValue(value)) continue;
      jobs.push({ target, key, value });
      target[key] = undefined;
    }
    return jobs;
  }

  private async revalidateLegacy(
    loader: (ctx: RouteContext) => Promise<unknown>,
    ctx: RouteContext,
    path: string,
    navigation: Navigation,
  ): Promise<unknown> {
    const fresh = await loader(ctx);
    if (this.isActive(navigation)) this.cache.set(path, fresh);
    return fresh;
  }


  private async renderBackground(page: PageModule, data: unknown, navigation: Navigation): Promise<void> {
    if (!this.isActive(navigation)) return;
    const container = this.layoutChain.lastOutlet(this.container);
    this.disposePage(navigation);
    container.innerHTML = "";
    const cleanup = page.render(container, data, toRouteContext(navigation));
    this.cleanupCurrentPage = typeof cleanup === "function" ? cleanup : null;
  }

}
