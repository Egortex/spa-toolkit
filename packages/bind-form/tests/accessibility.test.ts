import { afterEach, describe, expect, it, vi } from "vitest";
import { applyFieldAccessibility, ensureErrorElementA11y, focusFirstInvalidField, warnIfLabelMissing } from "../src/accessibility";
import { createForm } from "./helpers";

afterEach(() => {
	document.body.innerHTML = "";
	vi.unstubAllEnvs();
});

describe("applyFieldAccessibility", () => {
	it("sets aria-invalid and links a generated error id via aria-describedby (TEST-008/TEST-009)", () => {
		const form = createForm(`<input name="email" /><span data-error-for="email" hidden></span>`);
		const input = form.querySelector("input")!;
		const errorElement = form.querySelector("[data-error-for]") as HTMLElement;

		applyFieldAccessibility(input, "email", errorElement, true);

		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(errorElement.id).toBe("email-error");
		expect(input.getAttribute("aria-describedby")).toBe("email-error");
		expect(errorElement.getAttribute("role")).toBe("alert");
		expect(errorElement.getAttribute("aria-live")).toBe("polite");
	});

	it("removes aria-invalid and the describedby reference when the error clears", () => {
		const form = createForm(`<input name="email" /><span data-error-for="email" hidden></span>`);
		const input = form.querySelector("input")!;
		const errorElement = form.querySelector("[data-error-for]") as HTMLElement;

		applyFieldAccessibility(input, "email", errorElement, true);
		applyFieldAccessibility(input, "email", errorElement, false);

		expect(input.hasAttribute("aria-invalid")).toBe(false);
		expect(input.hasAttribute("aria-describedby")).toBe(false);
	});

	it("preserves other ids already present in aria-describedby", () => {
		const form = createForm(`<input name="email" aria-describedby="hint" /><span data-error-for="email" hidden></span>`);
		const input = form.querySelector("input")!;
		const errorElement = form.querySelector("[data-error-for]") as HTMLElement;

		applyFieldAccessibility(input, "email", errorElement, true);
		expect(input.getAttribute("aria-describedby")).toBe("hint email-error");

		applyFieldAccessibility(input, "email", errorElement, false);
		expect(input.getAttribute("aria-describedby")).toBe("hint");
	});

	it("keeps an existing error element id instead of overwriting it", () => {
		const form = createForm(`<input name="email" /><span id="custom-id" data-error-for="email" hidden></span>`);
		const input = form.querySelector("input")!;
		const errorElement = form.querySelector("[data-error-for]") as HTMLElement;

		applyFieldAccessibility(input, "email", errorElement, true);
		expect(errorElement.id).toBe("custom-id");
		expect(input.getAttribute("aria-describedby")).toBe("custom-id");
	});

	it("does nothing to aria-describedby when there is no error element", () => {
		const form = createForm(`<input name="email" />`);
		const input = form.querySelector("input")!;

		applyFieldAccessibility(input, "email", null, true);
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(input.hasAttribute("aria-describedby")).toBe(false);
	});
});

describe("ensureErrorElementA11y", () => {
	it("sets role and aria-live only if not already present", () => {
		const el = document.createElement("span");
		el.setAttribute("role", "status");
		ensureErrorElementA11y(el);
		expect(el.getAttribute("role")).toBe("status");
		expect(el.getAttribute("aria-live")).toBe("polite");
	});

	it("sets both when absent", () => {
		const el = document.createElement("span");
		ensureErrorElementA11y(el);
		expect(el.getAttribute("role")).toBe("alert");
		expect(el.getAttribute("aria-live")).toBe("polite");
	});
});

describe("focusFirstInvalidField", () => {
	it("focuses the first field with an error in DOM order (TEST-010)", () => {
		const form = createForm(`<input name="a" /><input name="b" /><input name="c" />`);
		focusFirstInvalidField(form, { b: "Bad", c: "Also bad" });
		expect(document.activeElement).toBe(form.querySelector('[name="b"]'));
	});

	it("does nothing when there are no errors", () => {
		const form = createForm(`<input name="a" />`);
		focusFirstInvalidField(form, {});
		expect(document.activeElement).not.toBe(form.querySelector('[name="a"]'));
	});

	it("skips elements without a name", () => {
		const form = createForm(`<input /><input name="b" />`);
		focusFirstInvalidField(form, { b: "Bad" });
		expect(document.activeElement).toBe(form.querySelector('[name="b"]'));
	});

	it("does not throw when the matching element has no focus method", () => {
		const form = createForm(`<input name="a" />`);
		const input = form.querySelector('[name="a"]') as unknown as { focus?: unknown };
		input.focus = undefined;
		expect(() => focusFirstInvalidField(form, { a: "Bad" })).not.toThrow();
	});

	it("does not follow Tab navigation with a focus trap (TEST-011)", () => {
		const form = createForm(`<input name="a" /><input name="b" />`);
		focusFirstInvalidField(form, { a: "Bad" });
		expect(document.activeElement).toBe(form.querySelector('[name="a"]'));
		(form.querySelector('[name="b"]') as HTMLInputElement).focus();
		expect(document.activeElement).toBe(form.querySelector('[name="b"]'));
	});
});

describe("warnIfLabelMissing", () => {
	it("warns when a field has no associated label", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const form = createForm(`<input id="email" name="email" />`);
		warnIfLabelMissing(form, "email");
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it("does not warn when a label[for] targets the field's id", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const form = createForm(`<label for="email">Email</label><input id="email" name="email" />`);
		warnIfLabelMissing(form, "email");
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("does not warn when the field is wrapped in a label", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const form = createForm(`<label>Email <input name="email" /></label>`);
		warnIfLabelMissing(form, "email");
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("does not warn when the field has aria-label", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const form = createForm(`<input name="email" aria-label="Email" />`);
		warnIfLabelMissing(form, "email");
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("does not warn when the field has aria-labelledby", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const form = createForm(`<span id="lbl">Email</span><input name="email" aria-labelledby="lbl" />`);
		warnIfLabelMissing(form, "email");
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("does nothing when the field does not exist in the form", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const form = createForm(`<input name="email" />`);
		warnIfLabelMissing(form, "missing");
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("does nothing when the name resolves to a RadioNodeList instead of an element", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const form = createForm(`<input name="choice" value="a" /><input name="choice" value="b" />`);
		warnIfLabelMissing(form, "choice");
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("is skipped entirely in production", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.stubEnv("NODE_ENV", "production");
		const form = createForm(`<input name="email" />`);
		warnIfLabelMissing(form, "email");
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("warns using the field name when the input has no id", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const form = createForm(`<input name="email" />`);
		warnIfLabelMissing(form, "email");
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('for="email"'));
		warn.mockRestore();
	});
});
