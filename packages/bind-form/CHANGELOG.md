# @chepchik/bind-form

## Unreleased

### Added

- `createForm({ schema, initialValues })` — a typed form engine built on top of
  the same internal engine as `bindForm`. `form.values`/`form.errors` are
  inferred from `schema` (`InferValues`/`InferErrors`), without an explicit
  generic parameter.
- `FieldSchema<TValue>` — a superset of the existing `FieldRule`, adding
  `type: "text" | "number" | "checkbox" | "multiselect"` (or a custom
  `parse`/`serialize` pair) so field values can be `number`/`boolean`/`string[]`
  instead of always `string`.
- Unified `sync -> async(per field) -> resolver(form-level) -> server`
  validation pipeline (`validation.ts`): a field's `async` rule (e.g. a
  uniqueness check) only runs if its built-in sync rules and `validate` passed.
- `mapServerErrors`/`FormSubmitError`/`ServerError` (`serverErrors.ts`) —
  `onSubmit` can throw a `FormSubmitError` with a `{ field, code | message }[]`
  payload; `createForm` catches it and maps it into `form.errors`/`form.formError`
  automatically, resolving `code` through an optional `errorMessages` dictionary.
- Built-in accessibility (`accessibility.ts`): `aria-invalid` on every bound
  field, `aria-describedby` pointing at a stable, auto-generated id for its
  `[data-error-for]` element, `role="alert"`/`aria-live="polite"` on that
  element, and automatic focus on the first invalid field (in DOM order) after
  a failed submit. A dev-only `console.warn` flags fields with no associated
  `<label>`.
- `packages/bind-form/vitest.config.ts` and a `tests/` suite with a 100%
  line/branch/function/statement coverage threshold; `npm run test` /
  `npm run test:coverage` scripts.

### Changed

- **Behavioral change for `bindForm` (see RISK-003 in the implementation plan
  for context):** accessibility wiring (`aria-invalid`/`aria-describedby`/
  `role="alert"`) and automatic focus-on-failed-submit are now applied to
  `bindForm`-bound forms too, not just `createForm` (ASSUMPTION-001 — treated
  as approved: accessibility isn't a premium feature reserved for the new
  API). If you already manage `aria-*`/focus yourself for a `bindForm` form,
  this package now does some of that for you as well; the two should generally
  be compatible (only `aria-invalid`/the `aria-describedby` id for the error
  element are touched), but review your markup if you rely on exact
  `aria-describedby` contents.
- `bindForm` is now implemented on top of the same internal engine as
  `createForm` (`engine.ts`). Its public signature, `FieldRule`, `FormValues`,
  `FormErrors`, `FormState`, `BindFormOptions` and `BindFormHandle` are
  unchanged; it is marked `@deprecated` in favor of `createForm` (not removed).
- `description`/`keywords` in `package.json` updated to reflect the typed
  engine, validation pipeline and accessibility.

### Notes

- Package stays runtime dependency-free; `vitest`/`@vitest/coverage-v8`/`jsdom`
  are `devDependencies` only.
- Values are still always read from the real `<form>`/`FormData` at read time —
  `createForm`'s typed `number`/`boolean`/`string[]` values are a *view* over
  the DOM's string values (via `FieldSchema.type`/`parse`/`serialize`), not a
  separate state mirror (RISK-002).
