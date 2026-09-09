import { describe, expect, it, vi } from "vitest";
import { createState } from "../src/state";

describe("createState", () => {
  it("exposes the initial value via get()", () => {
    const count = createState(0);
    expect(count.get()).toBe(0);
  });

  it("set() synchronously notifies all subscribers with the new value", () => {
    const count = createState(0);
    const a = vi.fn();
    const b = vi.fn();
    count.subscribe(a);
    count.subscribe(b);
    count.set(1);
    expect(a).toHaveBeenCalledWith(1);
    expect(b).toHaveBeenCalledWith(1);
    expect(count.get()).toBe(1);
  });

  it("set() accepts an updater function based on the previous value", () => {
    const count = createState(1);
    count.set((prev) => prev + 41);
    expect(count.get()).toBe(42);
  });

  it("subscribe() returns an unsubscribe function", () => {
    const count = createState(0);
    const listener = vi.fn();
    const unsubscribe = count.subscribe(listener);
    unsubscribe();
    count.set(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("auto-unsubscribes when the given signal aborts", () => {
    const count = createState(0);
    const controller = new AbortController();
    const listener = vi.fn();
    count.subscribe(listener, { signal: controller.signal });
    count.set(1);
    expect(listener).toHaveBeenCalledTimes(1);
    controller.abort();
    count.set(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe at all when the signal is already aborted", () => {
    const count = createState(0);
    const controller = new AbortController();
    controller.abort();
    const listener = vi.fn();
    count.subscribe(listener, { signal: controller.signal });
    count.set(1);
    expect(listener).not.toHaveBeenCalled();
  });
});
