/** Built-in synchronous rules shared by the legacy `FieldRule` and the typed `FieldSchema`. */
export interface SyncFieldRules {
	/** Error message shown if the field is empty after trim(). */
	required?: string;
	/** Regex and error message checked only when the field is non-empty. */
	pattern?: { value: RegExp; message: string };
	/** Minimum string length (after trim()), checked only when the field is non-empty. */
	minLength?: { value: number; message: string };
	/** Maximum string length (after trim()). */
	maxLength?: { value: number; message: string };
	/** Minimum numeric value, checked only when the field parses as a number. */
	min?: { value: number; message: string };
	/** Maximum numeric value, checked only when the field parses as a number. */
	max?: { value: number; message: string };
}

/** Validation rule for a single form field, as consumed by `bindForm`. */
export interface FieldRule extends SyncFieldRules {
	/** Custom validator, run last. Return an error message, or undefined/empty string if valid. */
	validate?: (value: string) => string | undefined;
}

/** How a field's raw (always-string) FormData value is converted to a typed `form.values[field]`. */
export type FieldType = "text" | "number" | "checkbox" | "multiselect";

/**
 * Validation + typing schema for a single field, as consumed by `createForm`.
 * `TValue` is the type exposed on `form.values[field]` (inferred via `InferValues`).
 */
export interface FieldSchema<TValue = string> extends SyncFieldRules {
	/**
	 * How the raw FormData string is converted into `TValue`:
	 * - `"text"` (default) -> `string`
	 * - `"number"` -> `number` (raw parsed with `Number(...)`)
	 * - `"checkbox"` -> `boolean` (`true` if checked/present in FormData)
	 * - `"multiselect"` -> `string[]` (all values for fields with the same `name`, e.g. a multi-select or a group of checkboxes)
	 */
	type?: FieldType;
	/** Custom parser overriding the default `type`-based conversion. Not used for `type: "multiselect"`. */
	parse?: (raw: string) => TValue;
	/** Custom serializer used by `setValue` to turn a typed value back into a string for the DOM element. */
	serialize?: (value: TValue) => string;
	/** Synchronous custom validator, run after the built-in sync rules. */
	validate?: (value: TValue, values: Record<string, unknown>) => string | undefined;
	/**
	 * Asynchronous validator (e.g. a uniqueness check), run only if the field has no sync error
	 * (see `runFieldPipeline` / REQ-006).
	 */
	async?: (value: TValue, values: Record<string, unknown>) => string | undefined | Promise<string | undefined>;
}

/** Form values: field name -> string value taken from FormData. */
export type FormValues<TField extends string> = Record<TField, string>;

/** Validation errors keyed by field name. */
export type FormErrors<TField extends string> = Partial<Record<TField, string>>;

/** When to run per-field validation in addition to submit. */
export type ValidateTrigger = "blur" | "input";

/** Snapshot of the form's current state, passed to `onStateChange`. */
export interface FormState<TField extends string> {
	values: FormValues<TField>;
	errors: FormErrors<TField>;
	/** Whether a field has been interacted with (blur/input) since bind or last reset. */
	touched: Record<TField, boolean>;
	/** Whether a field's value differs from its value at bind time (or last reset). */
	dirty: Record<TField, boolean>;
	/** True if any field is dirty. */
	isDirty: boolean;
	/** True while `onSubmit` is pending. */
	isSubmitting: boolean;
}

/** Infers `form.values` shape from a `createForm` schema: field name -> its `FieldSchema<TValue>`'s `TValue`. */
export type InferValues<TSchema extends Record<string, FieldSchema<any>>> = {
	[K in keyof TSchema]: TSchema[K] extends FieldSchema<infer TValue> ? TValue : never;
};

/** Infers `form.errors` shape from a `createForm` schema: every field maps to an optional error message. */
export type InferErrors<TSchema extends Record<string, FieldSchema<any>>> = Partial<
	Record<keyof TSchema & string, string>
