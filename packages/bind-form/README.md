# bind-form

Что: один помощник `bindForm`, который вешает обработчик `submit` на форму,
валидирует поля по простой схеме (`required` / `pattern`) и вызывает
`onSubmit` с собранными значениями, если всё валидно.

Зачем: чтобы не дублировать в каждой форме одинаковый код —
`preventDefault`, сбор `FormData`, проверку обязательных полей и regex,
показ/скрытие текста ошибки. Отправка по Enter работает "из коробки",
т.к. используется стандартное поведение `<form>`.

## Установка

```sh
npm install bind-form
```

## Использование

```ts
import { bindForm } from "bind-form";

const form = document.querySelector("form")!;
const errorElement = document.querySelector("#error")!;

const unsubscribe = bindForm(form, {
	schema: {
		email: { required: "Введите email", pattern: { value: /.+@.+/, message: "Неверный email" } },
		password: { required: "Введите пароль" },
	},
	errorElement,
	resetOnSuccess: true,
	onSubmit: async (values, form) => {
		await api.login(values.email, values.password);
	},
});

// позже, при размонтировании:
unsubscribe();
```

## API

### `bindForm<TField>(form, options): () => void`

- `form: HTMLFormElement` — форма, на которую вешается обработчик `submit`.
- `options.schema: Record<TField, FieldRule>` — схема валидации, ключи
  должны совпадать с атрибутами `name` полей формы.
  - `required?: string` — текст ошибки, если поле пустое после `trim()`.
  - `pattern?: { value: RegExp; message: string }` — проверяется только
    если поле непустое.
- `options.errorElement?: HTMLElement` — элемент для показа текста ошибки
  (должен поддерживать атрибут `hidden`).
- `options.onSubmit(values, form)` — вызывается после успешной валидации.
- `options.resetOnSuccess?: boolean` — сбросить форму после успешного `onSubmit`.

Возвращает функцию отписки от события `submit`.
