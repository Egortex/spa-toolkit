import { describe, expect, it, vi } from "vitest";
import { runFieldPipeline, runFormPipeline, runSyncRules } from "../src/validation";
import type { FieldSchema } from "../src/types";

describe("runSyncRules", () => {
	it("returns the required message when raw is empty", () => {
		expect(runSyncRules({ required: "Required" }, "")).toBe("Required");
	});

	it("skips remaining checks when raw is empty and not required", () => {
		expect(runSyncRules({ pattern: { value: /x/, message: "no" } }, "")).toBeUndefined();
	});

	it("checks pattern only when non-empty", () => {
		expect(runSyncRules({ pattern: { value: /^\d+$/, message: "digits only" } }, "abc")).toBe("digits only");
		expect(runSyncRules({ pattern: { value: /^\d+$/, message: "digits only" } }, "123")).toBeUndefined();
	});

	it("checks minLength/maxLength", () => {
		expect(runSyncRules({ minLength: { value: 3, message: "too short" } }, "ab")).toBe("too short");
		expect(runSyncRules({ maxLength: { value: 3, message: "too long" } }, "abcd")).toBe("too long");
		expect(runSyncRules({ minLength: { value: 3, message: "too short" }, maxLength: { value: 5, message: "too long" } }, "abc")).toBeUndefined();
	});

	it("checks min/max only when the raw value parses as a number", () => {
		expect(runSyncRules({ min: { value: 5, message: "too small" } }, "3")).toBe("too small");
		expect(runSyncRules({ max: { value: 5, message: "too big" } }, "9")).toBe("too big");
		expect(runSyncRules({ min: { value: 5, message: "too small" }, max: { value: 10, message: "too big" } }, "7")).toBeUndefined();
		expect(runSyncRules({ min: { value: 5, message: "too small" } }, "not-a-number")).toBeUndefined();
	});

	it("returns undefined when no rule is violated", () => {
		expect(runSyncRules({}, "anything")).toBeUndefined();
	});
});

describe("runFieldPipeline", () => {
	it("does not run validate/async when a sync rule fails (REQ-006)", async () => {
		const validate = vi.fn();
		const async = vi.fn();
		const schema: FieldSchema<string> = { required: "Required", validate, async };
		const error = await runFieldPipeline(schema, "", "", {});
		expect(error).toBe("Required");
		expect(validate).not.toHaveBeenCalled();
		expect(async).not.toHaveBeenCalled();
	});

	it("returns the coercion error and skips validate/async", async () => {
		const validate = vi.fn();
		const async = vi.fn();
		const schema: FieldSchema<number> = { validate, async };
		const error = await runFieldPipeline(schema, "abc", NaN, {}, "Invalid number value");
		expect(error).toBe("Invalid number value");
		expect(validate).not.toHaveBeenCalled();
		expect(async).not.toHaveBeenCalled();
	});

	it("runs the sync validate rule after built-in sync rules pass", async () => {
		const async = vi.fn();
		const schema: FieldSchema<string> = {
			validate: (value) => (value === "taken" ? "Already taken" : undefined),
			async,
		};
		expect(await runFieldPipeline(schema, "taken", "taken", {})).toBe("Already taken");
		expect(async).not.toHaveBeenCalled();
	});

	it("treats an empty-string validate result as no error", async () => {
		const schema: FieldSchema<string> = { validate: () => "" };
		expect(await runFieldPipeline(schema, "ok", "ok", {})).toBeUndefined();
	});

	it("runs async only when sync stages pass, and reflects its result", async () => {
		const async = vi.fn().mockResolvedValue("Email taken");
		const schema: FieldSchema<string> = { async };
		const values = { email: "a@b.co" };
		expect(await runFieldPipeline(schema, "a@b.co", "a@b.co", values)).toBe("Email taken");
		expect(async).toHaveBeenCalledWith("a@b.co", values);
	});

	it("treats a falsy async result as no error", async () => {
		const schema: FieldSchema<string> = { async: async () => undefined };
		expect(await runFieldPipeline(schema, "ok", "ok", {})).toBeUndefined();
	});

	it("returns undefined when no rule, validate or async is configured", async () => {
		expect(await runFieldPipeline({}, "ok", "ok", {})).toBeUndefined();
	});
});

describe("runFormPipeline", () => {
	it("runs all fields in parallel and collects only the errors", async () => {
		const schemas: Record<"name" | "email", FieldSchema<string>> = {
			name: { required: "Name required" },
			email: { async: async (value) => (value === "taken@x.com" ? "Taken" : undefined) },
		};
		const raw = { name: "", email: "taken@x.com" };
		const values = { name: "", email: "taken@x.com" };

		const errors = await runFormPipeline(
			["name", "email"],
			(field) => schemas[field],
			(field) => raw[field],
			(field) => values[field],
			values,
		);

		expect(errors).toEqual({ name: "Name required", email: "Taken" });
	});

	it("applies a per-field coercion error via getCoercionError", async () => {
		const errors = await runFormPipeline(
			["age"],
			() => ({}) as FieldSchema<any>,
			() => "abc",
			() => undefined,
			{},
			() => "Invalid number value",
		);
		expect(errors).toEqual({ age: "Invalid number value" });
	});

	it("omits fields without errors", async () => {
		const errors = await runFormPipeline(
			["name"],
			() => ({}) as FieldSchema<any>,
			() => "ok",
			() => "ok",
			{},
		);
		expect(errors).toEqual({});
	});
});
