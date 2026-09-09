import { afterEach, describe, expect, it, vi } from "vitest";
import { createForm } from "../src/createForm";
import { FormSubmitError } from "../src/serverErrors";
import { createForm as buildForm, flush, submit } from "./helpers";

// Minimal ambient declaration: no `@types/node` devDependency (see src/accessibility.ts for the same pattern).
declare const process: { once: (event: "unhandledRejection", listener: (reason: unknown) => void) => void };

afterEach(() => {
	document.body.innerHTML = "";
});

describe("createForm: typed values (TEST-001/TEST-002)", () => {
	it("infers form.values/form.errors from the schema without an explicit generic", async () => {
		const form = buildForm(`<input name="name" /><input name="email" />`);
		const onSubmit = vi.fn();

		const handle = createForm(form, {
			schema: {
				name: { required: "Required" },
				email: { required: "Required" },
			},
			onSubmit,
		});

		(form.elements.namedItem("name") as HTMLInputElement).value = "Ann";
		(form.elements.namedItem("email") as HTMLInputElement).value = "a@b.co";
		submit(form);
		await flush();

		expect(onSubmit).toHaveBeenCalledWith({ name: "Ann", email: "a@b.co" }, form);
		expect(handle.getValues()).toEqual({ name: "Ann", email: "a@b.co" });

		handle();
	});

	it("coerces a type: 'number' field to number, with an error for unparsable input", async () => {
		const form = buildForm(`<input name="age" />`);
		const onSubmit = vi.fn();
		const handle = createForm(form, { schema: { age: { type: "number" } }, onSubmit });

		(form.elements.namedItem("age") as HTMLInputElement).value = "not-a-number";
		submit(form);
		await flush();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(handle.getState().errors.age).toBe("Invalid number value");

		(form.elements.namedItem("age") as HTMLInputElement).value = "42";
		submit(form);
		await flush();
		expect(onSubmit).toHaveBeenCalledWith({ age: 42 }, form);
		expect(typeof handle.getValues().age).toBe("number");

		handle();
	});

	it("coerces a type: 'checkbox' field to boolean", async () => {
		const form = buildForm(`<input type="checkbox" name="agree" />`);
		const onSubmit = vi.fn();
		const handle = createForm(form, { schema: { agree: { type: "checkbox" } }, onSubmit });

		expect(handle.getValues().agree).toBe(false);
		(form.elements.namedItem("agree") as HTMLInputElement).checked = true;
		submit(form);
		await flush();
		expect(onSubmit).toHaveBeenCalledWith({ agree: true }, form);

		handle();
	});

	it("coerces a type: 'multiselect' field to string[]", async () => {
		const form = buildForm(`
			<input type="checkbox" name="tags" value="a" />
			<input type="checkbox" name="tags" value="b" />
		`);
		const onSubmit = vi.fn();
		const handle = createForm(form, { schema: { tags: { type: "multiselect" } }, onSubmit });

		const [a, b] = Array.from(form.querySelectorAll('[name="tags"]')) as HTMLInputElement[];
		a.checked = true;
		b.checked = true;
		submit(form);
		await flush();
		expect(onSubmit).toHaveBeenCalledWith({ tags: ["a", "b"] }, form);

		handle();
	});

	it("supports a custom parse/serialize pair", async () => {
		const form = buildForm(`<input name="csv" />`);
		const onSubmit = vi.fn();
		const handle = createForm(form, {
			schema: {
				csv: {
					parse: (raw) => raw.split(",").filter(Boolean),
					serialize: (value: string[]) => value.join(","),
				},
			},
			onSubmit,
		});

		handle.setValue("csv", ["x", "y"]);
		expect((form.elements.namedItem("csv") as HTMLInputElement).value).toBe("x,y");
		submit(form);
		await flush();
		expect(onSubmit).toHaveBeenCalledWith({ csv: ["x", "y"] }, form);

		handle();
	});

	it("writes initialValues into the DOM at creation time", () => {
		const form = buildForm(`<input name="name" /><input name="age" />`);
		const handle = createForm(form, {
			schema: { name: {}, age: { type: "number" } },
			initialValues: { name: "Ann", age: 30 },
			onSubmit: vi.fn(),
		});

		expect((form.elements.namedItem("name") as HTMLInputElement).value).toBe("Ann");
		expect((form.elements.namedItem("age") as HTMLInputElement).value).toBe("30");
		expect(handle.getState().isDirty).toBe(false);

		handle();
	});

	it("ignores initialValues entries that are undefined or have no matching DOM element", () => {
		const form = buildForm(`<input name="name" />`);
		const handle = createForm(form, {
			schema: { name: {}, missing: {} },
			initialValues: { name: undefined, missing: "x" },
			onSubmit: vi.fn(),
		});

		expect((form.elements.namedItem("name") as HTMLInputElement).value).toBe("");

		handle();
	});
});

