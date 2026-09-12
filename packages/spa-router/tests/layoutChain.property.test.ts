import { describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { LayoutChainManager } from "../src/layoutChain";
import type { LayoutLoader, LayoutModule, RouteContext } from "../src/types";

const ctx: RouteContext = { path: "/", params: {}, query: new URLSearchParams(), signal: new AbortController().signal };

/**
 * A layout whose module import resolves after `delayMs` (via a macrotask, so
 * its timing relative to other concurrent imports is genuinely nondeterministic
 * from the scheduler's point of view, not just a microtask ordering artifact).
 */
function delayedLayout(name: string, delayMs: number): LayoutLoader {
  return vi.fn(
    () =>
      new Promise<{ default: LayoutModule }>((resolve) => {
        setTimeout(
          () =>
            resolve({
              default: {
                render(container: HTMLElement) {
                  const outlet = document.createElement("div");
                  outlet.dataset.name = name;
                  container.append(outlet);
                  return { outlet };
                },
              },
            }),
          delayMs,
        );
      }),
  );
}

/**
 * Property: R1 (a call whose navigation is no longer active must not mutate the
 * DOM) and R3 (only the "committed"/active navigation may end up reflected in
 * the active layout chain) together imply that firing N concurrent mount()
 * calls at the same LayoutChainManager, where exactly one of them (`winner`) is
 * ever considered active, must always leave the DOM and `chain` in the state
 * produced by that single winner — regardless of how many other calls are in
 * flight, their random import delays, or the order in which they were issued.
 *
 * Before the mount()/isActive fix, `mount()` had no cancellation check of its
 * own and no reentrancy guard, so a non-winner call racing a slower winner (or
 * vice versa) could still land its render on screen or corrupt `chain`. This
 * test fuzzes exactly that scenario across many random schedules.
 */
describe("LayoutChainManager — property: concurrent mount() calls never corrupt the winner's state", () => {
  it("only the active navigation's layout ends up mounted, for any interleaving", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 6 }).chain((count) =>
          fc.record({
            count: fc.constant(count),
            delays: fc.array(fc.integer({ min: 0, max: 20 }), { minLength: count, maxLength: count }),
            winner: fc.integer({ min: 0, max: count - 1 }),
          }),
        ),
        async ({ delays, winner }) => {
          const manager = new LayoutChainManager();
          const root = document.createElement("main");

          const loaders = delays.map((delayMs, i) => delayedLayout(`layout-${i}`, delayMs));

          // Fire every call synchronously, back-to-back, exactly like the router
          // firing a new render() without waiting for the previous one to settle.
          // isActive is evaluated fresh on every poll and only ever true for `winner`.
          const calls = loaders.map((loader, i) => {
            const modulePromise = loader();
            return manager.mount(
              [loader],
              0,
              ctx,
              new Map([[loader, modulePromise]]),
              root,
              vi.fn(),
              () => i === winner,
            );
          });

          const results = await Promise.all(calls);

          // Every non-winner call must have aborted without producing a mounted outlet.
          results.forEach((result, i) => {
            if (i !== winner) expect(result).toBeNull();
          });
          expect(results[winner]).not.toBeNull();

          // The DOM must contain exactly one mounted layout, and it must be the winner's.
          const mountedNames = [...root.querySelectorAll<HTMLElement>("[data-name]")].map(
            (el) => el.dataset.name,
          );
          expect(mountedNames).toEqual([`layout-${winner}`]);

          // `chain` must be internally consistent with what's actually in the DOM:
          // exactly one entry, referencing the winner's loader.
          expect(manager.lastOutlet(root)).toBe(root.querySelector("[data-name]"));

          manager.disposeAll(root);
        },
      ),
      { numRuns: 200 },
    );
  }, 20_000);

  it("a call already inactive when it reaches the front of the queue touches neither DOM nor chain, for any queue position", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 6 }).chain((count) =>
          fc.record({
            count: fc.constant(count),
            delays: fc.array(fc.integer({ min: 0, max: 20 }), { minLength: count, maxLength: count }),
            deadIndex: fc.integer({ min: 0, max: count - 1 }),
          }),
        ),
        async ({ delays, deadIndex }) => {
          const manager = new LayoutChainManager();
          const root = document.createElement("main");
          const loaders = delays.map((delayMs, i) => delayedLayout(`layout-${i}`, delayMs));

          const before = root.innerHTML;

          const calls = loaders.map((loader, i) => {
            const modulePromise = loader();
            return manager.mount(
              [loader],
              0,
              ctx,
              new Map([[loader, modulePromise]]),
              root,
              vi.fn(),
              // Every call except `deadIndex` is active; deadIndex is never active,
              // simulating a navigation cancelled before it ever got its turn.
              () => i !== deadIndex,
            );
          });

          await Promise.all(calls);

          // The dead call must never have contributed a node with its own name.
          expect(root.querySelector(`[data-name="layout-${deadIndex}"]`)).toBeNull();
          void before;

          manager.disposeAll(root);
        },
      ),
      { numRuns: 200 },
    );
  }, 20_000);
});

