import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { Router } from "../src/Router";
import { defer } from "../src/composeLoaders";
import { defineRoutes } from "../src/defineRoutes";
import { loader, type PageModule, type RouteDefinition } from "../src/types";

function moduleOf(page: PageModule): () => Promise<{ default: PageModule }> {
  return vi.fn(async () => ({ default: page }));
}

function waitForStatus(router: Router, expected: "success" | "error"): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = router.onStatusChange((status) => {
      if (status === expected) {
        unsubscribe();
        resolve();
      }
    });
  });
}

describe("Router", () => {
  beforeEach(() => {
    history.replaceState({}, "", "/");
    Object.defineProperty(window, "scrollTo", { value: vi.fn(), configurable: true });
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockReturnValue({ matches: true }),
      configurable: true,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("runs an atomic navigation lifecycle, typed helpers and cleanup", async () => {
    const cleanup = vi.fn();
    const phases: string[] = [];
    const first: PageModule = { render(container) { container.textContent = "home"; return cleanup; } };
    const second: PageModule = {
      guard: () => true,
      loader: async (ctx) => ({ id: ctx.params.id }),
      render(container, data) { container.textContent = (data as { id: string }).id; },
    };
    const definitions: RouteDefinition[] = [
      { path: "/", load: moduleOf(first) },
      { path: "/users/:id", load: moduleOf(second) },
    ];
    const names = defineRoutes({ home: "/", user: "/users/:id" });
    const container = document.createElement("main");
    const router = new Router(definitions, container, names);
    router.onPhaseChange(({ phase }) => phases.push(phase));
    const initial = waitForStatus(router, "success");
    router.start();
    await initial;
    expect(container.textContent).toBe("home");
    expect(router.route("user").href({ id: "a b" })).toBe("/users/a%20b");
    expect(() => router.route("missing" as "home")).toThrow("Unknown route");
    const next = waitForStatus(router, "success");
    router.navigate("user", { id: 7 }, { state: { source: "test" } });
    await next;
    expect(container.textContent).toBe("7");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(phases).toEqual(expect.arrayContaining(["resolve", "guard", "load", "commit", "transition", "dispose", "success"]));
  });

  it("cancels superseded loading without stale render or cache commit", async () => {
    let release!: (value: string) => void;
    const slowLoader = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const slow: PageModule = { loader: slowLoader, render(container, data) { container.textContent = String(data); } };
    const fast: PageModule = { render(container) { container.textContent = "fast"; } };
    const routes: RouteDefinition[] = [
      { path: "/slow", load: moduleOf(slow) },
      { path: "/fast", load: moduleOf(fast) },
    ];
    history.replaceState({}, "", "/slow");
    const container = document.createElement("main");
    const router = new Router(routes, container);
    const phases: string[] = [];
    router.onPhaseChange(({ phase }) => phases.push(phase));
    router.start();
    await vi.waitFor(() => expect(slowLoader).toHaveBeenCalled());
    const completed = waitForStatus(router, "success");
    router.navigate("/fast");
    release("stale");
    await completed;
    expect(container.textContent).toBe("fast");
    expect(phases.filter((phase) => phase === "cancel")).toHaveLength(1);
  });

  it("a stale navigation's loader resolving after the active one has already committed and rendered must not overwrite the DOM", async () => {
    // A pinned, fully deterministic worst-case ordering (found while building
    // a fast-check `fc.scheduler()`-based model test for the router's
    // navigation lifecycle — see Router.model.property.test.ts): nav0 starts
    // and gets far enough to call its own loader *before* nav1 supersedes it,
    // but nav0's loader only resolves *after* nav1 has fully committed and
    // rendered. If the router's isActive() guards around the commit/render
    // path were ever weakened, nav0's late data would land on screen last and
    // silently overwrite nav1's already-rendered page.
    //
    // Task registration order is fixed by this test's own call order:
    // 1=load-n0, 2=data-n0 (registered once load-n0 resolves, below), then
    // 3=load-n1, 4=data-n1 once nav1 is started. `schedulerFor` pins the
    // *resolution* order to 1, 3, 4, 2 — i.e. nav0's data resolves dead last.
    const s = fc.schedulerFor([1, 3, 4, 2]);
    const routes: RouteDefinition[] = [0, 1].map((i) => {
      const page: PageModule = {
        loader: async () => s.schedule(Promise.resolve(i), `data-n${i}`),
        render(container, data) {
          container.textContent = `page-${data}`;
        },
      };
      return { path: `/n${i}`, load: () => s.schedule(Promise.resolve({ default: page }), `load-n${i}`) };
    });

    history.replaceState({}, "", "/n0");
    const container = document.createElement("main");
    const router = new Router(routes, container);

    router.start(); // registers load-n0 (task 1)
    await s.waitOne(); // load-n0 resolves — nav0 still current, reaches its loader, registers data-n0 (task 2)

    router.navigate("/n1"); // supersedes nav0; registers load-n1 (task 3)
    await s.waitAll();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.textContent).toBe("page-1");
  });

  it("uses declarative cache for prefetch, stale refresh and invalidation", async () => {
    let value = 1;
    const load = vi.fn(async () => value);
    const page: PageModule = {
      loader: loader({ key: (ctx) => ["item", ctx.params.id], load, staleTime: 60_000 }),
      render(container, data) { container.textContent = String(data); },
    };
    const names = defineRoutes({ item: "/items/:id" });
    const router = new Router([{ path: "/items/:id", load: moduleOf(page) }], document.createElement("main"), names);
    await router.prefetch("item", { id: 1 });
    expect(load).toHaveBeenCalledOnce();
    history.replaceState({}, "", "/items/1");
    const done = waitForStatus(router, "success");
    router.start();
    await done;
    expect(load).toHaveBeenCalledOnce();
    router.invalidate(["item", "1"]);
    value = 2;
    await router.prefetch("/items/1");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("resolves redirects and renders route error boundaries", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const boundary = vi.fn((container: HTMLElement, error: unknown) => {
      container.textContent = (error as Error).message;
    });
    const broken: PageModule = { loader: async () => { throw new Error("broken"); }, render() { } };
    const routes: RouteDefinition[] = [
      { path: "/", redirectTo: "/broken", load: moduleOf({ render() { } }) },
      { path: "/broken", load: moduleOf(broken), errorBoundary: boundary },
    ];
    const container = document.createElement("main");
    const router = new Router(routes, container);
    const failed = waitForStatus(router, "error");
    router.start();
    await failed;
    expect(location.pathname).toBe("/broken");
    expect(container.textContent).toBe("broken");
    expect(boundary).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalled();
  });

  it("commits critical data before deferred data and rerenders its point", async () => {
    let release!: (value: string) => void;
    const deferredLoader = defer(() => new Promise<string>((resolve) => { release = resolve; }));
    const renders: string[] = [];
    const page: PageModule = {
      loader: async (ctx) => ({ critical: "ready", later: deferredLoader(ctx) }),
      render(_container, data) { renders.push(JSON.stringify(data)); },
    };
    const router = new Router([{ path: "/", load: moduleOf(page) }], document.createElement("main"));
    const done = waitForStatus(router, "success");
    router.start();
    await done;
    expect(renders).toEqual(['{"critical":"ready"}']);
    release("late");
    await vi.waitFor(() => expect(renders).toHaveLength(2));
    expect(renders[1]).toContain("late");
  });

  it("handles link interception branches and popstate", async () => {
    const page: PageModule = { render() { } };
    const router = new Router([{ path: "*", load: moduleOf(page) }], document.createElement("main"));
    const navigate = vi.spyOn(router, "navigate").mockImplementation(() => undefined);
    const onClick = (router as unknown as { onClick: (event: MouseEvent) => void }).onClick;
    const anchor = document.createElement("a");
    anchor.href = "/inside?q=1";
    const child = document.createElement("span");
    anchor.append(child);
    const click = (target: EventTarget, options: MouseEventInit = {}) => {
      const event = new MouseEvent("click", { button: 0, cancelable: true, ...options });
      Object.defineProperty(event, "target", { value: target });
      onClick(event);
      return event;
    };
    const prevented = click(child);
    expect(prevented.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/inside?q=1");
    const alreadyPrevented = new MouseEvent("click", { cancelable: true });
    alreadyPrevented.preventDefault();
    onClick(alreadyPrevented);

    click(anchor, { button: 1 });
    for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) click(anchor, { [modifier]: true });
    click(document);
    click(document.createElement("div"));
    anchor.target = "_blank"; click(anchor); anchor.target = "";
    anchor.download = "x"; click(anchor); anchor.removeAttribute("download");
    anchor.dataset.noRouter = ""; click(anchor); delete anchor.dataset.noRouter;
    anchor.href = "https://outside.test/a"; click(anchor);
    expect(navigate).toHaveBeenCalledOnce();

    navigate.mockRestore();
    history.replaceState({}, "", "/first");
    const finished = waitForStatus(router, "success");
    router.start();
    await finished;
    history.pushState({}, "", "/second");
    const popped = waitForStatus(router, "success");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await popped;
  });

  it("supports fallback layouts, guard cancellation, replacement and subscriptions", async () => {
    const outlet = document.createElement("section");
    const layoutCleanup = vi.fn();
    const layout = vi.fn(async () => ({ default: { render: vi.fn(() => ({ outlet, cleanup: layoutCleanup })) } }));
    const page: PageModule = { guard: () => false, render: vi.fn() };
    const router = new Router([{ path: "*", layout, load: moduleOf(page), preload: true }], document.createElement("main"));
    const phaseListener = vi.fn();
    const unsubscribePhase = router.onPhaseChange(phaseListener);
    const unsubscribeStatus = router.onStatusChange(vi.fn());
    router.start();
    await vi.waitFor(() => expect(phaseListener).toHaveBeenCalledWith(expect.objectContaining({ phase: "cancel" })));
    unsubscribePhase();
    unsubscribeStatus();
    router.navigate(location.pathname, { replace: false });
    router.navigate(location.pathname, { replace: true, state: { replaced: true } });
    await vi.waitFor(() => expect(history.state).toEqual({ replaced: true }));
  });

  it("covers legacy prefetch/cache refresh and ignored prefetch failures", async () => {
    let value = "old";
    const legacy = vi.fn(async () => value);
    const render = vi.fn();
    const route: RouteDefinition = { path: "/legacy", load: moduleOf({ loader: legacy, render }) };
    const router = new Router([route], document.createElement("main"));
    await router.prefetch("/legacy");
    await router.prefetch("/legacy");
    expect(legacy).toHaveBeenCalledOnce();
    history.replaceState({}, "", "/legacy");
    const first = waitForStatus(router, "success");
    router.start();
    await first;
    value = "fresh";
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);
    const second = waitForStatus(router, "success");
    router.navigate("/legacy?again=1");
    await second;
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    vi.useRealTimers();
    const empty = new Router([{ path: "/none", load: moduleOf({ render() { } }) }], document.createElement("main"));
    await empty.prefetch("/none");
    await empty.prefetch("/missing");
    const broken = new Router([{ path: "/bad", load: async () => { throw new Error("bad"); } }], document.createElement("main"));
    await expect(broken.prefetch("/bad")).resolves.toBeUndefined();
  });

  it("reports resolution failures and page-level boundaries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cyclic: RouteDefinition[] = [
      { path: "/a", redirectTo: "/b", load: moduleOf({ render() { } }) },
      { path: "/b", redirectTo: "/a", load: moduleOf({ render() { } }) },
    ];
    history.replaceState({}, "", "/a");
    const cycleRouter = new Router(cyclic, document.createElement("main"));
    const cycleFailed = waitForStatus(cycleRouter, "error");
    cycleRouter.start();
    await cycleFailed;
    const noRoute = new Router([], document.createElement("main"));
    await noRoute.prefetch("/missing");

    history.replaceState({}, "", "/page-error");
    const boundaryCleanup = vi.fn();
    const boundary = vi.fn(() => boundaryCleanup);
    const page: PageModule = {
      loader: async () => { throw new Error("page"); },
      render() { },
      errorBoundary: boundary,
    };
    const pageRouter = new Router([{ path: "/page-error", load: moduleOf(page) }], document.createElement("main"));
    const failed = waitForStatus(pageRouter, "error");
    pageRouter.start();
    await failed;
    expect(boundary).toHaveBeenCalled();
    expect(boundaryCleanup).not.toHaveBeenCalled();
  });

  it("cancels declarative work and an in-progress atomic layout commit", async () => {
    let releaseData!: (value: string) => void;
    const declarativePage: PageModule = {
      loader: loader({
        key: () => ["slow-declarative"],
        load: () => new Promise<string>((resolve) => { releaseData = resolve; }),
      }),
      render: vi.fn(),
    };
    const fast: PageModule = { render(container) { container.textContent = "fast"; } };
    const routes: RouteDefinition[] = [
      { path: "/declarative", load: moduleOf(declarativePage) },
      { path: "/fast", load: moduleOf(fast) },
    ];
    history.replaceState({}, "", "/declarative");
    const router = new Router(routes, document.createElement("main"));
    router.start();
    await vi.waitFor(() => expect(releaseData).toBeTypeOf("function"));
    const fastDone = waitForStatus(router, "success");
    router.navigate("/fast");
    releaseData("late");
    await fastDone;
    expect(declarativePage.render).not.toHaveBeenCalled();

    let releaseLayout!: (value: { default: { render: () => { outlet: HTMLElement } } }) => void;
    const delayedLayout = () => new Promise<{ default: { render: () => { outlet: HTMLElement } } }>((resolve) => {
      releaseLayout = resolve;
    });
    const committed = vi.fn();
    const layoutRouter = new Router([
      { path: "/layout", layout: delayedLayout, load: moduleOf({ render: committed }) },
      { path: "/fast", load: moduleOf(fast) },
    ], document.createElement("main"));
    history.replaceState({}, "", "/layout");
    layoutRouter.start();
    await vi.waitFor(() => expect(releaseLayout).toBeTypeOf("function"));
    const replacement = waitForStatus(layoutRouter, "success");
    layoutRouter.navigate("/fast");
    releaseLayout({ default: { render: () => ({ outlet: document.createElement("div") }) } });
    await replacement;
    expect(committed).not.toHaveBeenCalled();
  });

  it("revalidates stale declarative and legacy data in the background", async () => {
    let queryValue = 1;
    const queryRender = vi.fn(() => vi.fn());

    const declarativePage: PageModule = {
      loader: loader({ key: () => ["stale"], staleTime: -1, load: async () => ++queryValue }),
      render: queryRender,
    };
    history.replaceState({}, "", "/query");
    const queryRouter = new Router([{ path: "/query", load: moduleOf(declarativePage) }], document.createElement("main"));
    await queryRouter.prefetch("/query");
    const queryDone = waitForStatus(queryRouter, "success");
    queryRouter.start();
    await queryDone;
    await vi.waitFor(() => expect(queryRender).toHaveBeenCalledTimes(2));

    let legacyValue = 1;
    const legacyRender = vi.fn();
    const legacyPage: PageModule = { loader: async () => legacyValue, render: legacyRender };
    history.replaceState({}, "", "/old");
    const legacyRouter = new Router([{ path: "/old", load: moduleOf(legacyPage) }], document.createElement("main"));
    await legacyRouter.prefetch("/old");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31_000);
    legacyValue = 2;
    const legacyDone = waitForStatus(legacyRouter, "success");
    legacyRouter.start();
    await legacyDone;
    await Promise.resolve();
    expect(legacyRender).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("handles failed background jobs and layout-tail disposal", async () => {
    let shouldFail = false;
    const page: PageModule = {
      loader: loader({
        key: () => ["failure"],
        staleTime: -1,
        load: async () => {
          if (shouldFail) throw new Error("refresh failed");
          return 1;
        },
      }),
      render: vi.fn(),
    };
    const router = new Router([{ path: "/failure", load: moduleOf(page) }], document.createElement("main"));
    await router.prefetch("/failure");
    shouldFail = true;
    history.replaceState({}, "", "/failure");
    const done = waitForStatus(router, "success");
    router.start();
    await done;
    await Promise.resolve();

    const rejected = defer(() => Promise.reject(new Error("deferred failed")));
    const deferredRouter = new Router([{
      path: "/deferred-failure",
      load: moduleOf({ loader: async (ctx) => ({ rejected: rejected(ctx) }), render() { } }),
    }], document.createElement("main"));
    history.replaceState({}, "", "/deferred-failure");
    const deferredDone = waitForStatus(deferredRouter, "success");
    deferredRouter.start();
    await deferredDone;
    await Promise.resolve();

    const pageCleanup = vi.fn();
    const firstLayoutCleanup = vi.fn();
    const firstLayout = async () => ({
      default: {
        render: () => ({ outlet: document.createElement("section"), cleanup: firstLayoutCleanup }),
      }
    });
    const secondLayout = async () => ({
      default: {
        render: () => ({ outlet: document.createElement("section") }),
      }
    });
    const layoutRouter = new Router([
      { path: "/one", layout: firstLayout, load: moduleOf({ render: () => pageCleanup }) },
      { path: "/two", layout: secondLayout, load: moduleOf({ render() { } }) },
    ], document.createElement("main"));
    history.replaceState({}, "", "/one");
    const firstDone = waitForStatus(layoutRouter, "success");
    layoutRouter.start();
    await firstDone;
    const secondDone = waitForStatus(layoutRouter, "success");
    layoutRouter.navigate("/two");
    await secondDone;
    expect(pageCleanup).toHaveBeenCalledOnce();
    expect(firstLayoutCleanup).toHaveBeenCalledOnce();
  });

  it("prefetches through the router hover callback and covers inactive background guards", async () => {
    vi.useFakeTimers();
    const names = defineRoutes({ root: "/" });
    const router = new Router([{ path: "*", load: moduleOf({ render() { } }) }], document.createElement("main"), names);
    const prefetch = vi.spyOn(router, "prefetch").mockResolvedValue(undefined);
    const done = waitForStatus(router, "success");
    router.start();
    await done;
    const anchor = document.createElement("a");
    anchor.href = "/hovered";
    document.body.append(anchor);
    anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(120);
    expect(prefetch).toHaveBeenCalledWith("/hovered");
    anchor.remove();
    prefetch.mockRestore();
    await (router.prefetch as (name: string) => Promise<void>)("root");
    router.navigate(location.pathname, { replace: true });

    const inactiveNavigation = {
      id: -1,
      from: location,
      to: location,
      signal: new AbortController().signal,
      params: {},
      search: new URLSearchParams(),
    };
    const internals = router as unknown as {
      revalidateLegacy: (load: () => Promise<unknown>, ctx: never, path: string, navigation: typeof inactiveNavigation) => Promise<unknown>;
      renderBackground: (page: PageModule, data: unknown, navigation: typeof inactiveNavigation) => Promise<void>;
    };
    await internals.revalidateLegacy(async () => 1, {} as never, "/inactive", inactiveNavigation);
    await internals.renderBackground({ render: vi.fn() }, undefined, inactiveNavigation);
    vi.useRealTimers();
  });

  it("cancels while loading a module and while awaiting a guard", async () => {
    let releaseModule!: (value: { default: PageModule }) => void;
    const delayedModule = () => new Promise<{ default: PageModule }>((resolve) => { releaseModule = resolve; });
    const fast: PageModule = { render() { } };
    history.replaceState({}, "", "/module");
    const moduleRouter = new Router([
      { path: "/module", load: delayedModule },
      { path: "/fast", load: moduleOf(fast) },
    ], document.createElement("main"));
    moduleRouter.start();
    await vi.waitFor(() => expect(releaseModule).toBeTypeOf("function"));
    const moduleDone = waitForStatus(moduleRouter, "success");
    moduleRouter.navigate("/fast");
    releaseModule({ default: { render: vi.fn() } });
    await moduleDone;

    let releaseGuard!: (allowed: boolean) => void;
    const guarded: PageModule = {
      guard: () => new Promise<boolean>((resolve) => { releaseGuard = resolve; }),
      render: vi.fn(),
    };
    history.replaceState({}, "", "/guarded");
    const guardRouter = new Router([
      { path: "/guarded", load: moduleOf(guarded) },
      { path: "/fast", load: moduleOf(fast) },
    ], document.createElement("main"));
    guardRouter.start();
    await vi.waitFor(() => expect(releaseGuard).toBeTypeOf("function"));
    const guardDone = waitForStatus(guardRouter, "success");
    guardRouter.navigate("/fast");
    releaseGuard(true);
    await guardDone;
    expect(guarded.render).not.toHaveBeenCalled();
  });

  it("skips a transition callback when superseded before its atomic commit", async () => {
    let delayedUpdate!: () => void;
    let finishDelayed!: () => void;
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockReturnValue({ matches: false }),
      configurable: true,
    });
    Object.defineProperty(document, "startViewTransition", {
      value: vi.fn((update: () => void) => {
        delayedUpdate = update;
        return { updateCallbackDone: new Promise<void>((resolve) => { finishDelayed = resolve; }) };
      }),
      configurable: true,
    });
    const staleRender = vi.fn();
    const router = new Router([
      { path: "/stale-transition", load: moduleOf({ render: staleRender }) },
      { path: "/winner", load: moduleOf({ render() { } }) },
    ], document.createElement("main"));
    history.replaceState({}, "", "/stale-transition");
    router.start();
    await vi.waitFor(() => expect(delayedUpdate).toBeTypeOf("function"));
    Object.defineProperty(document, "startViewTransition", {
      value: vi.fn((update: () => void) => {
        update();
        return { updateCallbackDone: Promise.resolve() };
      }),
      configurable: true,
    });
    const winner = waitForStatus(router, "success");
    router.navigate("/winner");
    await winner;
    delayedUpdate();
    finishDelayed();
    await Promise.resolve();
    expect(staleRender).not.toHaveBeenCalled();
  });

  it("reports an active navigation error when no boundary is configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    history.replaceState({}, "", "/unhandled");
    const router = new Router([{
      path: "/unhandled",
      load: moduleOf({ loader: async () => { throw new Error("unhandled"); }, render() { } }),
    }], document.createElement("main"));
    const failed = waitForStatus(router, "error");
    router.start();
    await failed;
  });

  it("shows the page's skeleton while a loader without cached data is pending, then replaces it", async () => {
    let release!: (value: string) => void;
    const slowLoader = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const skeleton = vi.fn((container: HTMLElement) => { container.textContent = "loading skeleton"; });
    const page: PageModule = {
      loader: slowLoader,
      skeleton,
      render(container, data) { container.textContent = String(data); },
    };
    const container = document.createElement("main");
    history.replaceState({}, "", "/slow");
    const router = new Router([{ path: "/slow", load: moduleOf(page) }], container);
    router.start();

    await vi.waitFor(() => expect(skeleton).toHaveBeenCalledTimes(1));
    expect(container.textContent).toBe("loading skeleton");
    expect(document.body.classList.contains("has-skeleton")).toBe(true);

    const done = waitForStatus(router, "success");
    release("real data");
    await done;

    expect(container.textContent).toBe("real data");
    expect(document.body.classList.contains("has-skeleton")).toBe(false);
  });

  it("skips the skeleton once a legacy loader's data is already cached", async () => {
    const skeleton = vi.fn();
    const page: PageModule = {
      loader: async () => "value",
      skeleton,
      render(container, data) { container.textContent = String(data); },
    };
    const other: PageModule = { render(container) { container.textContent = "other"; } };
    const container = document.createElement("main");
    history.replaceState({}, "", "/cached");
    const router = new Router([
      { path: "/cached", load: moduleOf(page) },
      { path: "/other", load: moduleOf(other) },
    ], container);

    const first = waitForStatus(router, "success");
    router.start();
    await first;
    expect(skeleton).toHaveBeenCalledTimes(1); // no cache yet on the first visit

    const toOther = waitForStatus(router, "success");
    router.navigate("/other");
    await toOther;

    const back = waitForStatus(router, "success");
    router.navigate("/cached");
    await back;

    expect(skeleton).toHaveBeenCalledTimes(1); // still 1: the second visit hit the cache, nothing to wait for
  });

  it("skips the skeleton once a declarative loader's query cache entry is fresh", async () => {
    const skeleton = vi.fn();
    const page: PageModule = {
      loader: loader({ key: () => ["thing"], load: async () => "value" }),
      skeleton,
      render(container, data) { container.textContent = String(data); },
    };
    const other: PageModule = { render(container) { container.textContent = "other"; } };
    const container = document.createElement("main");
    history.replaceState({}, "", "/declarative");
    const router = new Router([
      { path: "/declarative", load: moduleOf(page) },
      { path: "/other", load: moduleOf(other) },
    ], container);

    const first = waitForStatus(router, "success");
    router.start();
    await first;
    expect(skeleton).toHaveBeenCalledTimes(1);

    const toOther = waitForStatus(router, "success");
    router.navigate("/other");
    await toOther;

    const back = waitForStatus(router, "success");
    router.navigate("/declarative");
    await back;

    expect(skeleton).toHaveBeenCalledTimes(1);
  });

  it("disposes the previous page when mounting the skeleton for a route with a different layout", async () => {
    const firstLayout = async () => ({
      default: { render: () => ({ outlet: document.createElement("section") }) },
    });
    let release!: (value: string) => void;
    const skeleton = vi.fn();
    const container = document.createElement("main");
    history.replaceState({}, "", "/one");
    const router = new Router([
      { path: "/one", layout: firstLayout, load: moduleOf({ render(container) { container.textContent = "one"; } }) },
      {
        path: "/two",
        load: moduleOf({
          loader: () => new Promise<string>((resolve) => { release = resolve; }),
          skeleton,
          render(container, data) { container.textContent = String(data); },
        }),
      },
    ], container);

    const first = waitForStatus(router, "success");
    router.start();
    await first;

    router.navigate("/two");
    await vi.waitFor(() => expect(skeleton).toHaveBeenCalledTimes(1));

    const done = waitForStatus(router, "success");
    release("two");
    await done;
    expect(container.textContent).toBe("two");
  });

  it("bails out of skeleton mounting if superseded while its layout is still loading", async () => {
    let releaseLayout!: (value: { default: { render: () => { outlet: HTMLElement } } }) => void;
    const delayedLayout = () => new Promise<{ default: { render: () => { outlet: HTMLElement } } }>((resolve) => {
      releaseLayout = resolve;
    });
    const skeleton = vi.fn();
    const page: PageModule = {
      loader: () => new Promise<never>(() => { /* superseded before it matters */ }),
      skeleton,
      render() { /* never reached */ },
    };
    const fast: PageModule = { render(container) { container.textContent = "fast"; } };
    const container = document.createElement("main");
    history.replaceState({}, "", "/slow-layout");
    const router = new Router([
      { path: "/slow-layout", layout: delayedLayout, load: moduleOf(page) },
      { path: "/fast", load: moduleOf(fast) },
    ], container);

    router.start();
    await vi.waitFor(() => expect(releaseLayout).toBeTypeOf("function"));

    const fastDone = waitForStatus(router, "success");
    router.navigate("/fast");
    releaseLayout({ default: { render: () => ({ outlet: document.createElement("div") }) } });
    await fastDone;

    expect(skeleton).not.toHaveBeenCalled();
    expect(container.textContent).toBe("fast");
  });

  it("removes has-skeleton if the loader fails while the skeleton was showing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const skeleton = vi.fn();
    const page: PageModule = {
      loader: async () => { throw new Error("boom"); },
      skeleton,
      render() { /* never reached */ },
    };
    const container = document.createElement("main");
    history.replaceState({}, "", "/fails");
    const router = new Router([{ path: "/fails", load: moduleOf(page) }], container);

    const failed = waitForStatus(router, "error");
    router.start();
    await failed;

    expect(skeleton).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains("has-skeleton")).toBe(false);
  });
});



