/** A single server-side validation error returned after a failed submit (e.g. HTTP 422). */
export interface ServerError {
	/** Name of the field the error applies to. If it doesn't match a schema field, it becomes `form.formError` (REQ-009). */
	field?: string | null;
	/** Machine-readable error code, resolved through `errorMessages` (REQ-008). */
	code?: string;
	/** Human-readable fallback message, used if `code` has no entry in `errorMessages`. */
	message?: string;
}

/** Response shape expected from a failed submit: a list of per-field (or form-level) errors. */
export type ServerErrorResponse = ServerError[];

/**
 * Thrown (or returned as a rejected promise) by `onSubmit` to report server-side validation errors.
 * `createForm` catches it and maps `errors` through `mapServerErrors` instead of letting it propagate
 * as an unhandled exception (TASK-013).
 */
export class FormSubmitError extends Error {
	errors: ServerErrorResponse;

	constructor(errors: ServerErrorResponse, message = "Form submit failed") {
		super(message);
		this.name = "FormSubmitError";
		this.errors = errors;
	}
}

/** Result of `mapServerErrors`: per-field messages plus an optional form-level (non-field) message. */
export interface MappedServerErrors<TField extends string> {
	fieldErrors: Partial<Record<TField, string>>;
	formError?: string;
}

/**
 * Maps a `ServerErrorResponse` into per-field errors plus a form-level error (REQ-007/REQ-009).
 *
 * For each entry: the message is resolved as `errorMessages[code]` (if `code` and a matching entry
 * exist), else the raw `message`, else the raw `code`, else a generic fallback (REQ-008). Entries
 * whose `field` is missing or not part of `knownFields` are collected into `formError` instead
 * (the first one wins, matching the "first error" convention used elsewhere in this package).
 */
export function mapServerErrors<TField extends string>(
	response: ServerErrorResponse,
	knownFields: readonly TField[],
	errorMessages?: Record<string, string>,
): MappedServerErrors<TField> {
	const fieldErrors = {} as Partial<Record<TField, string>>;
	let formError: string | undefined;

	for (const error of response) {
		const message = resolveMessage(error, errorMessages);
		const field = error.field;

		if (field && (knownFields as readonly string[]).includes(field)) {
			fieldErrors[field as TField] = message;
		} else if (!formError) {
			formError = message;
		}
	}

	return { fieldErrors, formError };
}

function resolveMessage(error: ServerError, errorMessages?: Record<string, string>): string {
	if (error.code && errorMessages?.[error.code]) return errorMessages[error.code];
	if (error.message) return error.message;
	if (error.code) return error.code;
	return "Invalid value";
}
