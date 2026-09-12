import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { QueryCache, serializeCacheKey } from "../src/queryCache";

/** A JSON-plain value: string/number/boolean/null or nested arrays/objects of those. */
const jsonValue = fc.jsonValue({ maxDepth: 3 });

/** Rebuilds a value with every plain object's key order reversed, recursively. */
function reverseKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeyOrder);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).reverse();
    return entries.reduce<Record<string, unknown>>((acc, [k, v]) => {
      acc[k] = reverseKeyOrder(v);
      return acc;
    }, {});
  }
  return value;
}

/**
 * R10: cache keys serialize deterministically regardless of object property
 * order. Property: for any JSON-plain value, reversing every nested object's
 * key insertion order MUST NOT change `serializeCacheKey`'s output — the two
 * representations describe the same logical key and must collide in the cache.
 */
describe("serializeCacheKey — property: order-independent for arbitrary nested plain values", () => {
  it("produces the same key regardless of nested object key order", () => {
    fc.assert(
      fc.property(fc.array(jsonValue, { minLength: 1, maxLength: 4 }), (key) => {
        const reordered = key.map(reverseKeyOrder);
        expect(serializeCacheKey(key)).toBe(serializeCacheKey(reordered));
      }),
      { numRuns: 300 },
    );
  });

  it("distinguishes keys that differ in any leaf value", () => {
    fc.assert(
      fc.property(fc.array(jsonValue, { minLength: 1, maxLength: 3 }), fc.array(jsonValue, { minLength: 1, maxLength: 3 }), (a, b) => {
        fc.pre(JSON.stringify(a) !== JSON.stringify(b));
        expect(serializeCacheKey(a)).not.toBe(serializeCacheKey(b));
      }),
      { numRuns: 300 },
    );
  });
});

/**
 * R11: concurrent fetches for an identical cache key MUST be deduplicated.
 * Property: for any number of simultaneous `fetch()` calls sharing one key
 * (built from an arbitrary JSON-plain value, not just a trivial string), the
 * underlying loader MUST run exactly once, and every caller MUST receive that
 * single resolved value.
 */
describe("QueryCache.fetch — property: any number of concurrent callers on the same key dedupe to one loader call", () => {
  it("calls the loader exactly once and resolves every caller to the same value", async () => {
    await fc.assert(
      fc.asyncProperty(
        jsonValue,
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: 10 }),
        async (keyPart, callerCount, resolvedValue) => {
          const cache = new QueryCache();
          const loader = vi.fn(() => Promise.resolve(resolvedValue));
          const key = [keyPart];

          const results = await Promise.all(Array.from({ length: callerCount }, () => cache.fetch(key, loader, 10_000)));

          expect(loader).toHaveBeenCalledOnce();
          for (const result of results) expect(result).toBe(resolvedValue);
          expect(cache.get(key)?.data).toBe(resolvedValue);
        },
      ),
      { numRuns: 200 },
    );
  });
});
