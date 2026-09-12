import { describe, expect, it, vi } from "vitest";
import { LayoutChainManager, toLayoutChain } from "../src/layoutChain";
import type { LayoutLoader, RouteContext } from "../src/types";

const ctx = { path: "/", params: {}, query: new URLSearchParams(), signal: new AbortController().signal };

function layout(name: string) {
  const cleanup = vi.fn();
  const update = vi.fn();
  const loader: LayoutLoader = vi.fn(async () => ({
    default: {
      render(container: HTMLElement) {
        const outlet = document.createElement("div");
        outlet.dataset.name = name;
        container.append(outlet);
        return { outlet, cleanup, update };
      },
    },
  }));
  return { loader, cleanup, update };
}

async function promises(loaders: LayoutLoader[]) {
  return new Map(loaders.map((item) => [item, item()]));
}

describe("LayoutChainManager", () => {
  it("normalizes optional, single and multiple layouts", () => {
    const one = layout("one").loader;
    expect(toLayoutChain(undefined)).toEqual([]);
    expect(toLayoutChain(one)).toEqual([one]);
    expect(toLayoutChain([one])).toEqual([one]);
  });

  it("mounts, reuses a common prefix and unmounts a tail", async () => {
    const manager = new LayoutChainManager();
    const root = document.createElement("main");
    const a = layout("a");
    const b = layout("b");
    const c = layout("c");
    expect(manager.commonPrefixLength([a.loader])).toBe(0);
    const chain = [a.loader, b.loader];
    const outlet = await manager.mount(chain, 0, ctx, await promises(chain), root, vi.fn(), () => true);
    expect(manager.lastOutlet(root)).toBe(outlet);
    expect(manager.commonPrefixLength([a.loader, c.loader])).toBe(1);
    const onUnmount = vi.fn();
    await manager.mount([a.loader, c.loader], 1, ctx, await promises([c.loader]), root, onUnmount, () => true);
    expect(onUnmount).toHaveBeenCalledOnce();
    expect(b.cleanup).toHaveBeenCalledOnce();
    expect(a.update).toHaveBeenCalledWith(ctx);
  });

  it("fully remounts and disposes all layouts", async () => {
    const manager = new LayoutChainManager();
    const root = document.createElement("main");
    const a = layout("a");
    await manager.mount([a.loader], 0, ctx as RouteContext, await promises([a.loader]), root, vi.fn(), () => true);
    const plain = layout("plain");
    const unmount = vi.fn();
    await manager.mount([plain.loader], 0, ctx, await promises([plain.loader]), root, unmount, () => true);
    expect(unmount).toHaveBeenCalledOnce();
    expect(a.cleanup).toHaveBeenCalledOnce();
    manager.disposeAll(root);
    expect(plain.cleanup).toHaveBeenCalledOnce();
    expect(root.innerHTML).toBe("");
    expect(manager.lastOutlet(root)).toBe(root);
    manager.disposeAll();
  });

  it("returns null and touches neither the DOM nor the chain when isActive is already false", async () => {
    const manager = new LayoutChainManager();
    const root = document.createElement("main");
    const a = layout("a");
    const result = await manager.mount([a.loader], 0, ctx, await promises([a.loader]), root, vi.fn(), () => false);
    expect(result).toBeNull();
    expect(root.innerHTML).toBe("");
    expect(manager.lastOutlet(root)).toBe(root);
  });

  it("serializes concurrent mount calls: a superseded call aborts without corrupting the chain for the one that follows", async () => {
    const manager = new LayoutChainManager();
    const root = document.createElement("main");
    const a = layout("a");
    const b = layout("b");

    // `a` represents a navigation that has already been superseded by the time
    // its queued mount() turn comes up (isActive: () => false); `b` represents
    // the navigation that superseded it (isActive: () => true), started second
    // but queued to run right after `a` aborts.
    const firstCall = manager.mount([a.loader], 0, ctx, await promises([a.loader]), root, vi.fn(), () => false);
    const secondCall = manager.mount([b.loader], 0, ctx, await promises([b.loader]), root, vi.fn(), () => true);

    const [firstResult, secondResult] = await Promise.all([firstCall, secondCall]);
    expect(firstResult).toBeNull();
    expect(secondResult).not.toBeNull();
    expect(root.querySelectorAll("[data-name]")).toHaveLength(1);
    expect((root.querySelector("[data-name]") as HTMLElement | null)?.dataset.name).toBe("b");
  });
});
