/** Validation rule for a single form field. */
export interface FieldRule {
	/** Error message shown if the field is empty after trim(). */
	required?: string;
	/** Regex and error message checked only when the field is non-empty. */
	pattern?: { value: RegExp; message: string };
}

/** Form values: field name -> string value taken from FormData. */
export type FormValues<TField extends string> = Record<TField, string>;

export interface BindFormOptions<TField extends string> {
	/** Validation schema: keys must match the `name` attributes of the form fields. */
	schema: Record<TField, FieldRule>;
	/** Element used to display the validation error message (must support `hidden`). */
	errorElement?: HTMLElement;
	/** Called with the validated values after a successful submit. */
	onSubmit: (values: FormValues<TField>, form: HTMLFormElement) => void | Promise<void>;
	/** Reset the form after a successful onSubmit. */
	resetOnSuccess?: boolean;
}

/**
 * Subscribes to a form's submit event: prevents the page reload, validates fields
 * against the schema (required/pattern) and calls onSubmit with the collected values.
 * Submitting via Enter works out of the box (default <form> behavior).
 * Returns an unsubscribe function.
 */
export function bindForm<TField extends string>(
	form: HTMLFormElement,
	options: BindFormOptions<TField>,
): () => void {
	const handleSubmit = (event: SubmitEvent): void => {
		event.preventDefault();

		const formData = new FormData(form);
		const values = {} as FormValues<TField>;
		let firstError: string | undefined;

		for (const field of Object.keys(options.schema) as TField[]) {
			const raw = String(formData.get(field) ?? "").trim();
			values[field] = raw;

			const rule = options.schema[field];
			if (!firstError && rule.required && !raw) {
				firstError = rule.required;
			} else if (!firstError && raw && rule.pattern && !rule.pattern.value.test(raw)) {
				firstError = rule.pattern.message;
			}
		}

		if (firstError) {
			showError(options.errorElement, firstError);
			return;
		}

		hideError(options.errorElement);
		void Promise.resolve(options.onSubmit(values, form)).then(() => {
			if (options.resetOnSuccess) form.reset();
		});
	};

	form.addEventListener("submit", handleSubmit);
	return () => form.removeEventListener("submit", handleSubmit);
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
