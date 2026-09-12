import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { QueryCache } from "../src/queryCache";

/**
 * Model-based tests for the two races found while auditing `QueryCache`'s
 * cache-state correctness (see SPEC.md's cache state-machine section):
 *
 * 1. `invalidate()`/`clear()` don't (and can't) cancel an in-flight `fetch()` —
 *    they can only stop the cache from trusting its eventual result. A fetch
 *    started before invalidation must never repopulate the entry once it
 *    finally resolves, no matter how the timing works out.
 * 2. When a second `fetch()` replaces an invalidated one, the cache must end
 *    up reflecting the *second* fetch's result, never the orphaned first
 *    one's — regardless of which of the two actually resolves first in real
 *    time (an orphaned fetch resolving *after* its replacement must not undo
 *    the replacement).
 */
describe("QueryCache — model: invalidate()/clear() reliably disown in-flight fetches, for any timing", () => {
  it("a single in-flight fetch's result is written to the cache iff no invalidate() happened first", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), fc.boolean(), async (callerCount, invalidateBeforeResolve) => {
        const cache = new QueryCache();
        const key = ["k"];
        let loaderCalls = 0;
        let resolve!: (value: number) => void;

        const requests = Array.from({ length: callerCount }, () =>
          cache.fetch(key, () => { loaderCalls++; return new Promise<number>((r) => { resolve = r; }); }, 10_000),
        );
        // Any number of concurrent callers for the same, not-yet-resolved key
        // must dedupe onto exactly one real loader call.
        expect(loaderCalls).toBe(1);

        if (invalidateBeforeResolve) cache.invalidate(key);
        resolve(42);
        for (const request of requests) await expect(request).resolves.toBe(42);

        if (invalidateBeforeResolve) expect(cache.get(key)).toBeUndefined();
        else expect(cache.get<number>(key)?.data).toBe(42);
      }),
      { numRuns: 100 },
    );
  });

  it("an orphaned (invalidated) fetch never wins a race against the fetch that replaced it, regardless of resolution order", async () => {
    await fc.assert(
      fc.asyncProperty(fc.scheduler(), async (s) => {
        const cache = new QueryCache();
        const key = ["k"];

        const orphaned = cache.fetch(key, () => s.schedule(Promise.resolve("orphaned-value"), "orphaned"), 10_000);
        cache.invalidate(key);
        const fresh = cache.fetch(key, () => s.schedule(Promise.resolve("fresh-value"), "fresh"), 10_000);

        await s.waitAll();
        await Promise.all([orphaned, fresh]);

        // Whichever of the two scheduled tasks fast-check chose to resolve
        // first this run, the final cache entry must always be the fresh one.
        expect(cache.get<string>(key)?.data).toBe("fresh-value");
      }),
      { numRuns: 100 },
    );
  });

  it("clear() disowns an in-flight fetch the same way invalidate() does", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (clearBeforeResolve) => {
        const cache = new QueryCache();
        const key = ["k"];
        let resolve!: (value: number) => void;
        const request = cache.fetch(key, () => new Promise<number>((r) => { resolve = r; }), 10_000);

        if (clearBeforeResolve) cache.clear();
        resolve(1);
        await expect(request).resolves.toBe(1);

        if (clearBeforeResolve) expect(cache.get(key)).toBeUndefined();
        else expect(cache.get<number>(key)?.data).toBe(1);
      }),
      { numRuns: 50 },
    );
  });
});
