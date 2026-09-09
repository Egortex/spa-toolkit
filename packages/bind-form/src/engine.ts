import type { FieldSchema, TypedFormState } from "./types";
import { runFieldPipeline, runFormPipeline } from "./validation";
import { applyFieldAccessibility, ensureErrorElementA11y, focusFirstInvalidField, warnIfLabelMissing } from "./accessibility";

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const isFieldElement = (element: Element | RadioNodeList | null): element is FieldElement =>
	element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;

/** One schema field as seen by the engine: its name and its typed validation/parsing schema. */
export interface EngineField<TField extends string> {
	name: TField;
	schema: FieldSchema<any>;
}

export interface EngineOptions<TValues extends Record<string, unknown>, TField extends string> {
	fields: EngineField<TField>[];
	errorElement?: HTMLElement;
	validateOn?: "blur" | "input";
	resolver?: (values: TValues) => Partial<Record<TField, string>> | Promise<Partial<Record<TField, string>>>;
	onStateChange?: (state: TypedFormState<TValues, TField>) => void;
	disableSubmitWhilePending?: boolean;
	onSubmit: (values: TValues, form: HTMLFormElement) => void | Promise<void>;
	resetOnSuccess?: boolean;
	/**
	 * Called when `onSubmit` throws/rejects. Return mapped errors to display them as the "server"
	 * pipeline stage (REQ-004); return `undefined` to let the error propagate (e.g. unhandled
	 * rejection), matching the behavior of the legacy `bindForm` (which has no such hook).
	 */
	mapSubmitError?: (error: unknown) => { fieldErrors: Partial<Record<TField, string>>; formError?: string } | undefined;
	/** Skip the dev-only missing-`<label>` warning (used internally by tests). */
	skipLabelWarning?: boolean;
}

/** Handle shared by `bindForm` and `createForm`; each wraps it with its own public, typed surface. */
export interface EngineHandle<TValues extends Record<string, unknown>, TField extends string> {
	(): void;
	getValues(): TValues;
	setValue(field: TField, raw: string): void;
	setError(field: TField, message: string | undefined): void;
	setFormError(message: string | undefined): void;
	reset(): void;
	getState(): TypedFormState<TValues, TField>;
	watch(field: TField, callback: (value: unknown, values: TValues) => void): () => void;
}

/**
 * Shared internal engine behind both `bindForm` and `createForm`: subscribes to `submit` (and
 * optionally `blur`/`input`), runs the `sync -> async(per field) -> resolver(form-level) -> server`
 * validation pipeline, applies accessibility attributes (REQ-010/011) and focus management
 * (REQ-012/013) to every bound field, and reports state via `onStateChange`.
 */
