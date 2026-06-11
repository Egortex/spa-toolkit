# bind-form

Что: один помощник `bindForm`, который вешает обработчик `submit` на форму,
валидирует поля по схеме (`required` / `pattern` / `minLength` / `maxLength` /
`min` / `max` / `validate`, опционально + `resolver`) и вызывает `onSubmit`
с собранными значениями, если всё валидно. Опционально умеет валидировать
поля "на лету" (`validateOn: "blur" | "input"`), показывать ошибку для
каждого поля отдельно, отслеживать `dirty`/`touched`/`isSubmitting`
(`onStateChange`, `getState`), реагировать на изменения отдельного поля
(`watch`) и блокировать кнопку отправки на время `onSubmit`.

Зачем: чтобы не дублировать в каждой форме одинаковый код —
`preventDefault`, сбор `FormData`, проверку полей и regex,
показ/скрытие текста ошибки. Отправка по Enter работает "из коробки",
т.к. используется стандартное поведение `<form>`.

## Установка

```sh
npm install @chepchik/bind-form
```

## Использование

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

## Пример: сложная форма

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
