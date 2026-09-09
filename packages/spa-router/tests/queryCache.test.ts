import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryCache, serializeCacheKey } from "../src/queryCache";

describe("QueryCache", () => {
  afterEach(() => vi.useRealTimers());

  it("serializes nested objects stably and rejects cycles", () => {
    expect(serializeCacheKey(["x", { b: 2, a: [1] }])).toBe(serializeCacheKey(["x", { a: [1], b: 2 }]));
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => serializeCacheKey(cyclic)).toThrow("circular");
  });

  it("reports missing, fresh and stale entries and supports invalidation", () => {
    const cache = new QueryCache();
    expect(cache.get(["x"], 10)).toBeUndefined();
    cache.set(["x"], 1, 10, 10);
    expect(cache.get<number>(["x"], 20)?.state).toBe("fresh");
    expect(cache.get<number>(["x"], 21)?.state).toBe("stale");
    cache.invalidate(["x"]);
    expect(cache.get(["x"])).toBeUndefined();
    cache.set(["x"], 1);
    cache.clear();
    expect(cache.get(["x"])).toBeUndefined();
  });

  it("deduplicates successful and failed requests", async () => {
    const cache = new QueryCache();
    let resolve!: (value: number) => void;
    const loader = vi.fn(() => new Promise<number>((done) => { resolve = done; }));
    const first = cache.fetch(["x"], loader, 10);
    const second = cache.fetch(["x"], loader, 10);
    expect(first).toBe(second);
    resolve(3);
    await expect(first).resolves.toBe(3);
    expect(cache.get<number>(["x"])?.data).toBe(3);
    await expect(cache.fetch(["bad"], () => Promise.reject(new Error("bad")), 1)).rejects.toThrow("bad");
    expect(await cache.fetch(["bad"], () => Promise.resolve(4), 1)).toBe(4);
  });
});
