import { describe, expect, it } from "vitest";
import { mountTemplate } from "../src/mountTemplate";

function container() {
  return document.createElement("div");
}

describe("mountTemplate", () => {
  it("collects single refs and appends by default", () => {
    const root = container();
    const { refs, nodes } = mountTemplate<{ title: HTMLHeadingElement }>(
      root,
      `<h1 ref="title">Hello</h1>`,
    );
    expect(refs.title.tagName).toBe("H1");
    expect(refs.title.textContent).toBe("Hello");
    expect(root.contains(refs.title)).toBe(true);
    expect(nodes).toHaveLength(1);
  });

  it("collects list refs via ref=\"name[]\"", () => {
    const root = container();
    const { refs } = mountTemplate<{ item: HTMLLIElement[] }>(
      root,
      `<li ref="item[]">First</li><li ref="item[]">Second</li>`,
    );
    expect(Array.isArray(refs.item)).toBe(true);
    expect(refs.item).toHaveLength(2);
    expect(refs.item[0].textContent).toBe("First");
    expect(refs.item[1].textContent).toBe("Second");
  });

  it("throws on duplicate single ref", () => {
    const root = container();
    expect(() => mountTemplate(root, `<span ref="a"></span><span ref="a"></span>`)).toThrow(
      /duplicate ref "a"/,
    );
  });

  it("throws when the same name is used both as single and as list", () => {
    const root = container();
    expect(() => mountTemplate(root, `<span ref="a"></span><span ref="a[]"></span>`)).toThrow(
      /used both as a single element and as a list/,
    );
  });

  it("ignores elements with an empty ref attribute", () => {
    const root = container();
    const { refs } = mountTemplate(root, `<span ref="">x</span>`);
    expect(refs).toEqual({});
  });

  it("supports position: append (default)", () => {
    const root = container();
    root.innerHTML = `<p>existing</p>`;
    mountTemplate(root, `<span>new</span>`, { position: "append" });
    expect(root.children[0].textContent).toBe("existing");
    expect(root.children[1].textContent).toBe("new");
  });

  it("supports position: prepend", () => {
    const root = container();
    root.innerHTML = `<p>existing</p>`;
    mountTemplate(root, `<span>new</span>`, { position: "prepend" });
    expect(root.children[0].textContent).toBe("new");
    expect(root.children[1].textContent).toBe("existing");
  });

  it("supports position: replace", () => {
    const root = container();
    root.innerHTML = `<p>existing</p>`;
    mountTemplate(root, `<span>new</span>`, { position: "replace" });
    expect(root.children).toHaveLength(1);
    expect(root.children[0].textContent).toBe("new");
  });

  it("removes the ref attribute by default", () => {
    const root = container();
    const { refs } = mountTemplate<{ title: HTMLElement }>(root, `<h1 ref="title">x</h1>`);
    expect(refs.title.hasAttribute("ref")).toBe(false);
  });

  it("keeps the ref attribute when removeRefAttribute is false", () => {
    const root = container();
    const { refs } = mountTemplate<{ title: HTMLElement }>(root, `<h1 ref="title">x</h1>`, {
      removeRefAttribute: false,
    });
    expect(refs.title.getAttribute("ref")).toBe("title");
  });

  it("returns nodes usable for later removal", () => {
    const root = container();
    const { nodes } = mountTemplate(root, `<span>a</span><span>b</span>`);
    expect(nodes).toHaveLength(2);
    for (const node of nodes) node.remove();
    expect(root.childNodes).toHaveLength(0);
  });
});
