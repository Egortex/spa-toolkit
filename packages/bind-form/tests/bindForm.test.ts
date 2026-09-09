import { afterEach, describe, expect, it, vi } from "vitest";
import { bindForm } from "../src/index";
import { createForm as buildForm, flush, submit } from "./helpers";

afterEach(() => {
	document.body.innerHTML = "";
});

describe("bindForm (regression, TEST-012)", () => {
	it("validates required/pattern/minLength/maxLength/min/max/validate and calls onSubmit when valid", async () => {
		const form = buildForm(`
			<input name="username" />
			<input name="bio" />
			<input name="age" />
			<button type="submit"></button>
		`);
		const onSubmit = vi.fn();

		const handle = bindForm(form, {
			schema: {
				username: {
					required: "Required",
					pattern: { value: /^[a-z]+$/, message: "lowercase only" },
					minLength: { value: 3, message: "too short" },
					maxLength: { value: 10, message: "too long" },
					validate: (v) => (v === "admin" ? "reserved" : undefined),
				},
				bio: {},
				age: { min: { value: 18, message: "too young" }, max: { value: 99, message: "too old" } },
			},
			onSubmit,
		});

		(form.elements.namedItem("username") as HTMLInputElement).value = "ab";
		(form.elements.namedItem("age") as HTMLInputElement).value = "10";
		submit(form);
		await flush();
		expect(onSubmit).not.toHaveBeenCalled();

		(form.elements.namedItem("username") as HTMLInputElement).value = "validname";
		(form.elements.namedItem("age") as HTMLInputElement).value = "25";
		submit(form);
		await flush();
		expect(onSubmit).toHaveBeenCalledWith({ username: "validname", bio: "", age: "25" }, form);

		handle();
	});

	it("shows the first field error in errorElement on failed submit and hides it on success", async () => {
		const form = buildForm(`<input name="name" />`);
		const errorElement = document.createElement("div");
		errorElement.setAttribute("hidden", "");
		form.appendChild(errorElement);

		const handle = bindForm(form, {
			schema: { name: { required: "Name required" } },
			errorElement,
			onSubmit: vi.fn(),
		});

		submit(form);
		await flush();
		expect(errorElement.hidden).toBe(false);
		expect(errorElement.textContent).toBe("Name required");

		(form.elements.namedItem("name") as HTMLInputElement).value = "Ann";
		submit(form);
		await flush();
		expect(errorElement.hidden).toBe(true);

		handle();
	});

	it("runs the resolver only for fields that passed schema validation", async () => {
		const form = buildForm(`<input name="username" /><input name="email" />`);
		(form.elements.namedItem("username") as HTMLInputElement).value = "validname";
		(form.elements.namedItem("email") as HTMLInputElement).value = "taken@x.com";

		const resolver = vi.fn().mockResolvedValue({ email: "Email already taken" });
		const onSubmit = vi.fn();

		const handle = bindForm(form, {
			schema: { username: { required: "Required" }, email: {} },
			resolver,
			onSubmit,
		});

		submit(form);
		await flush();
		expect(resolver).toHaveBeenCalledWith({ username: "validname", email: "taken@x.com" });
		expect(onSubmit).not.toHaveBeenCalled();

		handle();
	});

	it("validateOn 'blur' validates a single field and updates its data-error-for element", async () => {
		const form = buildForm(`<input name="email" /><span data-error-for="email" hidden></span>`);
		const handle = bindForm(form, {
			schema: { email: { required: "Required" } },
			validateOn: "blur",
			onSubmit: vi.fn(),
		});

		const input = form.querySelector('[name="email"]') as HTMLInputElement;
		input.dispatchEvent(new Event("blur", { bubbles: true }));
		await flush();

		const errorEl = form.querySelector("[data-error-for]") as HTMLElement;
		expect(errorEl.hidden).toBe(false);
		expect(errorEl.textContent).toBe("Required");
		expect(input.getAttribute("aria-invalid")).toBe("true");

		handle();
	});

	it("validateOn 'input' behaves the same way and ignores events from unrelated/non-schema elements", async () => {
		const form = buildForm(`<input name="email" /><input name="other" />`);
		const onStateChange = vi.fn();
		const handle = bindForm(form, {
			schema: { email: {} },
			validateOn: "input",
			onStateChange,
			onSubmit: vi.fn(),
		});

		(form.querySelector('[name="other"]') as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
		await flush();
		const callsAfterUnrelated = onStateChange.mock.calls.length;

		(form.querySelector('[name="email"]') as HTMLInputElement).value = "a";
		(form.querySelector('[name="email"]') as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
		await flush();
		expect(onStateChange.mock.calls.length).toBeGreaterThan(callsAfterUnrelated);

		handle();
	});

	it("disableSubmitWhilePending disables and re-enables [type=submit] elements (default true)", async () => {
		const form = buildForm(`<input name="name" /><button type="submit"></button>`);
		(form.elements.namedItem("name") as HTMLInputElement).value = "ok";
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});

		const handle = bindForm(form, {
			schema: { name: {} },
			onSubmit: () => pending,
		});

		const button = form.querySelector("button")!;
		submit(form);
		await flush();
		expect(button.disabled).toBe(true);
		release();
		await flush();
		expect(button.disabled).toBe(false);

		handle();
	});

	it("disableSubmitWhilePending: false keeps the submit button enabled", async () => {
		const form = buildForm(`<input name="name" /><button type="submit"></button>`);
		(form.elements.namedItem("name") as HTMLInputElement).value = "ok";
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});

		const handle = bindForm(form, {
			schema: { name: {} },
			disableSubmitWhilePending: false,
			onSubmit: () => pending,
		});

		submit(form);
		await flush();
		expect(form.querySelector("button")!.disabled).toBe(false);
		release();
		await flush();

		handle();
	});

	it("resetOnSuccess resets the form and clears errors/touched/dirty after a successful submit", async () => {
		const form = buildForm(`<input name="name" /><span data-error-for="name" hidden></span>`);
		const onStateChange = vi.fn();

		const handle = bindForm(form, {
			schema: { name: { required: "Required" } },
			validateOn: "input",
			resetOnSuccess: true,
			onStateChange,
			onSubmit: vi.fn(),
		});

		const input = form.querySelector('[name="name"]') as HTMLInputElement;
		input.value = "Ann";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await flush();
		expect(handle.getState().dirty.name).toBe(true);
		expect(handle.getState().touched.name).toBe(true);

		submit(form);
		await flush();
		expect(input.value).toBe("");
		expect(handle.getState().dirty.name).toBe(false);
		expect(handle.getState().touched.name).toBe(false);

		handle();
	});

	it("reports isSubmitting/isDirty/touched/dirty via onStateChange and getState", async () => {
		const form = buildForm(`<input name="name" />`);
		const states: unknown[] = [];

		const handle = bindForm(form, {
			schema: { name: {} },
			onStateChange: (state) => states.push({ ...state }),
			onSubmit: vi.fn(),
		});

		expect(handle.getState().isDirty).toBe(false);
		handle.setValue("name", "Ann");
		expect(handle.getState().isDirty).toBe(true);
		expect(handle.getState().values.name).toBe("Ann");
		expect(states.length).toBeGreaterThan(0);

		handle();
	});

	it("watch calls back with the field's value on input, and unsubscribes", async () => {
		const form = buildForm(`<input name="name" />`);
		const handle = bindForm(form, { schema: { name: {} }, onSubmit: vi.fn() });

		const callback = vi.fn();
		const unwatch = handle.watch("name", callback);

		const input = form.querySelector('[name="name"]') as HTMLInputElement;
		input.value = "Ann";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		expect(callback).toHaveBeenCalledWith("Ann", { name: "Ann" });

		unwatch();
		input.value = "Bob";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		expect(callback).toHaveBeenCalledOnce();

		handle();
	});

	it("setError/getState reflect a manually set error, and it is cleared on reset()", () => {
		const form = buildForm(`<input name="name" /><span data-error-for="name" hidden></span>`);
		const handle = bindForm(form, { schema: { name: {} }, onSubmit: vi.fn() });

		handle.setError("name", "Manual error");
		expect(handle.getState().errors.name).toBe("Manual error");
		expect((form.querySelector("[data-error-for]") as HTMLElement).hidden).toBe(false);

		handle.reset();
		expect(handle.getState().errors.name).toBeUndefined();

		handle();
	});

	it("the returned handle unsubscribes both submit and validateOn listeners", async () => {
		const form = buildForm(`<input name="name" />`);
		const onSubmit = vi.fn();
		const handle = bindForm(form, { schema: { name: {} }, validateOn: "blur", onSubmit });

		handle();

		submit(form);
		await flush();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("moves focus to the first invalid field (in DOM order) on failed submit", async () => {
		const form = buildForm(`<input name="a" /><input name="b" />`);
		const handle = bindForm(form, {
			schema: { a: {}, b: { required: "Required" } },
			onSubmit: vi.fn(),
		});

		submit(form);
		await flush();
		expect(document.activeElement).toBe(form.querySelector('[name="b"]'));

		handle();
	});
});
