import { afterEach, describe, expect, it, vi } from "vitest";
import { PageCache } from "../src/cache";

describe("PageCache", () => {
  afterEach(() => vi.useRealTimers());

  it("stores, expires and clears values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const cache = new PageCache(10);
    expect(cache.get("missing")).toBeUndefined();
    expect(cache.has("missing")).toBe(false);
    cache.set("key", 1);
    expect(cache.get<number>("key")).toEqual({ data: 1, stale: false });
    expect(cache.has("key")).toBe(true);
    vi.setSystemTime(111);
    expect(cache.get<number>("key")).toEqual({ data: 1, stale: true });
    expect(cache.has("key")).toBe(false);
    cache.clear();
    expect(cache.get("key")).toBeUndefined();
  });
});