>;

/** Snapshot of a typed `createForm` form's current state, passed to `onStateChange`. */
export interface TypedFormState<TValues extends Record<string, unknown>, TField extends string> {
	values: TValues;
	errors: Partial<Record<TField, string>>;
	/** Form-level error not tied to any known field (see `ServerError`/REQ-009). */
	formError?: string;
	touched: Record<TField, boolean>;
	dirty: Record<TField, boolean>;
	isDirty: boolean;
	isSubmitting: boolean;
}

export interface BindFormOptions<TField extends string> {
	/** Validation schema: keys must match the `name` attributes of the form fields. */
	schema: Record<TField, FieldRule>;
	/** Element used to display the form-level error message (must support `hidden`). */
	errorElement?: HTMLElement;
	/**
	 * Run validation for a field as the user interacts with it, in addition to on submit.
	 * Per-field errors are shown in elements matching `[data-error-for="<field>"]` inside the form.
	 */
	validateOn?: ValidateTrigger;
	/**
	 * Additional async/external validation (e.g. a zod/yup schema adapter), run on submit
	 * after the `schema` rules. Only consulted for fields that passed `schema` validation.
	 */
	resolver?: (values: FormValues<TField>) => FormErrors<TField> | Promise<FormErrors<TField>>;
	/** Called whenever the form's values/errors/touched/dirty/submitting state changes. */
	onStateChange?: (state: FormState<TField>) => void;
	/**
	 * Disable `[type="submit"]` elements inside the form while `onSubmit` is pending.
	 * Defaults to `true`.
	 */
	disableSubmitWhilePending?: boolean;
	/** Called with the validated values after a successful submit. */
	onSubmit: (values: FormValues<TField>, form: HTMLFormElement) => void | Promise<void>;
	/** Reset the form after a successful onSubmit. */
	resetOnSuccess?: boolean;
}

/** Handle returned by `bindForm`. Calling it directly unsubscribes (same as before). */
export interface BindFormHandle<TField extends string> {
	(): void;
	/** Reads and trims the current values of all schema fields from the form. */
	getValues(): FormValues<TField>;
	/** Writes a value into the form field with the given name. */
	setValue(field: TField, value: string): void;
	/** Shows (or, if `message` is undefined, hides) the error for `[data-error-for="<field>"]`. */
	setError(field: TField, message: string | undefined): void;
	/** Resets the form, clears all displayed errors and recaptures dirty/touched state. */
	reset(): void;
	/** Returns a snapshot of the current form state (values/errors/touched/dirty/isSubmitting). */
	getState(): FormState<TField>;
	/** Calls `callback` whenever `field`'s value changes. Returns an unsubscribe function. */
	watch(field: TField, callback: (value: string, values: FormValues<TField>) => void): () => void;
}

/** Handle returned by `createForm`. Calling it directly unsubscribes. */
export interface FormHandle<TValues extends Record<string, unknown>, TField extends string> {
	(): void;
	/** Reads the current, typed values of all schema fields from the form. */
	getValues(): TValues;
	/** Writes a value into the form field with the given name (serialized via `FieldSchema.serialize` if set). */
	setValue<K extends TField>(field: K, value: TValues[K]): void;
	/** Shows (or, if `message` is undefined, hides) the error for `[data-error-for="<field>"]`. */
	setError(field: TField, message: string | undefined): void;
	/** Sets (or, if `message` is undefined, clears) the form-level error (see REQ-009). */
	setFormError(message: string | undefined): void;
	/** Resets the form, clears all displayed errors and recaptures dirty/touched state. */
	reset(): void;
	/** Returns a snapshot of the current form state (values/errors/formError/touched/dirty/isSubmitting). */
	getState(): TypedFormState<TValues, TField>;
	/** Calls `callback` whenever `field`'s value changes. Returns an unsubscribe function. */
	watch<K extends TField>(field: K, callback: (value: TValues[K], values: TValues) => void): () => void;
}
