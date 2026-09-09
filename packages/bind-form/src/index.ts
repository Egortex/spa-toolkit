import type { BindFormHandle, BindFormOptions, FormValues } from "./types";
import { createEngine } from "./engine";

export type {
	FieldRule,
	FieldSchema,
	FieldType,
	SyncFieldRules,
	FormValues,
	FormErrors,
	ValidateTrigger,
	FormState,
	TypedFormState,
	InferValues,
	InferErrors,
	BindFormOptions,
	BindFormHandle,
	FormHandle,
} from "./types";

export type { EngineField, EngineHandle, EngineOptions } from "./engine";
export { createEngine, serializeFieldValue } from "./engine";

export { runSyncRules, runFieldPipeline, runFormPipeline } from "./validation";

export type { ServerError, ServerErrorResponse, MappedServerErrors } from "./serverErrors";
export { FormSubmitError, mapServerErrors } from "./serverErrors";

export {
	applyFieldAccessibility,
	ensureErrorElementA11y,
	focusFirstInvalidField,
	warnIfLabelMissing,
} from "./accessibility";

export type { CreateFormOptions } from "./createForm";
export { createForm } from "./createForm";

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
 * Every bound field automatically gets accessibility wiring (aria-invalid,
 * aria-describedby pointing at its `[data-error-for]` element, role="alert" on that
 * element) and, on a failed submit, focus moves to the first invalid field in DOM
 * order (see `createForm`'s Accessibility section in the README for details).
 *
 * Returns a handle: call it to unsubscribe, or use `getValues`/`setValue`/`setError`/
 * `reset`/`getState`/`watch`.
 *
 * @deprecated Prefer `createForm`, which additionally infers typed `values`/`errors`
 * from the schema and supports non-string field values, async per-field validation and
 * automatic server error mapping. `bindForm` is not going away and keeps working as-is.
 */
export function bindForm<TField extends string>(
	form: HTMLFormElement,
	options: BindFormOptions<TField>,
): BindFormHandle<TField> {
	const fields = Object.keys(options.schema) as TField[];

	const engine = createEngine<FormValues<TField>, TField>(form, {
		fields: fields.map((name) => ({ name, schema: options.schema[name] })),
		errorElement: options.errorElement,
		validateOn: options.validateOn,
		resolver: options.resolver,
		onStateChange: options.onStateChange,
		disableSubmitWhilePending: options.disableSubmitWhilePending,
		onSubmit: options.onSubmit,
		resetOnSuccess: options.resetOnSuccess,
	});

	const handle = (() => engine()) as BindFormHandle<TField>;

	handle.getValues = () => engine.getValues();
	handle.setValue = (field, value) => engine.setValue(field, value);
	handle.setError = (field, message) => engine.setError(field, message);
	handle.reset = () => engine.reset();
	handle.getState = () => engine.getState();
	handle.watch = (field, callback) => engine.watch(field, (value, values) => callback(value as string, values));

	return handle;
}
