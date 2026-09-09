import type { FieldSchema, SyncFieldRules } from "./types";

/**
 * Runs the built-in synchronous rules (`required`/`pattern`/`minLength`/`maxLength`/`min`/`max`)
 * against a field's raw (trimmed) string value. Used as stage 1 of the field pipeline
 * (`sync -> async -> server`, see `runFieldPipeline`).
 */
export function runSyncRules(rule: SyncFieldRules, raw: string): string | undefined {
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

	return undefined;
}

/**
 * Runs the full per-field pipeline: built-in sync rules -> `schema.validate` (sync) -> `schema.async`.
 * As soon as a sync stage produces an error, later stages are skipped and that error is returned
 * (REQ-006): the `async` rule never runs for a field that already failed sync validation.
 */
export async function runFieldPipeline<TValue>(
	schema: FieldSchema<TValue>,
	raw: string,
	value: TValue,
	values: Record<string, unknown>,
	/** Error from converting `raw` into `TValue` (e.g. an unparsable number), checked right after the sync rules. */
	coercionError?: string,
): Promise<string | undefined> {
	const syncError = runSyncRules(schema, raw);
	if (syncError) return syncError;
	if (coercionError) return coercionError;

	const validateError = schema.validate?.(value, values) || undefined;
	if (validateError) return validateError;

	if (!schema.async) return undefined;
	return (await schema.async(value, values)) || undefined;
}

/**
 * Runs `runFieldPipeline` for every field in parallel and collects the resulting errors,
 * keyed by field name (stage 2 of `sync -> async(per field) -> resolver(form-level) -> server`).
 */
export async function runFormPipeline<TField extends string>(
	fields: TField[],
	getSchema: (field: TField) => FieldSchema<any>,
	getRaw: (field: TField) => string,
	getValue: (field: TField) => unknown,
	values: Record<string, unknown>,
	getCoercionError?: (field: TField) => string | undefined,
): Promise<Partial<Record<TField, string>>> {
	const entries = await Promise.all(
		fields.map(async (field) => {
			const error = await runFieldPipeline(
				getSchema(field),
				getRaw(field),
				getValue(field),
				values,
				getCoercionError?.(field),
			);
			return [field, error] as const;
		}),
	);

	const errors = {} as Partial<Record<TField, string>>;
	for (const [field, error] of entries) {
		if (error) errors[field] = error;
	}
	return errors;
}
