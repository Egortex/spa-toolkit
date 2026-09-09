import { describe, expect, it, vi } from "vitest";
import { createLinkedAbortController, isDeclarativeLoader, loader, snapshotLocation, toRouteContext } from "../src/types";
import type { Navigation } from "../src/types";

function navigation(signal: AbortSignal): Navigation {
  const url = new URL("https://example.test/users/1?q=x") as unknown as Location;
  return { id: 1, from: url, to: url, signal, params: { id: "1" }, search: new URLSearchParams("q=x") };
}

describe("navigation helpers", () => {
  it("builds contexts with default and overridden signals", () => {
    const parent = new AbortController();
    const nav = navigation(parent.signal);
    expect(toRouteContext(nav)).toMatchObject({ path: "/users/1", params: { id: "1" } });
    const child = new AbortController();
    expect(toRouteContext(nav, child.signal).signal).toBe(child.signal);
  });

  it("links abort controllers before and after parent abort", () => {
    const parent = new AbortController();
    const child = createLinkedAbortController(parent.signal);
    parent.abort("done");
    expect(child.signal.aborted).toBe(true);
    expect(child.signal.reason).toBe("done");
    const late = createLinkedAbortController(parent.signal);
    expect(late.signal.aborted).toBe(true);
  });

  it("recognizes declarative loaders and snapshots locations", () => {
    const definition = loader({ key: () => ["x"], load: vi.fn().mockResolvedValue(1) });
    expect(isDeclarativeLoader(definition)).toBe(true);
    expect(isDeclarativeLoader(async () => 1)).toBe(false);
    const result = snapshotLocation(new URL("https://example.test/a") as unknown as Location);
    expect(result.pathname).toBe("/a");
  });
});
