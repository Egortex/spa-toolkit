import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { matchPath } from "../src/match";
import { buildRoutePath } from "../src/defineRoutes";

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const token = fc.array(fc.constantFrom(...ALPHABET.split("")), { minLength: 1, maxLength: 8 }).map((cs) => cs.join(""));

// Any non-slash, non-empty string — including Unicode, spaces and punctuation —
// is a legal param value; buildRoutePath/matchPath must round-trip all of them.
const paramValue = fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.length > 0 && !s.includes("/"));

interface Segment {
  kind: "static" | "param";
  name: string;
}

const patternArb: fc.Arbitrary<Segment[]> = fc
  .array(fc.record({ kind: fc.constantFrom<"static" | "param">("static", "param"), name: token }), {
    minLength: 1,
    maxLength: 4,
  })
  .map((segments) => {
    // De-duplicate param names so each one round-trips unambiguously.
    const seen = new Set<string>();
    return segments.map((seg) => {
      if (seg.kind !== "param") return seg;
      let name = seg.name;
      while (seen.has(name)) name = `${name}x`;
      seen.add(name);
      return { ...seg, name };
    });
  });

/**
 * R9: route matching is exact per static segment and decodes dynamic segments.
 * Property: for any pattern built from static/`:param` segments and any legal
 * values for its params, `matchPath(pattern, buildRoutePath(pattern, values))`
 * MUST recover exactly those values (after string coercion) — encode/decode and
 * pattern/match must be perfect inverses of one another, for arbitrary Unicode
 * and punctuation in param values, not just the "nice" ASCII cases the
 * hand-written unit tests happen to cover.
 */
describe("matchPath / buildRoutePath — property: round-trip through arbitrary patterns and param values", () => {
  it("recovers exactly the original param values for any static+dynamic pattern", () => {
    fc.assert(
      fc.property(
        patternArb.chain((segments) => {
          const paramNames = segments.filter((s) => s.kind === "param").map((s) => s.name);
          return fc.tuple(
            fc.constant(segments),
            fc.array(paramValue, { minLength: paramNames.length, maxLength: paramNames.length }),
          );
        }),
        ([segments, values]) => {
          const paramNames = segments.filter((s) => s.kind === "param").map((s) => s.name);
          const pattern = "/" + segments.map((s) => (s.kind === "param" ? `:${s.name}` : s.name)).join("/");
          const params = Object.fromEntries(paramNames.map((name, i) => [name, values[i]]));

          const path = buildRoutePath(pattern, params as never);
          const matched = matchPath(pattern, path);

          expect(matched).not.toBeNull();
          for (let i = 0; i < paramNames.length; i++) {
            expect(matched![paramNames[i]]).toBe(values[i]);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it("never matches when segment counts differ, for any pattern/path pair", () => {
    fc.assert(
      fc.property(
        fc.array(token, { minLength: 0, maxLength: 5 }),
        fc.array(token, { minLength: 0, maxLength: 5 }),
        (patternSegments, pathSegments) => {
          fc.pre(patternSegments.length !== pathSegments.length);
          const pattern = "/" + patternSegments.join("/");
          const pathname = "/" + pathSegments.join("/");
          expect(matchPath(pattern, pathname)).toBeNull();
        },
      ),
      { numRuns: 300 },
    );
  });
});
