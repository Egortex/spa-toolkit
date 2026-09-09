import { describe, expect, it, vi } from "vitest";
import { defer, isDeferredValue, parallel, sequential } from "../src/composeLoaders";

describe("loader composition", () => {
  it("runs record loaders in parallel", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const first = vi.fn(async () => { await wait; return 1; });
    const second = vi.fn(async () => 2);
    const result = parallel({ first, second })({ value: true });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    release();
    await expect(result).resolves.toEqual({ first: 1, second: 2 });
  });

  it("names positional loaders and falls back to their index", async () => {
    async function authLoader() { return "a"; }
    const anonymous = Object.defineProperty(async () => "b", "name", { value: "" });
    expect(await parallel(authLoader, anonymous)(undefined)).toEqual({ auth: "a", 1: "b" });
  });

  it("runs sequential object and scalar steps with accumulated data", async () => {
    async function scalar() { return 2; }
    const composed = sequential<{ id: string }>(
      ({ context }) => ({ user: context.id }),
      ({ data }) => ({ permission: data.user === "1" }),
      scalar,
    );
    expect(await composed({ id: "1" })).toEqual({ user: "1", permission: true, scalar: 2 });
  });

  it("does not run later sequential steps after an error", async () => {
    const later = vi.fn();
    await expect(sequential(() => Promise.reject(new Error("bad")), later)(undefined)).rejects.toThrow("bad");
    expect(later).not.toHaveBeenCalled();
  });

  it("marks deferred work without starting it", async () => {
    const inner = vi.fn().mockResolvedValue(3);
    const value = await defer(inner)("context");
    expect(isDeferredValue(value)).toBe(true);
    expect(isDeferredValue(null)).toBe(false);
    expect(isDeferredValue({})).toBe(false);
    expect(inner).not.toHaveBeenCalled();
    if (isDeferredValue(value)) await expect(value.run()).resolves.toBe(3);
    expect(inner).toHaveBeenCalledWith("context");
  });
});
