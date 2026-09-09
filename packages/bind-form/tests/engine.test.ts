import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngine, serializeFieldValue } from "../src/engine";
import type { FieldSchema } from "../src/types";
import { createForm as buildForm, flush, submit } from "./helpers";

afterEach(() => {
	document.body.innerHTML = "";
});

describe("serializeFieldValue", () => {
	it("uses a custom serialize function when provided", () => {
		expect(serializeFieldValue({ serialize: (v: number) => `#${v}` } as FieldSchema<number>, 5)).toBe("#5");
	});

	it("serializes number/undefined/null", () => {
		expect(serializeFieldValue({ type: "number" }, 5)).toBe("5");
		expect(serializeFieldValue({ type: "number" }, undefined)).toBe("");
		expect(serializeFieldValue({ type: "number" }, null)).toBe("");
	});

	it("serializes checkbox truthy/falsy", () => {
		expect(serializeFieldValue({ type: "checkbox" }, true)).toBe("on");
		expect(serializeFieldValue({ type: "checkbox" }, false)).toBe("");
	});

	it("serializes multiselect arrays, and non-arrays as empty", () => {
		expect(serializeFieldValue({ type: "multiselect" }, ["a", "b"])).toBe("a,b");
		expect(serializeFieldValue({ type: "multiselect" }, undefined)).toBe("");
	});

	it("passes through strings, and stringifies other values, defaulting undefined/null to ''", () => {
		expect(serializeFieldValue({}, "hi")).toBe("hi");
		expect(serializeFieldValue({}, 5)).toBe("5");
		expect(serializeFieldValue({}, undefined)).toBe("");
	});
});

describe("createEngine internals", () => {
	it("works without onStateChange (emitState is a no-op)", () => {
		const form = buildForm(`<input name="name" />`);
		const engine = createEngine(form, {
			fields: [{ name: "name", schema: {} }],
			onSubmit: vi.fn(),
		});
		expect(() => engine.setValue("name", "Ann")).not.toThrow();
		engine();
	});

	it("treats a name resolving to a RadioNodeList as not a field element (setValue/accessibility no-op)", () => {
		const form = buildForm(`<input name="choice" value="a" /><input name="choice" value="b" />`);
		const engine = createEngine(form, {
			fields: [{ name: "choice", schema: {} }],
			onSubmit: vi.fn(),
			skipLabelWarning: true,
		});
		expect(() => engine.setValue("choice", "x")).not.toThrow();
		engine();
	});

	it("skips disabling submit buttons when there are none", async () => {
		const form = buildForm(`<input name="name" />`);
		(form.elements.namedItem("name") as HTMLInputElement).value = "ok";
		const engine = createEngine(form, {
			fields: [{ name: "name", schema: {} }],
			onSubmit: vi.fn(),
		});
		submit(form);
		await flush();
		engine();
	});

	it("does not display a form error when errorElement is not provided", async () => {
		const form = buildForm(`<input name="name" />`);
		const engine = createEngine(form, {
			fields: [{ name: "name", schema: { required: "Required" } }],
			onSubmit: vi.fn(),
		});
		expect(() => submit(form)).not.toThrow();
		await flush();
		engine();
	});

	it("resolver contributions are ignored for fields that already have a sync error", async () => {
		const form = buildForm(`<input name="name" /><input name="email" />`);
		(form.elements.namedItem("email") as HTMLInputElement).value = "a@b.co";
		const resolver = vi.fn().mockResolvedValue({ name: "Resolver says no", email: "Resolver says no too" });
		const onSubmit = vi.fn();

		const engine = createEngine(form, {
			fields: [
				{ name: "name", schema: { required: "Sync required" } },
				{ name: "email", schema: {} },
			],
			resolver,
			onSubmit,
		});

		submit(form);
		await flush();
		expect(engine.getState().errors.name).toBe("Sync required");
		expect(engine.getState().errors.email).toBe("Resolver says no too");
		expect(onSubmit).not.toHaveBeenCalled();

		engine();
	});

	it("skipLabelWarning suppresses the dev-only label check", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const form = buildForm(`<input name="name" />`);
		const engine = createEngine(form, {
			fields: [{ name: "name", schema: {} }],
			onSubmit: vi.fn(),
			skipLabelWarning: true,
		});
		expect(warn).not.toHaveBeenCalled();
		engine();
		warn.mockRestore();
	});

	it("multiselect with nothing selected reports required as failed and an empty array value", async () => {
		const form = buildForm(`<input type="checkbox" name="tags" value="a" />`);
		const engine = createEngine(form, {
			fields: [{ name: "tags", schema: { type: "multiselect", required: "Pick one" } }],
			onSubmit: vi.fn(),
		});
		expect(engine.getValues().tags).toEqual([]);
		submit(form);
		await flush();
		expect(engine.getState().errors.tags).toBe("Pick one");
		engine();
	});

	it("ignores validateOn events whose target is not an HTMLElement", async () => {
		const form = buildForm(`<input name="name" />`);
		const onStateChange = vi.fn();
		const engine = createEngine(form, {
			fields: [{ name: "name", schema: {} }],
			validateOn: "input",
			onStateChange,
			onSubmit: vi.fn(),
		});

		const textNode = document.createTextNode("x");
		form.appendChild(textNode);
		textNode.dispatchEvent(new Event("input", { bubbles: true }));
		await flush();
		expect(onStateChange).not.toHaveBeenCalled();

		engine();
	});

	it("watch ignores input events from other fields", () => {
		const form = buildForm(`<input name="name" /><input name="other" />`);
		const engine = createEngine(form, {
			fields: [
				{ name: "name", schema: {} },
				{ name: "other", schema: {} },
			],
			onSubmit: vi.fn(),
		});

		const callback = vi.fn();
		engine.watch("name", callback);
		(form.querySelector('[name="other"]') as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
		expect(callback).not.toHaveBeenCalled();

		engine();
	});

	it("watch ignores events whose target is not an HTMLElement", () => {
		const form = buildForm(`<input name="name" />`);
		const engine = createEngine(form, {
			fields: [{ name: "name", schema: {} }],
			onSubmit: vi.fn(),
		});

		const callback = vi.fn();
		engine.watch("name", callback);

		const textNode = document.createTextNode("x");
		form.appendChild(textNode);
		textNode.dispatchEvent(new Event("input", { bubbles: true }));
		expect(callback).not.toHaveBeenCalled();

		engine();
	});

	it("empty number field parses as undefined, not a coercion error", () => {
		const form = buildForm(`<input name="age" />`);
		const engine = createEngine(form, {
			fields: [{ name: "age", schema: { type: "number" } }],
			onSubmit: vi.fn(),
		});
		expect(engine.getValues().age).toBeUndefined();
		engine();
	});
});
