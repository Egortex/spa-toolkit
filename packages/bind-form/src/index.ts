/** Validation rule for a single form field. */
export interface FieldRule {
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
	/** Custom validator, run last. Return an error message, or undefined/empty string if valid. */
	validate?: (value: string) => string | undefined;
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

/**
 * Subscribes to a form's submit event: prevents the page reload, validates fields
 * against the schema (required/pattern/minLength/maxLength/min/max/validate, then
 * an optional `resolver`) and calls onSubmit with the collected values.
 * Submitting via Enter works out of the box (default <form> behavior).
 *
 * If `validateOn` is set, fields are additionally validated on "blur" or "input"
 * and per-field errors are shown in `[data-error-for="<field>"]` elements.
 *
 * While `onSubmit` is pending, `[type="submit"]` elements are disabled (unless
 * `disableSubmitWhilePending` is `false`) and `isSubmitting` is reported via `onStateChange`.
 *
 * Returns a handle: call it to unsubscribe, or use `getValues`/`setValue`/`setError`/
 * `reset`/`getState`/`watch`.
 */
export function bindForm<TField extends string>(
	form: HTMLFormElement,
	options: BindFormOptions<TField>,
): BindFormHandle<TField> {
	const fields = Object.keys(options.schema) as TField[];

	const errors = {} as FormErrors<TField>;
	const touched = {} as Record<TField, boolean>;
	let initialValues = {} as FormValues<TField>;
	let isSubmitting = false;

	const validateField = (field: TField, raw: string): string | undefined => {
		const rule = options.schema[field];

		if (rule.required && !raw) return rule.required;
		if (!raw) return undefined;

		if (rule.pattern && !rule.pattern.value.test(raw)) return rule.pattern.message;
		if (rule.minLength && raw.length < rule.minLength.value) return rule.minLength.message;
		if (rule.maxLength && raw.length > rule.maxLength.value) return rule.maxLength.message;

		if (rule.min || rule.max) {
			const num = Number(raw);
			if (!Number.isNaN(num)) {
				if (rule.min && num < rule.min.value) return rule.min.message;
				if (rule.max && num > rule.max.value) return rule.max.message;
			}
		}

		return rule.validate?.(raw) || undefined;
	};

	const getFieldErrorElement = (field: TField): HTMLElement | null =>
		form.querySelector(`[data-error-for="${field}"]`);

	const setFieldError = (field: TField, message: string | undefined): void => {
		errors[field] = message;

		const errorElement = getFieldErrorElement(field);
		if (!errorElement) return;

		if (message) {
			errorElement.textContent = message;
			errorElement.removeAttribute("hidden");
		} else {
			errorElement.setAttribute("hidden", "");
		}
	};

	const getRawValue = (field: TField): string => String(new FormData(form).get(field) ?? "").trim();

	const getAllValues = (): FormValues<TField> => {
		const values = {} as FormValues<TField>;
		for (const field of fields) values[field] = getRawValue(field);
		return values;
	};

	const captureInitialValues = (): void => {
		initialValues = getAllValues();
	};
	captureInitialValues();

	const getDirty = (): Record<TField, boolean> => {
		const dirty = {} as Record<TField, boolean>;
		for (const field of fields) dirty[field] = getRawValue(field) !== initialValues[field];
		return dirty;
	};

	const emitState = (): void => {
		if (!options.onStateChange) return;

		const dirty = getDirty();
		options.onStateChange({
			values: getAllValues(),
			errors: { ...errors },
			touched: { ...touched },
			dirty,
			isDirty: fields.some((field) => dirty[field]),
			isSubmitting,
		});
	};

	const setSubmitButtonsDisabled = (disabled: boolean): void => {
		const buttons = form.querySelectorAll<HTMLButtonElement | HTMLInputElement>('[type="submit"]');
		for (const button of buttons) button.disabled = disabled;
	};

	const validateAll = async (): Promise<{ values: FormValues<TField>; firstError?: string }> => {
		const values = getAllValues();
		const fieldErrors = {} as FormErrors<TField>;

		for (const field of fields) {
			fieldErrors[field] = validateField(field, values[field]);
		}

		if (options.resolver) {
			const resolverErrors = await options.resolver(values);
			for (const field of fields) {
				if (!fieldErrors[field] && resolverErrors[field]) fieldErrors[field] = resolverErrors[field];
			}
		}

		let firstError: string | undefined;
		for (const field of fields) {
			setFieldError(field, fieldErrors[field]);
			if (!firstError && fieldErrors[field]) firstError = fieldErrors[field];
		}

		return { values, firstError };
	};

	const clearAllErrors = (): void => {
		for (const field of fields) setFieldError(field, undefined);
		hideError(options.errorElement);
	};

	const handleSubmit = (event: SubmitEvent): void => {
		event.preventDefault();

		void (async () => {
			const { values, firstError } = await validateAll();
			emitState();

			if (firstError) {
				showError(options.errorElement, firstError);
				return;
			}

			hideError(options.errorElement);

			isSubmitting = true;
			if (options.disableSubmitWhilePending !== false) setSubmitButtonsDisabled(true);
			emitState();

			try {
				await options.onSubmit(values, form);
				if (options.resetOnSuccess) {
					form.reset();
					clearAllErrors();
					for (const field of fields) touched[field] = false;
					captureInitialValues();
				}
			} finally {
				isSubmitting = false;
				if (options.disableSubmitWhilePending !== false) setSubmitButtonsDisabled(false);
				emitState();
			}
		})();
	};

	const handleFieldEvent = (event: Event): void => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		const name = target.getAttribute("name") as TField | null;
		if (!name || !(fields as string[]).includes(name)) return;

		touched[name] = true;
		setFieldError(name, validateField(name, getRawValue(name)));
		emitState();
	};

	form.addEventListener("submit", handleSubmit);
	if (options.validateOn) {
		form.addEventListener(options.validateOn, handleFieldEvent, true);
	}

	const handle = (() => {
		form.removeEventListener("submit", handleSubmit);
		if (options.validateOn) {
			form.removeEventListener(options.validateOn, handleFieldEvent, true);
		}
	}) as BindFormHandle<TField>;

	handle.getValues = getAllValues;

	handle.setValue = (field, value) => {
		const element = form.elements.namedItem(field);
		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
			element.value = value;
		}
		emitState();
	};

	handle.setError = (field, message) => {
		setFieldError(field, message);
		emitState();
	};

	handle.reset = () => {
		form.reset();
		clearAllErrors();
		for (const field of fields) touched[field] = false;
		captureInitialValues();
		emitState();
	};

	handle.getState = () => {
		const dirty = getDirty();
		return {
			values: getAllValues(),
			errors: { ...errors },
			touched: { ...touched },
			dirty,
			isDirty: fields.some((field) => dirty[field]),
			isSubmitting,
		};
	};

	handle.watch = (field, callback) => {
		const listener = (event: Event): void => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			if (target.getAttribute("name") !== field) return;
			callback(getRawValue(field), getAllValues());
		};

		form.addEventListener("input", listener);
		return () => form.removeEventListener("input", listener);
	};

	return handle;
}

function showError(errorElement: HTMLElement | undefined, message: string): void {
	if (!errorElement) return;
	errorElement.textContent = message;
	errorElement.removeAttribute("hidden");
}

function hideError(errorElement: HTMLElement | undefined): void {
	if (!errorElement) return;
	errorElement.setAttribute("hidden", "");
}
