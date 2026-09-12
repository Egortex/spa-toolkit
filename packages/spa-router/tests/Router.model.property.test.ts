import { beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { Router } from "../src/Router";
import type { NavigationPhase, PageModule, RouteDefinition } from "../src/types";

/**
 * Model-based test: instead of fuzzing *timing* (random `setTimeout` delays, as
 * in the other `*.property.test.ts` files), this uses fast-check's `fc.scheduler()`
 * to fuzz the *order of events* directly — deciding, across hundreds of runs,
 * exactly which pending async step (a route's module import, or its loader's
 * data fetch) resolves next, and interleaving those resolutions with new
 * `navigate()` calls. This is the router-integration analogue of the scenario
 * from the spec discussion:
 *
 *   N1 N2 N3 N4 start, then N2 resolves, N4 resolves, N1 resolves, N3 resolves
 *   (in literally any order fast-check chooses to try)
 *
 * and it exercises the *real* `Router` end-to-end (routing, module loading,
 * loader execution, isActive checks, rendering) rather than one isolated unit.
 *
 * The invariant under test is R1+R3+R7 combined at the integration level:
 * no matter which navigation's async work happens to finish first, last, or
 * anywhere in between, only the *last-issued* navigation may ever reach
 * "success" and be reflected in the DOM — every earlier one must be silently
 * cancelled, regardless of how its two async steps (module load, then loader)
 * happen to interleave with the others'.
 */
describe("Router — model: arbitrary interleaving of navigation start/resolve order", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", { value: vi.fn(), configurable: true });
    Object.defineProperty(window, "matchMedia", { value: vi.fn().mockReturnValue({ matches: true }), configurable: true });
  });

  it("only the last-issued navigation ever reaches success, for any resolution order of the others' in-flight work", async () => {
    const setup = fc.integer({ min: 2, max: 4 }).chain((count) => {
      // count-1 "start the next navigation" actions, plus resolution slots
      // to spend on `s.waitOne()` — genuinely shuffled together (not just
      // "all starts then all resolves"), so fast-check explores real
      // interleavings of "navigate() while N others are still in flight".
      // Resolve-token budget generously covers *every* navigation's two async
      // hops (load + data), not just the earlier ones' — otherwise the last
      // navigation's own work could only ever be drained by the trailing
      // `waitAll()`, which would silently prevent the interesting case where
      // the last navigation's work resolves *before* an earlier one's.
      const base = [
        ...Array.from({ length: count - 1 }, () => "start" as const),
        ...Array.from({ length: count * 3 }, () => "resolve" as const),
      ];
      return fc.record({
        count: fc.constant(count),
        actions: fc.shuffledSubarray(base, { minLength: base.length, maxLength: base.length }),
      });
    });

    await fc.assert(
      fc.asyncProperty(fc.scheduler(), setup, async (s, { count, actions }) => {
        const routes: RouteDefinition[] = Array.from({ length: count }, (_, i) => {
          const page: PageModule = {
            loader: async () => s.schedule(Promise.resolve(i), `data-n${i}`),
            render(container, data) {
              container.textContent = `page-${data}`;
            },
          };
          return {
            path: `/n${i}`,
            load: () => s.schedule(Promise.resolve({ default: page }), `load-n${i}`),
          };
        });

        history.replaceState({}, "", "/n0");
        const container = document.createElement("main");
        const router = new Router(routes, container);
        const successIds: number[] = [];
        router.onPhaseChange(({ phase, navigation }: { phase: NavigationPhase; navigation: { id: number } }) => {
          if (phase === "success") successIds.push(navigation.id);
        });

        router.start(); // fires navigation id=1, targeting /n0

        // Replay the fast-check-chosen interleaving of "start the next
        // navigation" and "let one pending async step resolve".
        let nextToStart = 1;
        for (let i = 0; i < actions.length; i++) {
          if (actions[i] === "start" && nextToStart < count) {
            router.navigate(`/n${nextToStart}`);
            nextToStart++;
          } else if (s.count() > 0) {
            await s.waitOne();
          }
        }

        await s.waitAll();
        // `s.waitAll()` only guarantees draining every task registered through
        // `s.schedule(...)` — the final commit path (view transition, layout
        // mount) chains a few more plain, unscheduled microtasks on top of the
        // last scheduled one. A macrotask boundary reliably flushes those: the
        // JS microtask queue always drains completely before a timer fires,
        // regardless of how many native `.then()` hops are chained.
        await new Promise((resolve) => setTimeout(resolve, 0));

        // An earlier navigation legitimately reaching "success" before the next
        // one is even started is normal sequential navigation, not a race — so
        // multiple successes are fine. What must always hold: the *final* DOM
        // state, and the *last* success to ever fire, belong to the
        // last-issued navigation — whichever earlier ones also succeeded along
        // the way, none of them may ever supersede it afterwards.
        expect(successIds.length).toBeGreaterThan(0);
        expect(successIds[successIds.length - 1]).toBe(count);
        expect(container.textContent).toBe(`page-${count - 1}`);
      }),
      { numRuns: 150 },
    );
  }, 30_000);
});