export function createEngine<TValues extends Record<string, unknown>, TField extends string>(
	form: HTMLFormElement,
	options: EngineOptions<TValues, TField>,
): EngineHandle<TValues, TField> {
	const fields = options.fields.map((f) => f.name);
	const schemaByField = new Map<TField, FieldSchema<any>>(options.fields.map((f) => [f.name, f.schema]));
	const getSchema = (field: TField): FieldSchema<any> => schemaByField.get(field)!;

	const errors = {} as Partial<Record<TField, string>>;
	let formError: string | undefined;
	const touched = {} as Record<TField, boolean>;
	let initialValues = {} as TValues;
	let isSubmitting = false;

	const getRaw = (field: TField): string => String(new FormData(form).get(field) ?? "").trim();
	const getRawAll = (field: TField): string[] => new FormData(form).getAll(field).map((v) => String(v));

	/** Raw string used for the built-in sync rules (multiselect: non-empty marker of the selection). */
	const getSyncRaw = (field: TField): string => {
		const schema = getSchema(field);
		if (schema.type === "multiselect") {
			const all = getRawAll(field);
			return all.length > 0 ? all.join(",") : "";
		}
		return getRaw(field);
	};

	const getCoercionError = (field: TField): string | undefined => {
		const schema = getSchema(field);
		const raw = getSyncRaw(field);
		if (schema.type === "number" && raw !== "" && Number.isNaN(Number(raw))) return "Invalid number value";
		return undefined;
	};

	const getFieldValue = (field: TField): unknown => {
		const schema = getSchema(field);
		const raw = getRaw(field);

		if (schema.type === "multiselect") return getRawAll(field);
		if (schema.parse) return schema.parse(raw);

		switch (schema.type) {
			case "number": {
				if (raw === "") return undefined;
				const num = Number(raw);
				return Number.isNaN(num) ? undefined : num;
			}
			case "checkbox":
				return raw !== "";
			default:
				return raw;
		}
	};

	const getAllValues = (): TValues => {
		const values = {} as Record<string, unknown>;
		for (const field of fields) values[field] = getFieldValue(field);
		return values as TValues;
	};

	const captureInitialValues = (): void => {
		initialValues = getAllValues();
	};
	captureInitialValues();

	const getDirty = (): Record<TField, boolean> => {
		const dirty = {} as Record<TField, boolean>;
		for (const field of fields) dirty[field] = getRaw(field) !== serializeInitial(field);
		return dirty;
	};

	const serializeInitial = (field: TField): string => serializeFieldValue(getSchema(field), (initialValues as Record<string, unknown>)[field]);

	const getFieldErrorElement = (field: TField): HTMLElement | null => form.querySelector(`[data-error-for="${field}"]`);

	const applyAccessibility = (field: TField): void => {
		const element = form.elements.namedItem(field);
		if (!isFieldElement(element)) return;
		applyFieldAccessibility(element, field, getFieldErrorElement(field), Boolean(errors[field]));
	};

	const setFieldError = (field: TField, message: string | undefined): void => {
		errors[field] = message;

		const errorElement = getFieldErrorElement(field);
		if (errorElement) {
			if (message) {
				errorElement.textContent = message;
				errorElement.removeAttribute("hidden");
			} else {
				errorElement.setAttribute("hidden", "");
			}
		}

		applyAccessibility(field);
	};

	const setFormErrorInternal = (message: string | undefined): void => {
		formError = message;
		showError(options.errorElement, message);
	};

	const emitState = (): void => {
		if (!options.onStateChange) return;

		const dirty = getDirty();
		options.onStateChange({
			values: getAllValues(),
			errors: { ...errors },
			formError,
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

	const validateAll = async (): Promise<{ values: TValues; firstError?: string; hasError: boolean }> => {
		const values = getAllValues();
		const rawValues = values as unknown as Record<string, unknown>;

		const fieldErrors = await runFormPipeline(
			fields,
			getSchema,
			getSyncRaw,
			getFieldValue,
			rawValues,
			getCoercionError,
		);

		if (options.resolver) {
			const resolverErrors = await options.resolver(values);
			for (const field of fields) {
				if (!fieldErrors[field] && resolverErrors[field]) fieldErrors[field] = resolverErrors[field];
			}
		}

		let firstError: string | undefined;
		let hasError = false;
		for (const field of fields) {
			setFieldError(field, fieldErrors[field]);
			if (fieldErrors[field]) {
				hasError = true;
				if (!firstError) firstError = fieldErrors[field];
			}
		}

		return { values, firstError, hasError };
	};

	const showFieldValidationSummary = (firstError: string | undefined): void => {
		// Mirrors the original bindForm behavior: `errorElement` shows the first field error
		// message (not just true "form-level" errors, see REQ-009 for those from the server stage).
		showError(options.errorElement, firstError);
	};

	const clearAllErrors = (): void => {
		for (const field of fields) setFieldError(field, undefined);
		setFormErrorInternal(undefined);
	};

	const handleSubmit = (event: SubmitEvent): void => {
		event.preventDefault();

		void (async () => {
			formError = undefined;
			const { values, firstError, hasError } = await validateAll();
			emitState();

			if (hasError) {
				showFieldValidationSummary(firstError);
				focusFirstInvalidField(form, errors as Record<string, string | undefined>);
				return;
			}

			showFieldValidationSummary(undefined);

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
			} catch (error) {
				const mapped = options.mapSubmitError?.(error);
				if (!mapped) throw error;

				for (const field of fields) setFieldError(field, mapped.fieldErrors[field]);
				setFormErrorInternal(mapped.formError);
				focusFirstInvalidField(form, errors as Record<string, string | undefined>);
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

		void (async () => {
			const schema = getSchema(name);
			const raw = getSyncRaw(name);
			const value = getFieldValue(name);
			const error = await runFieldPipeline(schema, raw, value, getAllValues() as Record<string, unknown>, getCoercionError(name));
			setFieldError(name, error);
			emitState();
		})();
	};

	form.addEventListener("submit", handleSubmit);
	if (options.validateOn) {
		form.addEventListener(options.validateOn, handleFieldEvent, true);
	}

	for (const field of fields) {
		applyAccessibility(field);
		const errorElement = getFieldErrorElement(field);
		if (errorElement) ensureErrorElementA11y(errorElement);
		if (!options.skipLabelWarning) warnIfLabelMissing(form, field);
	}

	const handle = (() => {
		form.removeEventListener("submit", handleSubmit);
		if (options.validateOn) {
			form.removeEventListener(options.validateOn, handleFieldEvent, true);
		}
	}) as EngineHandle<TValues, TField>;

	handle.getValues = getAllValues;

	handle.setValue = (field, raw) => {
		const element = form.elements.namedItem(field);
		if (isFieldElement(element)) element.value = raw;
		applyAccessibility(field);
		emitState();
	};

	handle.setError = (field, message) => {
		setFieldError(field, message);
		emitState();
	};

	handle.setFormError = (message) => {
		setFormErrorInternal(message);
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
			formError,
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
			callback(getFieldValue(field), getAllValues());
		};

		form.addEventListener("input", listener);
		return () => form.removeEventListener("input", listener);
	};

	return handle;
}

function showError(errorElement: HTMLElement | undefined, message: string | undefined): void {
	if (!errorElement) return;
	if (message) {
		errorElement.textContent = message;
		errorElement.removeAttribute("hidden");
	} else {
		errorElement.setAttribute("hidden", "");
	}
}

/** Converts a typed field value back into the raw string a DOM field element expects, using `FieldSchema.serialize`/`type`. */
export function serializeFieldValue(schema: FieldSchema<any>, value: unknown): string {
	if (schema.serialize) return schema.serialize(value);
	if (schema.type === "number") return value === undefined || value === null ? "" : String(value);
	if (schema.type === "checkbox") return value ? "on" : "";
	if (schema.type === "multiselect") return Array.isArray(value) ? value.join(",") : "";
	return typeof value === "string" ? value : String(value ?? "");
}
