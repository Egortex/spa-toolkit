import { beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { Router } from "../src/Router";
import type { PageModule, RouteDefinition } from "../src/types";

function moduleOf(page: PageModule): () => Promise<{ default: PageModule }> {
  return vi.fn(async () => ({ default: page }));
}

const HANG_TIMEOUT_MS = 500;

/**
 * R4: a redirect chain MUST terminate. Property: for any randomly generated
 * redirect graph over N routes — including self-redirects and multi-node
 * cycles that `resolveWithRedirects`'s cycle detection is meant to catch, and
 * long acyclic chains that exercise its iteration cap — starting the router
 * MUST settle into "success" or "error" within a bounded time. It must never
 * hang, regardless of the graph's shape.
 */
describe("Router — property: any redirect graph terminates, never hangs (R4)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", { value: vi.fn(), configurable: true });
    Object.defineProperty(window, "matchMedia", { value: vi.fn().mockReturnValue({ matches: true }), configurable: true });
  });

  it("always settles into success or error, never hangs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 6 }).chain((n) =>
          fc.record({
            // For each route index: `undefined` means a real page; an integer
            // means "redirect to /r<that index>" — which may be itself (an
            // immediate self-cycle) or form a longer cycle with other routes.
            redirectTargets: fc.array(fc.option(fc.integer({ min: 0, max: n - 1 }), { nil: undefined }), {
              minLength: n,
              maxLength: n,
            }),
            start: fc.integer({ min: 0, max: n - 1 }),
          }),
        ),
        async ({ redirectTargets, start }) => {
          const routes: RouteDefinition[] = redirectTargets.map((target, i) =>
            target === undefined
              ? { path: `/r${i}`, load: moduleOf({ render(container) { container.textContent = `page-${i}`; } }) }
              : { path: `/r${i}`, redirectTo: `/r${target}`, load: moduleOf({ render() {} }) },
          );

          history.replaceState({}, "", `/r${start}`);
          const container = document.createElement("main");
          const router = new Router(routes, container);

          const settled = new Promise<string>((resolve) => {
            const unsubscribe = router.onStatusChange((status) => {
              if (status === "success" || status === "error") {
                unsubscribe();
                resolve(status);
              }
            });
          });

          router.start();

          const outcome = await Promise.race([
            settled,
            new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), HANG_TIMEOUT_MS)),
          ]);

          expect(outcome).not.toBe("timeout");
        },
      ),
      { numRuns: 80 },
    );
  }, 60_000);
});
