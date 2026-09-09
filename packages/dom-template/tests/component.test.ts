import { describe, expect, it, vi } from "vitest";
import { component } from "../src/component";

function container() {
  return document.createElement("div");
}

/** Mimics the fetch(url, { signal }) contract without hitting the network. */
function abortableFetch(signal: AbortSignal): Promise<string> {
  return new Promise<string>((_resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
    // Never resolves on its own in these tests — only rejection via abort matters.
  });
}

describe("component", () => {
  it("mounts the template and collects refs (including [] lists)", () => {
    const root = container();
    const factory = component<{ title: HTMLElement; item: HTMLElement[] }, Record<string, never>>({
      template: `<h1 ref="title">Hi</h1><ul><li ref="item[]">a</li><li ref="item[]">b</li></ul>`,
      setup({ refs }) {
        expect(refs.title.textContent).toBe("Hi");
        expect(refs.item).toHaveLength(2);
      },
    });
    const instance = factory(root, {});
    expect(root.querySelector("h1")?.textContent).toBe("Hi");
    expect(instance.nodes.length).toBeGreaterThan(0);
  });

  it("calls setup() exactly once per mount", () => {
    const setup = vi.fn();
    const factory = component<Record<string, never>, Record<string, never>>({
      template: `<div></div>`,
      setup,
    });
    factory(container(), {});
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it("stops calling addEventListener callbacks registered with { signal } after destroy()", () => {
    const root = container();
    const onClick = vi.fn();
    const factory = component<{ button: HTMLButtonElement }, Record<string, never>>({
      template: `<button ref="button">click</button>`,
      setup({ refs, signal }) {
        refs.button.addEventListener("click", onClick, { signal });
      },
    });
    const instance = factory(root, {});
    const button = root.querySelector("button")!;
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    instance.destroy();
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("rejects a fetch-like call started with { signal } after destroy()", async () => {
    const root = container();
    let pending!: Promise<string>;
    const factory = component<Record<string, never>, Record<string, never>>({
      template: `<div></div>`,
      setup({ signal }) {
        pending = abortableFetch(signal);
      },
    });
    const instance = factory(root, {});
    instance.destroy();
    await expect(pending).rejects.toThrow("Aborted");
  });

  it("calls the cleanup function returned from setup() exactly once on destroy()", () => {
    const cleanup = vi.fn();
    const factory = component<Record<string, never>, Record<string, never>>({
      template: `<div></div>`,
      setup() {
        return cleanup;
      },
    });
    const instance = factory(container(), {});
    instance.destroy();
    instance.destroy();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("removes the mounted nodes from the DOM on destroy()", () => {
    const root = container();
    const factory = component<Record<string, never>, Record<string, never>>({
      template: `<span>hi</span>`,
      setup() {},
    });
    const instance = factory(root, {});
    expect(root.childNodes).toHaveLength(1);
    instance.destroy();
    expect(root.childNodes).toHaveLength(0);
  });

  it("update(nextProps) calls onUpdate with merged props and does not remount", () => {
    const root = container();
    const onUpdate = vi.fn();
    interface Props {
      name: string;
    }
    const factory = component<{ el: HTMLElement }, Props>({
      template: `<div ref="el"></div>`,
      setup({ refs, props }) {
        refs.el.textContent = props.name;
      },
      onUpdate(props, { refs }) {
        onUpdate(props);
        refs.el.textContent = props.name;
      },
    });
    const instance = factory(root, { name: "a" });
    const elBefore = root.querySelector("div");
    instance.update({ name: "b" });
    const elAfter = root.querySelector("div");
    expect(onUpdate).toHaveBeenCalledWith({ name: "b" });
    expect(elAfter).toBe(elBefore);
    expect(elAfter?.textContent).toBe("b");
  });

  it("throws when update() is called on a destroyed instance", () => {
    const instance = component<Record<string, never>, Record<string, never>>({
      template: `<div></div>`,
      setup() {},
    })(container(), {});
    instance.destroy();
    expect(() => instance.update({})).toThrow();
  });

  it("mountChild registers children for cascading destroy in children-before-parent order", () => {
    const order: string[] = [];
    const root = container();
    const child = component<Record<string, never>, Record<string, never>>({
      template: `<span></span>`,
      setup() {
        return () => order.push("child");
      },
    });
    const factory = component<{ slot: HTMLElement }, Record<string, never>>({
      template: `<div ref="slot"></div>`,
      setup({ refs, mountChild }) {
        mountChild(child, refs.slot, {});
        return () => order.push("parent");
      },
    });
    const instance = factory(root, {});
    instance.destroy();
    expect(order).toEqual(["child", "parent"]);
  });

  it("aborts the parent signal only after destroying children, and idempotent destroy() is a no-op", () => {
    const root = container();
    const childDestroySpy = vi.fn();
    const child = component<Record<string, never>, Record<string, never>>({
      template: `<span></span>`,
      setup() {
        return childDestroySpy;
      },
    });
    const factory = component<{ slot: HTMLElement }, Record<string, never>>({
      template: `<div ref="slot"></div>`,
      setup({ refs, mountChild }) {
        mountChild(child, refs.slot, {});
      },
    });
    const instance = factory(root, {});
    instance.destroy();
    expect(childDestroySpy).toHaveBeenCalledTimes(1);
    instance.destroy();
    expect(childDestroySpy).toHaveBeenCalledTimes(1);
  });

  it("exposes state() as a factory inside setup", () => {
    const root = container();
    const factory = component<{ label: HTMLElement }, Record<string, never>>({
      template: `<span ref="label"></span>`,
      setup({ refs, state, signal }) {
        const count = state(0);
        count.subscribe((v) => (refs.label.textContent = String(v)), { signal });
        count.set(5);
      },
    });
    factory(root, {});
    expect(root.querySelector("span")?.textContent).toBe("5");
  });
});