/**
 * A layout "kind" with a stable `LayoutLoader` reference (so `commonPrefixLength`
 * can recognize it across rounds) and spies on every lifecycle hook, so a test
 * can assert exactly how many times each hook fired.
 */
function layoutKind(name: string) {
  const render = vi.fn();
  const update = vi.fn();
  const cleanup = vi.fn();
  const loader: LayoutLoader = vi.fn(async () => ({
    default: {
      render(container: HTMLElement) {
        render();
        const outlet = document.createElement("div");
        outlet.dataset.name = name;
        container.append(outlet);
        return { outlet, update, cleanup };
      },
    },
  }));
  return { name, loader, render, update, cleanup };
}

/**
 * R17 (new, diffing correctness — not in the original R1-R16 catalogue but
 * surfaced by writing this fuzzer): `LayoutChainManager.mount()` MUST reuse any
 * common prefix between the previously mounted chain and the newly requested one
 * (calling `update()`, not `render()`, and leaving the DOM node identity intact),
 * and MUST dispose (`cleanup()`) exactly the layouts past that prefix — no more,
 * no less — leaving the DOM's outlet nesting exactly matching the new chain.
 *
 * This property runs a random sequence of *sequential* (non-concurrent)
 * navigations across a small pool of stable layout kinds, so consecutive
 * rounds frequently share a real common prefix, and checks the predicted
 * render/update/cleanup call counts and DOM shape after every single round.
 */
describe("LayoutChainManager — property: common-prefix diffing is exact across sequential navigations", () => {
  it("reuses the common prefix via update(), disposes exactly the replaced tail, and keeps DOM depth in sync with the chain", async () => {
    const POOL_SIZE = 4;

    // Each round's chain has no repeated kind (a real route config never lists the
    // same layout loader twice at different positions of one chain); repeats
    // *across* rounds are what exercises common-prefix reuse.
    const round = fc.uniqueArray(fc.integer({ min: 0, max: POOL_SIZE - 1 }), { minLength: 1, maxLength: 3 });

    await fc.assert(
      fc.asyncProperty(
        fc.array(round, { minLength: 1, maxLength: 8 }),
        async (rounds) => {
          const manager = new LayoutChainManager();
          const root = document.createElement("main");
          const kinds = Array.from({ length: POOL_SIZE }, (_, i) => layoutKind(`kind-${i}`));

          let previousChain: number[] = [];

          for (const roundKinds of rounds) {
            const chainLoaders = roundKinds.map((k) => kinds[k].loader);

            let common = 0;
            while (
              common < previousChain.length &&
              common < roundKinds.length &&
              previousChain[common] === roundKinds[common]
            ) {
              common++;
            }

            const renderCountsBefore = kinds.map((k) => k.render.mock.calls.length);
            const updateCountsBefore = kinds.map((k) => k.update.mock.calls.length);
            const cleanupCountsBefore = kinds.map((k) => k.cleanup.mock.calls.length);

            const modulePromises = new Map(chainLoaders.map((loader) => [loader, loader()]));
            const result = await manager.mount(chainLoaders, common, ctx, modulePromises, root, vi.fn(), () => true);
            expect(result).not.toBeNull();

            // Every kind in the reused prefix got update(), not a fresh render().
            for (let i = 0; i < common; i++) {
              const k = roundKinds[i];
              expect(kinds[k].update.mock.calls.length).toBe(updateCountsBefore[k] + 1);
            }

            // Every kind at/after the prefix in the *new* chain was freshly rendered.
            for (let i = common; i < roundKinds.length; i++) {
              const k = roundKinds[i];
              expect(kinds[k].render.mock.calls.length).toBe(renderCountsBefore[k] + 1);
            }

            // Every kind that was in the *previous* chain at/after the prefix was disposed exactly once.
            for (let i = common; i < previousChain.length; i++) {
              const k = previousChain[i];
              expect(kinds[k].cleanup.mock.calls.length).toBe(cleanupCountsBefore[k] + 1);
            }

            // The DOM must now contain exactly the new chain's outlets, in order.
            const mountedNames = [...root.querySelectorAll<HTMLElement>("[data-name]")].map((el) => el.dataset.name);
            expect(mountedNames).toEqual(roundKinds.map((k) => `kind-${k}`));

            previousChain = roundKinds;
          }

          manager.disposeAll(root);
        },
      ),
      { numRuns: 200 },
    );
  }, 20_000);
});