describe("createForm: validation pipeline (TEST-003/TEST-004)", () => {
	it("blocks the async rule when a sync rule already failed (REQ-006)", async () => {
		const async = vi.fn();
		const form = buildForm(`<input name="email" />`);
		const handle = createForm(form, {
			schema: { email: { required: "Required", async } },
			onSubmit: vi.fn(),
		});

		submit(form);
		await flush();
		expect(async).not.toHaveBeenCalled();
		expect(handle.getState().errors.email).toBe("Required");

		handle();
	});

	it("runs the async rule when sync passed, and reflects its result", async () => {
		const async = vi.fn().mockResolvedValue("Already taken");
		const form = buildForm(`<input name="email" />`);
		const onSubmit = vi.fn();
		const handle = createForm(form, {
			schema: { email: { async } },
			onSubmit,
		});

		(form.elements.namedItem("email") as HTMLInputElement).value = "a@b.co";
		submit(form);
		await flush();
		expect(async).toHaveBeenCalled();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(handle.getState().errors.email).toBe("Already taken");

		handle();
	});

	it("runs the form-level resolver after per-field stages, only for fields that passed them", async () => {
		const form = buildForm(`<input name="name" /><input name="email" />`);
		(form.elements.namedItem("name") as HTMLInputElement).value = "Ann";
		(form.elements.namedItem("email") as HTMLInputElement).value = "a@b.co";

		const resolver = vi.fn().mockResolvedValue({ email: "Taken" });
		const handle = createForm(form, {
			schema: { name: { required: "Required" }, email: {} },
			resolver,
			onSubmit: vi.fn(),
		});

		submit(form);
		await flush();
		expect(resolver).toHaveBeenCalledWith({ name: "Ann", email: "a@b.co" });
		expect(handle.getState().errors.email).toBe("Taken");

		handle();
	});
});

describe("createForm: server error mapping (Phase 3)", () => {
	it("maps a thrown FormSubmitError's known-field errors via errorMessages", async () => {
		const form = buildForm(`<input name="email" />`);
		(form.elements.namedItem("email") as HTMLInputElement).value = "a@b.co";

		const handle = createForm(form, {
			schema: { email: {} },
			errorMessages: { EMAIL_EXISTS: "Email already taken" },
			onSubmit: () => {
				throw new FormSubmitError([{ field: "email", code: "EMAIL_EXISTS" }]);
			},
		});

		submit(form);
		await flush();
		expect(handle.getState().errors.email).toBe("Email already taken");

		handle();
	});

	it("puts a FormSubmitError entry with an unknown field into formError (REQ-009)", async () => {
		const form = buildForm(`<input name="email" />`);
		(form.elements.namedItem("email") as HTMLInputElement).value = "a@b.co";
		const errorElement = document.createElement("div");
		form.appendChild(errorElement);

		const handle = createForm(form, {
			schema: { email: {} },
			errorElement,
			onSubmit: async () => {
				throw new FormSubmitError([{ code: "RATE_LIMITED", message: "Too many attempts" }]);
			},
		});

		submit(form);
		await flush();
		expect(handle.getState().formError).toBe("Too many attempts");
		expect(errorElement.hidden).toBe(false);
		expect(errorElement.textContent).toBe("Too many attempts");

		handle();
	});

	it("rethrows an error that is not a FormSubmitError (TASK-013 scope)", async () => {
		const form = buildForm(`<input name="email" />`);
		(form.elements.namedItem("email") as HTMLInputElement).value = "a@b.co";

		const caught = new Promise<unknown>((resolve) => {
			process.once("unhandledRejection", resolve);
		});

		const boom = new Error("boom");
		const handle = createForm(form, {
			schema: { email: {} },
			onSubmit: () => {
				throw boom;
			},
		});

		submit(form);
		const rejected = await caught;
		expect(rejected).toBe(boom);

		handle();
	});

	it("setFormError sets and clears the form-level error", () => {
		const form = buildForm(`<input name="email" />`);
		const errorElement = document.createElement("div");
		form.appendChild(errorElement);
		const handle = createForm(form, { schema: { email: {} }, errorElement, onSubmit: vi.fn() });

		handle.setFormError("Oops");
		expect(handle.getState().formError).toBe("Oops");
		expect(errorElement.hidden).toBe(false);

		handle.setFormError(undefined);
		expect(handle.getState().formError).toBeUndefined();
		expect(errorElement.hidden).toBe(true);

		handle();
	});
});

describe("createForm: accessibility (Phase 4, shared with bindForm)", () => {
	it("sets aria-invalid/aria-describedby/role=alert and focuses the first invalid field", async () => {
		const form = buildForm(`
			<input name="name" />
			<input name="email" />
			<span data-error-for="email" hidden></span>
		`);
		const handle = createForm(form, {
			schema: { name: {}, email: { required: "Required" } },
			onSubmit: vi.fn(),
		});

		submit(form);
		await flush();

		const email = form.querySelector('[name="email"]') as HTMLInputElement;
		const errorEl = form.querySelector("[data-error-for]") as HTMLElement;
		expect(email.getAttribute("aria-invalid")).toBe("true");
		expect(email.getAttribute("aria-describedby")).toBe(errorEl.id);
		expect(errorEl.getAttribute("role")).toBe("alert");
		expect(document.activeElement).toBe(email);

		handle();
	});
});

describe("createForm: watch/setValue/reset with typed values", () => {
	it("watch receives the typed value", () => {
		const form = buildForm(`<input name="age" />`);
		const handle = createForm(form, { schema: { age: { type: "number" } }, onSubmit: vi.fn() });

		const callback = vi.fn();
		handle.watch("age", callback);

		const input = form.querySelector('[name="age"]') as HTMLInputElement;
		input.value = "7";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		expect(callback).toHaveBeenCalledWith(7, { age: 7 });

		handle();
	});

	it("setError sets a field error directly", () => {
		const form = buildForm(`<input name="name" /><span data-error-for="name" hidden></span>`);
		const handle = createForm(form, { schema: { name: {} }, onSubmit: vi.fn() });

		handle.setError("name", "Manual error");
		expect(handle.getState().errors.name).toBe("Manual error");

		handle();
	});

	it("reset() restores initialValues-based dirty tracking", () => {
		const form = buildForm(`<input name="name" />`);
		const handle = createForm(form, { schema: { name: {} }, initialValues: { name: "Ann" }, onSubmit: vi.fn() });

		handle.setValue("name", "Bob");
		expect(handle.getState().isDirty).toBe(true);
		handle.reset();
		expect(handle.getState().values.name).toBe("");
		expect(handle.getState().isDirty).toBe(false);

		handle();
	});
});
