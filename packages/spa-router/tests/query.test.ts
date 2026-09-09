import { afterEach, describe, expect, it, vi } from "vitest";
import { query } from "../src/query";
import { defaultQueryCache, QueryCache } from "../src/queryCache";

describe("query", () => {
  afterEach(() => {
    vi.useRealTimers();
    defaultQueryCache.clear();
  });

  it("awaits expired data and uses the default cache", async () => {
    const loader = vi.fn().mockResolvedValue(1);
    expect(await query({ key: ["default"], loader })).toMatchObject({ data: 1, state: "expired" });
    expect((await query({ key: ["default"], loader })).state).toBe("fresh");
    expect(loader).toHaveBeenCalledOnce();
  });

  it("returns stale data and starts one background revalidation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const cache = new QueryCache();
    cache.set(["x"], 1, 1, 0);
    let resolve!: (value: number) => void;
    const loader = vi.fn(() => new Promise<number>((done) => { resolve = done; }));
    const first = await query({ key: ["x"], loader, staleTime: 5, cache });
    const second = await query({ key: ["x"], loader, staleTime: 5, cache });
    expect(first).toMatchObject({ data: 1, state: "stale" });
    expect(first.revalidation).toBe(second.revalidation);
    resolve(2);
    await first.revalidation;
    expect(loader).toHaveBeenCalledOnce();
  });
});
