import { expectTypeOf } from "vitest";
import { createForm } from "../src/createForm";
import type { FieldSchema, InferErrors, InferValues } from "../src/types";

// REQ-001/REQ-002: `values`/`errors` are inferred from the schema without an explicit generic.
declare const handle: ReturnType<
	typeof createForm<{
		name: FieldSchema<string>;
		age: FieldSchema<number>;
		agree: FieldSchema<boolean>;
	}>
>;

expectTypeOf(handle.getValues()).toEqualTypeOf<{ name: string; age: number; agree: boolean }>();
expectTypeOf(handle.getState().errors).toEqualTypeOf<Partial<Record<"name" | "age" | "agree", string>>>();

// REQ-003: field values are not restricted to `string`.
type Schema = { name: FieldSchema<string>; age: FieldSchema<number>; tags: FieldSchema<string[]> };
expectTypeOf<InferValues<Schema>>().toEqualTypeOf<{ name: string; age: number; tags: string[] }>();
expectTypeOf<InferErrors<Schema>>().toEqualTypeOf<Partial<Record<"name" | "age" | "tags", string>>>();

// setValue/watch are typed per-field, not just `string`.
handle.setValue("age", 42);
handle.watch("age", (value) => expectTypeOf(value).toBeNumber());
// @ts-expect-error age is a number, not a string
handle.setValue("age", "42");
// @ts-expect-error unknown field
handle.setValue("unknown", "x");
