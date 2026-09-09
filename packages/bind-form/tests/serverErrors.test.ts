import { describe, expect, it } from "vitest";
import { FormSubmitError, mapServerErrors } from "../src/serverErrors";

describe("mapServerErrors", () => {
	it("resolves a known code through errorMessages (TEST-005)", () => {
		const { fieldErrors } = mapServerErrors([{ field: "email", code: "EMAIL_EXISTS" }], ["email"], {
			EMAIL_EXISTS: "Email already taken",
		});
		expect(fieldErrors).toEqual({ email: "Email already taken" });
	});

	it("falls back to the raw message when the code has no dictionary entry", () => {
		const { fieldErrors } = mapServerErrors([{ field: "email", code: "WEIRD", message: "Something's off" }], ["email"]);
		expect(fieldErrors).toEqual({ email: "Something's off" });
	});

	it("falls back to the raw code when there is no message either (TEST-006)", () => {
		const { fieldErrors } = mapServerErrors([{ field: "email", code: "UNKNOWN_CODE" }], ["email"]);
		expect(fieldErrors).toEqual({ email: "UNKNOWN_CODE" });
	});

	it("falls back to a generic message when neither code nor message is present", () => {
		const { fieldErrors } = mapServerErrors([{ field: "email" }], ["email"]);
		expect(fieldErrors).toEqual({ email: "Invalid value" });
	});

	it("puts errors for unknown or missing fields into formError, not fieldErrors (TEST-007)", () => {
		const { fieldErrors, formError } = mapServerErrors([{ field: "nonexistent", code: "X" }], ["email"]);
		expect(fieldErrors).toEqual({});
		expect(formError).toBe("X");
	});

	it("treats a missing/null field as a form-level error", () => {
		const withoutField = mapServerErrors([{ code: "GENERIC" }], ["email"]);
		expect(withoutField.formError).toBe("GENERIC");

		const withNullField = mapServerErrors([{ field: null, code: "GENERIC" }], ["email"]);
		expect(withNullField.formError).toBe("GENERIC");
	});

	it("keeps only the first form-level error", () => {
		const { formError } = mapServerErrors(
			[
				{ field: "missing1", code: "FIRST" },
				{ field: "missing2", code: "SECOND" },
			],
			["email"],
		);
		expect(formError).toBe("FIRST");
	});

	it("maps multiple known fields independently", () => {
		const { fieldErrors, formError } = mapServerErrors(
			[
				{ field: "email", code: "EMAIL_EXISTS" },
				{ field: "username", message: "Too short" },
			],
			["email", "username"],
			{ EMAIL_EXISTS: "Email taken" },
		);
		expect(fieldErrors).toEqual({ email: "Email taken", username: "Too short" });
		expect(formError).toBeUndefined();
	});

	it("returns no formError when every error matches a known field", () => {
		const { formError } = mapServerErrors([{ field: "email", code: "X" }], ["email"]);
		expect(formError).toBeUndefined();
	});
});

describe("FormSubmitError", () => {
	it("carries the errors and a default message", () => {
		const errors = [{ field: "email", code: "EMAIL_EXISTS" }];
		const error = new FormSubmitError(errors);
		expect(error.errors).toBe(errors);
		expect(error.message).toBe("Form submit failed");
		expect(error.name).toBe("FormSubmitError");
		expect(error).toBeInstanceOf(Error);
	});

	it("accepts a custom message", () => {
		const error = new FormSubmitError([], "Nope");
		expect(error.message).toBe("Nope");
	});
});
