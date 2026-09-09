# bind-form

![coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Egortex/spa-toolkit/main/packages/bind-form/coverage-badge.json) ![size](https://img.shields.io/bundlephobia/minzip/@chepchik/bind-form)

Что: dependency-free typed form engine поверх настоящего `<form>`/`FormData`.
Два входа в один и тот же движок:

- `createForm({ schema, initialValues })` — `form.values`/`form.errors`
  выводятся из `schema` типами (без ручного `TField`), значения полей могут
  быть не только `string` (`number`/`boolean`/`string[]`), валидация идёт по
  пайплайну `sync → async(на поле) → resolver(на форму) → server`, а сервер
  ошибки `{ field, code }[]` автоматически маппятся в `form.errors`/`form.formError`.
- `bindForm(form, options)` — прежний API (submit handling, `schema`,
  `resolver`, `validateOn`, `onStateChange`, `watch`...), работает без
  изменений сигнатуры и построен поверх того же движка.

Оба API автоматически проставляют accessibility-атрибуты (`aria-invalid`,
`aria-describedby`, `role="alert"`) и переносят фокус на первое невалидное
поле после неуспешного submit — это не опция, а поведение "из коробки"
(см. раздел [Accessibility](#accessibility)).

Зачем: чтобы не дублировать в каждой форме одинаковый код —
`preventDefault`, сбор `FormData`, проверку полей, показ/скрытие ошибок,
доступность и фокус-менеджмент. Отправка по Enter работает "из коробки",
т.к. используется стандартное поведение `<form>`.

## Установка

```sh
npm install @chepchik/bind-form
```

## Typed forms

```ts
import { createForm } from "@chepchik/bind-form";

const form = document.querySelector("form")!;

const handle = createForm(form, {
	schema: {
		name: { required: "Введите имя" },
		age: { type: "number", min: { value: 18, message: "Минимум 18" } },
		agree: { type: "checkbox", required: "Нужно согласие" },
	},
	initialValues: { age: 18 },
	onSubmit: async (values) => {
		// values.name: string, values.age: number, values.agree: boolean —
		// выведено из schema, без ручного указания generic-параметра.
		await api.register(values);
	},
});

handle.getValues().age; // number
handle.setValue("age", 21); // типизировано по конкретному полю

// позже, при размонтировании:
handle();
```

`FieldSchema.type` определяет, как строковое значение `FormData` приводится
к типу `form.values[field]`:

- `"text"` (по умолчанию) → `string`
- `"number"` → `number` (непарсибельное значение — ошибка валидации, а не `NaN`)
- `"checkbox"` → `boolean`
- `"multiselect"` → `string[]` (все значения `name`, например группа чекбоксов)

Свой парсинг/сериализация — через `parse`/`serialize` в `FieldSchema` вместо `type`.

## Validation pipeline

```
submit
  │
  ▼
sync (required/pattern/minLength/maxLength/min/max)  — на каждое поле
  │  ошибка → стоп для этого поля, async не запускается (REQ-006)
  ▼
async (per field, например uniqueness-проверка)
  │
  ▼
resolver (form-level, только для полей без ошибок sync/async)
  │
  ▼
onSubmit(values) — если ошибок нет
  │  бросает FormSubmitError → server-стадия
  ▼
server errors → form.errors / form.formError
```

```ts
const handle = createForm(form, {
	schema: {
		email: {
			required: "Введите email",
			pattern: { value: /.+@.+/, message: "Неверный формат" },
			// async выполняется, только если email прошёл sync-проверки выше.
			async: async (value) => ((await api.isEmailTaken(value)) ? "Email уже занят" : undefined),
		},
	},
	onSubmit: async (values) => api.register(values),
});
```

Если поле не прошло sync-стадию, его `async`-правило не вызывается вообще —
это можно проверить шпионом/счётчиком вызовов (см. `tests/validation.test.ts`).

## Server errors

```ts
import { createForm, FormSubmitError } from "@chepchik/bind-form";

const handle = createForm(form, {
	schema: { email: {} },
	errorMessages: { EMAIL_EXISTS: "Такой email уже зарегистрирован" },
	onSubmit: async (values) => {
		const res = await fetch("/api/register", { method: "POST", body: JSON.stringify(values) });
		if (res.status === 422) {
			throw new FormSubmitError(await res.json()); // [{ field: "email", code: "EMAIL_EXISTS" }]
		}
	},
});
```

- `code` резолвится через `errorMessages`, при отсутствии — фолбэк на `message`,
  затем на сырой `code`, затем на общий fallback-текст.
- Ошибка с `field`, которого нет в `schema` (или без `field` вообще), попадает
  в `handle.getState().formError`, а не теряется и не бросает исключение.

## Accessibility

Применяется автоматически и к `createForm`, и к `bindForm` — не требует
настройки со стороны потребителя:

```html
<input name="email" aria-invalid="true" aria-describedby="email-error" />
<span data-error-for="email" id="email-error" role="alert" aria-live="polite">
	Неверный формат
</span>
```

- `aria-invalid="true"` появляется на поле при ошибке и снимается, когда её нет.
- `[data-error-for="<field>"]` получает `role="alert"`, стабильный `id`
  (генерируется как `${field}-error`, если отсутствует), и этот `id`
  прописывается в `aria-describedby` поля.
- После неуспешного submit фокус переходит на первое невалидное поле в
  DOM-порядке (`form.elements`, а не порядок ключей `schema`) — обычная
  Tab/Shift+Tab навигация после этого не нарушается (никакого focus trap).
- В dev-режиме (`process.env.NODE_ENV !== "production"`) в консоль выводится
  предупреждение, если у поля схемы нет связанного `<label>` (`for`/wrapping
  `<label>`/`aria-label`/`aria-labelledby`). Проверка не попадает в
  production-сборку по стоимости выполнения — только вызов вырезается вручную
  через `NODE_ENV`, поэтому убедитесь, что ваш бандлер минифицирует `if (false)`.

## Migrating from `bindForm` to `createForm`

`bindForm` продолжает работать без изменений — мигрировать не обязательно.

| `bindForm` | `createForm` |
|---|---|
| `schema: Record<TField, FieldRule>` | `schema: Record<TField, FieldSchema<TValue>>` (+ `type`/`parse`/`serialize`/`async`) |
| `values: FormValues<TField>` (всегда `string`) | `values: InferValues<TSchema>` (типы из схемы) |
| нет серверных ошибок | `errorMessages` + `FormSubmitError` → `form.errors`/`form.formError` |
| `resolver` — form-level async | тот же `resolver`, плюс per-field `async` в схеме |
| нет accessibility-контракта | `aria-*`/`role="alert"`/focus management — из коробки (и для `bindForm` тоже) |

## Testing

```sh
pnpm test            # tsc --noEmit && vitest run
pnpm test:coverage   # то же самое + отчёт покрытия, порог 100% по lines/branches/functions/statements
```

Любой вклад в пакет должен сохранять 100% покрытие (`vitest.config.ts`,
`coverage.thresholds`) — `vitest run --coverage` завершается с ненулевым
кодом, если покрытие `src/**/*.ts` падает ниже 100% хотя бы по одной метрике.

## Пример использования `bindForm`

```ts
import { bindForm } from "@chepchik/bind-form";

const form = document.querySelector("form")!;
const errorElement = document.querySelector("#error")!;

const formHandle = bindForm(form, {
	schema: {
		email: { required: "Введите email", pattern: { value: /.+@.+/, message: "Неверный email" } },
		password: {
			required: "Введите пароль",
			minLength: { value: 6, message: "Минимум 6 символов" },
		},
	},
	errorElement,
	validateOn: "blur",
	resetOnSuccess: true,
	onSubmit: async (values, form) => {
		await api.login(values.email, values.password);
	},
});

// позже, при размонтировании:
formHandle();
```

Для показа ошибки конкретного поля при `validateOn` добавьте рядом с полем
элемент `[data-error-for="<name>"]` (`<span data-error-for="email" hidden></span>`).

## Пример: сложная форма (`bindForm`)

Более развёрнутый пример, использующий все возможности: `resolver` для
асинхронной проверки, `onStateChange` для индикации состояния, `watch` для
живого фидбека по отдельному полю и блокировку кнопки на время отправки.
Рабочая версия — страница `/form-demo` в `OOP_taskList`
(`app/pages/form-demo/index.page.ts`).

```ts
import { bindForm, type FormErrors } from "@chepchik/bind-form";

type Field = "username" | "password" | "bio";

const submitButton = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
const bioCount = document.querySelector("#bio-count")!;
const passwordStrength = document.querySelector("#password-strength")!;

const handle = bindForm<Field>(form, {
	schema: {
		username: {
			required: "Введите имя пользователя",
			minLength: { value: 3, message: "Минимум 3 символа" },
		},
		password: {
			required: "Введите пароль",
			minLength: { value: 6, message: "Минимум 6 символов" },
			validate: (value) => (/\d/.test(value) ? undefined : "Пароль должен содержать цифру"),
		},
		bio: {
			maxLength: { value: 200, message: "Максимум 200 символов" },
		},
	},
	validateOn: "input",
	// Асинхронная проверка, выполняется на submit после правил schema.
	resolver: async (values): Promise<FormErrors<Field>> => {
		const taken = await api.isUsernameTaken(values.username);
		return taken ? { username: "Это имя уже занято" } : {};
	},
	// Отслеживание состояния формы.
	onStateChange: (state) => {
		submitButton.textContent = state.isSubmitting ? "Отправка..." : "Зарегистрироваться";
	},
	onSubmit: async (values) => {
		await api.register(values);
	},
	resetOnSuccess: true,
});

// Живой фидбек по отдельным полям.
handle.watch("bio", (value) => {
	bioCount.textContent = `${value.length}/200`;
});
handle.watch("password", (value) => {
	passwordStrength.textContent = value.length >= 10 ? "сильный" : "слабый";
});

// Программное управление формой.
fillExampleButton.addEventListener("click", () => {
	handle.setValue("username", "ivan_petrov");
	handle.setValue("password", "secret123");
});
resetButton.addEventListener("click", () => handle.reset());
```

## API

### `createForm<TSchema>(form, options): FormHandle<InferValues<TSchema>, keyof TSchema & string>`

- `options.schema: Record<TField, FieldSchema<TValue>>` — валидация + типизация.
  - Наследует `required`/`pattern`/`minLength`/`maxLength`/`min`/`max` из `FieldRule`.
  - `type?: "text" | "number" | "checkbox" | "multiselect"` — как приводится значение.
  - `parse?`/`serialize?` — свой парсинг/сериализация вместо `type`.
  - `validate?: (value: TValue, values) => string | undefined` — sync, после built-in правил.
  - `async?: (value: TValue, values) => string | undefined | Promise<...>` — только если sync прошёл (REQ-006).
- `options.initialValues?: Partial<InferValues<TSchema>>` — записываются в поля формы при вызове `createForm`.
- `options.errorElement?`, `options.validateOn?`, `options.resolver?`,
  `options.onStateChange?`, `options.disableSubmitWhilePending?`,
  `options.resetOnSuccess?` — как в `bindForm`, но типизированы по `TSchema`.
- `options.onSubmit(values, form)` — может бросить/вернуть `FormSubmitError`
  для server-стадии пайплайна.
- `options.errorMessages?: Record<string, string>` — словарь `code → message`
  для `mapServerErrors`.

Возвращает `FormHandle`: `getValues()`, `setValue(field, value)`,
`setError(field, message?)`, `setFormError(message?)`, `reset()`,
`getState()`, `watch(field, callback)` — все типизированы по `TSchema`.

### `bindForm<TField>(form, options): BindFormHandle<TField>`

- `form: HTMLFormElement` — форма, на которую вешается обработчик `submit`.
- `options.schema: Record<TField, FieldRule>` — схема валидации, ключи
  должны совпадать с атрибутами `name` полей формы.
  - `required?: string` — текст ошибки, если поле пустое после `trim()`.
  - `pattern?: { value: RegExp; message: string }` — проверяется только
    если поле непустое.
  - `minLength?: { value: number; message: string }` / `maxLength?: { ... }` —
    длина строки после `trim()`.
  - `min?: { value: number; message: string }` / `max?: { ... }` — проверяются,
    только если значение поля парсится как число.
  - `validate?: (value: string) => string | undefined` — кастомная проверка,
    выполняется последней.
- `options.errorElement?: HTMLElement` — элемент для показа общей ошибки формы
  (должен поддерживать атрибут `hidden`).
- `options.validateOn?: "blur" | "input"` — дополнительно валидировать поле
  при потере фокуса/вводе и показывать ошибку в `[data-error-for="<field>"]`.
- `options.resolver?: (values) => FormErrors<TField> | Promise<FormErrors<TField>>` —
  доп. асинхронная/внешняя валидация (например, обёртка над zod/yup-схемой),
  выполняется на submit после проверок из `schema`. Для поля, у которого
  `schema` уже нашла ошибку, результат resolver'а игнорируется.
- `options.onStateChange?: (state: FormState<TField>) => void` — вызывается
  при изменении значений/ошибок/`touched`/`dirty`/`isSubmitting`.
- `options.disableSubmitWhilePending?: boolean` — отключать `[type="submit"]`
  на время выполнения `onSubmit`. По умолчанию `true`.
- `options.onSubmit(values, form)` — вызывается после успешной валидации.
- `options.resetOnSuccess?: boolean` — сбросить форму после успешного `onSubmit`.

### `FormState<TField>`

- `values: FormValues<TField>` — текущие значения.
- `errors: FormErrors<TField>` — текущие ошибки по полям.
- `touched: Record<TField, boolean>` — было ли поле в фокусе/изменено
  (`blur`/`input`) с момента привязки или последнего `reset()`.
- `dirty: Record<TField, boolean>` — отличается ли значение поля от значения
  на момент привязки/последнего `reset()`.
- `isDirty: boolean` — true, если хотя бы одно поле `dirty`.
- `isSubmitting: boolean` — true во время выполнения `onSubmit`.

### `BindFormHandle<TField>`

Сама функция — отписка от обработчиков (вызовите `formHandle()` при размонтировании).
Дополнительно доступны методы:

- `getValues(): FormValues<TField>` — текущие (обрезанные) значения полей.
- `setValue(field, value: string)` — записать значение в поле формы.
- `setError(field, message?: string)` — показать/скрыть ошибку поля
  (`[data-error-for="<field>"]`).
- `reset()` — сбросить форму, очистить все отображённые ошибки и пересчитать
  базовые значения для `dirty`/`touched`.
- `getState(): FormState<TField>` — снимок текущего состояния формы.
- `watch(field, callback)` — вызывать `callback(value, values)` при каждом
  изменении значения `field`. Возвращает функцию отписки.

### `mapServerErrors(response, knownFields, errorMessages?)`

Превращает `ServerErrorResponse` (`{ field?, code?, message? }[]`) в
`{ fieldErrors, formError }`. Используется автоматически внутри `createForm`
при `FormSubmitError`, но экспортируется и для ручного использования (в том
числе вместе с `bindForm`).
