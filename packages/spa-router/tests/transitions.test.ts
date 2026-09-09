import { afterEach, describe, expect, it, vi } from "vitest";
import { runTransition } from "../src/transitions";

describe("runTransition", () => {
  afterEach(() => {
    Object.defineProperty(document, "startViewTransition", { value: undefined, configurable: true });
  });

  it("runs directly without browser support", async () => {
    const update = vi.fn();
    await runTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it("runs directly for reduced motion", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const update = vi.fn();
    Object.defineProperty(document, "startViewTransition", { value: vi.fn(), configurable: true });

    await runTransition(update);
    expect(update).toHaveBeenCalledOnce();
    expect((document as any).startViewTransition).not.toHaveBeenCalled();
  });

  it("awaits a view transition when available", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    const update = vi.fn();
    Object.defineProperty(document, "startViewTransition", {
      value: vi.fn((callback: () => void) => {
        callback();
        return { updateCallbackDone: Promise.resolve() };
      }),
      configurable: true,
    });

    await runTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it("supports browsers returning no transition handle", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    Object.defineProperty(document, "startViewTransition", {
      value: vi.fn((callback: () => void) => callback()),
      configurable: true,
    });

    await runTransition(vi.fn());
  });
});
