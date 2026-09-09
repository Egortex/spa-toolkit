import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoverPrefetcher, PREFETCH_HOVER_DELAY_MS, preloadCriticalRoutes } from "../src/prefetch";
import type { RouteDefinition } from "../src/types";

const page = { render: vi.fn() };

function route(path: string, preload: boolean, load = vi.fn().mockResolvedValue({ default: page })): RouteDefinition {
  return { path, preload, load };
}

describe("prefetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    history.replaceState({}, "", "/current");
  });
  afterEach(() => vi.useRealTimers());

  it("preloads marked non-current routes and ignores failures", async () => {
    const current = route("/current", true);
    const skipped = route("/other", false);
    const loaded = route("/loaded", true);
    const failed = route("/failed", true, vi.fn().mockRejectedValue(new Error("no")));
    preloadCriticalRoutes([current, skipped, loaded, failed]);
    expect(current.load).not.toHaveBeenCalled();
    expect(skipped.load).not.toHaveBeenCalled();
    expect(loaded.load).toHaveBeenCalledOnce();
    await Promise.resolve();
  });

  it("prefetches an internal link after hover delay", () => {
    const callback = vi.fn();
    new HoverPrefetcher(callback).attach();
    const link = document.createElement("a");
    link.href = "/target?q=1";
    document.body.append(link);
    link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    vi.advanceTimersByTime(PREFETCH_HOVER_DELAY_MS);
    expect(callback).toHaveBeenCalledWith("/target?q=1");
  });

  it("cancels pending work and filters invalid targets and origins", () => {
    const callback = vi.fn();
    new HoverPrefetcher(callback).attach();
    document.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const div = document.createElement("div");
    document.body.append(div);
    div.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const external = document.createElement("a");
    external.href = "https://example.net/a";
    document.body.append(external);
    external.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const link = document.createElement("a");
    link.href = "/target";
    document.body.append(link);
    link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    link.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    link.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    vi.runAllTimers();
    expect(callback).not.toHaveBeenCalled();
  });
});
