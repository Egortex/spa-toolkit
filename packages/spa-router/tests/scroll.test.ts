import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollManager } from "../src/scroll";

describe("ScrollManager", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 75 });
    window.scrollTo = vi.fn();
  });

  it("restores saved popstate positions", () => {
    const scroll = new ScrollManager();
    scroll.save("/a");
    scroll.restore("/a", true);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 75);
  });

  it("uses zero for regular and unknown popstate navigation", () => {
    const scroll = new ScrollManager();
    scroll.restore("/unknown", true);
    scroll.restore("/a", false);
    expect(window.scrollTo).toHaveBeenNthCalledWith(1, 0, 0);
    expect(window.scrollTo).toHaveBeenNthCalledWith(2, 0, 0);
  });
});
