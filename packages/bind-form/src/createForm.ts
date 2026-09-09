import type { FieldSchema, FormHandle, InferValues, TypedFormState } from "./types";
import { createEngine, serializeFieldValue } from "./engine";
import { mapServerErrors } from "./serverErrors";
import { FormSubmitError } from "./serverErrors";

export interface CreateFormOptions<TSchema extends Record<string, FieldSchema<any>>> {
	/** Validation + typing schema: keys must match the `name` attributes of the form fields. */
	schema: TSchema;
	/** Initial values written into the form's fields when `createForm` is called. */
	initialValues?: Partial<InferValues<TSchema>>;
	/** Element used to display the form-level error message (must support `hidden`). */
	errorElement?: HTMLElement;
	/**
	 * Run validation for a field as the user interacts with it, in addition to on submit.
	 * Per-field errors are shown in elements matching `[data-error-for="<field>"]` inside the form.
	 */
	validateOn?: "blur" | "input";
	/**
	 * Additional form-level async validation, run on submit after each field's own
	 * `sync -> async` pipeline. Only consulted for fields that passed their own pipeline.
	 */
	resolver?: (
		values: InferValues<TSchema>,
	) => Partial<Record<keyof TSchema & string, string>> | Promise<Partial<Record<keyof TSchema & string, string>>>;
	/** Called whenever the form's values/errors/formError/touched/dirty/submitting state changes. */
	onStateChange?: (state: TypedFormState<InferValues<TSchema>, keyof TSchema & string>) => void;
	/**
	 * Disable `[type="submit"]` elements inside the form while `onSubmit` is pending.
	 * Defaults to `true`.
	 */
	disableSubmitWhilePending?: boolean;
	/**
	 * Called with the validated, typed values after a successful sync/async/resolver pipeline.
	 * Throw (or reject with) a `FormSubmitError` to report server-side validation errors — they
	 * are mapped through `mapServerErrors`/`errorMessages` automatically instead of propagating
	 * as an unhandled exception (REQ-007/TASK-013).
	 */
	onSubmit: (values: InferValues<TSchema>, form: HTMLFormElement) => void | Promise<void>;
	/** Reset the form after a successful onSubmit. */
	resetOnSuccess?: boolean;
	/** Maps a server error `code` (see `ServerError`) to a human-readable message (REQ-008). */
	errorMessages?: Record<string, string>;
}

/**
 * Creates a typed form engine over a real `<form>`: `form.values`/`form.errors` are inferred
 * from `schema` (REQ-001/REQ-002), field values are parsed/serialized per `FieldSchema.type`
 * (REQ-003), and the `sync -> async(per field) -> resolver(form-level) -> server` validation
 * pipeline (see `validation.ts`) runs on every submit. Accessibility (`aria-invalid`,
 * `aria-describedby`, `role="alert"`, focus management on failed submit) is applied automatically,
 * same as `bindForm` (ASSUMPTION-001).
 *
 * Returns a handle: call it to unsubscribe, or use `getValues`/`setValue`/`setError`/
 * `setFormError`/`reset`/`getState`/`watch`.
 */
export function createForm<TSchema extends Record<string, FieldSchema<any>>>(
	form: HTMLFormElement,
	options: CreateFormOptions<TSchema>,
): FormHandle<InferValues<TSchema>, keyof TSchema & string> {
	type TField = keyof TSchema & string;
	type TValues = InferValues<TSchema>;

	const fieldNames = Object.keys(options.schema) as TField[];

	if (options.initialValues) {
		for (const field of fieldNames) {
			const value = (options.initialValues as Record<string, unknown>)[field];
			if (value === undefined) continue;

			const element = form.elements.namedItem(field);
			if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
				element.value = serializeFieldValue(options.schema[field], value);
			}
		}
	}

	const engine = createEngine<TValues, TField>(form, {
		fields: fieldNames.map((name) => ({ name, schema: options.schema[name] })),
		errorElement: options.errorElement,
		validateOn: options.validateOn,
		resolver: options.resolver,
		onStateChange: options.onStateChange,
		disableSubmitWhilePending: options.disableSubmitWhilePending,
		onSubmit: options.onSubmit,
		resetOnSuccess: options.resetOnSuccess,
		mapSubmitError: (error) => {
			if (!(error instanceof FormSubmitError)) return undefined;
			return mapServerErrors(error.errors, fieldNames, options.errorMessages);
		},
	});

	const handle = (() => engine()) as FormHandle<TValues, TField>;

	handle.getValues = () => engine.getValues();
	handle.setValue = (field, value) => engine.setValue(field, serializeFieldValue(options.schema[field], value));
	handle.setError = (field, message) => engine.setError(field, message);
	handle.setFormError = (message) => engine.setFormError(message);
	handle.reset = () => engine.reset();
	handle.getState = () => engine.getState();
	handle.watch = (field, callback) => engine.watch(field, (value, values) => callback(value as TValues[typeof field], values));

	return handle;
}
