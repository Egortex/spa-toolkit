import "./index.scss";
import templateHTML from "./index.html?raw";
import { component } from "@chepchik/dom-template";
import { createForm, FormSubmitError, type FieldSchema } from "@chepchik/bind-form";
import type { PageModule, RenderResult } from "@chepchik/spa-router";

/**
 * TS не всегда выводит generic `TSchema` из инлайн-объекта, когда поля вперемешку
 * несут разнотипные callback'и (async/validate) и разные `type` — передаём явно,
 * как в тайп-тестах пакета (`packages/bind-form/tests/types.test-d.ts`). Именованный
 * `interface`/`type` не проходит ограничение `Record<string, FieldSchema<any>>`
 * (нет индексной сигнатуры) — нужен именно анонимный object type.
 */
type FormDemoSchema = {
	username: FieldSchema<string>;
	email: FieldSchema<string>;
	age: FieldSchema<number>;
	password: FieldSchema<string>;
	bio: FieldSchema<string>;
} & Record<string, FieldSchema<any>>;

interface FormDemoRefs extends Record<string, HTMLElement> {
	form: HTMLFormElement;
	error: HTMLParagraphElement;
	bioCount: HTMLSpanElement;
	passwordStrength: HTMLSpanElement;
	state: HTMLPreElement;
	fillButton: HTMLButtonElement;
	resetButton: HTMLButtonElement;
	submitButton: HTMLButtonElement;
}

const RESERVED_USERNAMES = ["admin", "root", "test"];
const TAKEN_EMAILS = ["ivan@example.com"];

const BIO_MAX_LENGTH = 200;

const SUBMIT_LABEL_IDLE = "Зарегистрироваться";
const SUBMIT_LABEL_PENDING = "Отправка...";

/** Грубая оценка силы пароля по длине и разнообразию символов. */
function getPasswordStrength(value: string): string {
	if (!value) return "";

	let score = 0;
	if (value.length >= 6) score++;
	if (value.length >= 10) score++;
	if (/\d/.test(value) && /[a-zA-Z]/.test(value)) score++;
	if (/[^a-zA-Z0-9]/.test(value)) score++;

	if (score <= 1) return "слабый";
	if (score <= 2) return "средний";
	return "сильный";
}

const FormDemoView = component<FormDemoRefs, Record<string, never>>({
	template: templateHTML,
	setup({ refs }) {
		const updateBioCount = (value: string): void => {
			refs.bioCount.textContent = `${value.length}/${BIO_MAX_LENGTH}`;
		};

		const handle = createForm<FormDemoSchema>(refs.form, {
			schema: {
				username: {
					type: "text",
					required: "Введите имя пользователя",
					pattern: { value: /^[a-zA-Z0-9_]+$/, message: "Только буквы, цифры и _" },
					minLength: { value: 3, message: "Минимум 3 символа" },
					maxLength: { value: 16, message: "Максимум 16 символов" },
					// async запускается только если поле уже прошло sync-стадию (required/pattern/
					// длина) — часть пайплайна sync → async → server, а не отдельный form-level resolver.
					async: async (value: string) => {
						await new Promise((resolve) => setTimeout(resolve, 300));
						return RESERVED_USERNAMES.includes(value.toLowerCase()) ? "Это имя уже занято" : undefined;
					},
				},
				email: {
					type: "text",
					required: "Введите email",
					pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Неверный формат email" },
				},
				age: {
					// type: "number" — form.values.age приходит как number, не string.
					type: "number",
					required: "Введите возраст",
					min: { value: 18, message: "Минимум 18 лет" },
					max: { value: 99, message: "Максимум 99 лет" },
				},
				password: {
					type: "text",
					required: "Введите пароль",
					minLength: { value: 6, message: "Минимум 6 символов" },
					validate: (value: string) => (/\d/.test(value) ? undefined : "Пароль должен содержать цифру"),
				},
				bio: {
					type: "text",
					maxLength: { value: BIO_MAX_LENGTH, message: `Максимум ${BIO_MAX_LENGTH} символов` },
				},
			},
			errorElement: refs.error,
			validateOn: "input",
			errorMessages: { EMAIL_TAKEN: "Этот email уже зарегистрирован" },
			onStateChange: (state) => {
				refs.state.textContent = JSON.stringify(
					{
						isDirty: state.isDirty,
						isSubmitting: state.isSubmitting,
						touched: state.touched,
						dirty: state.dirty,
						errors: state.errors,
						formError: state.formError,
					},
					null,
					2,
				);

				refs.submitButton.textContent = state.isSubmitting
					? SUBMIT_LABEL_PENDING
					: SUBMIT_LABEL_IDLE;
			},
			// Имитация запроса регистрации: сервер отклоняет уже занятый email — сравните
			// с async-проверкой username выше (та отрабатывает ДО submit, эта — ответ сервера
			// ПОСЛЕ submit). "Заполнить пример" намеренно подставляет занятый email — нажмите
			// "Зарегистрироваться" сразу после, чтобы увидеть форменную (non-field) ошибку.
			onSubmit: async (values) => {
				await new Promise((resolve) => setTimeout(resolve, 800));
				if (TAKEN_EMAILS.includes(values.email.toLowerCase())) {
					throw new FormSubmitError([{ code: "EMAIL_TAKEN" }]);
				}
				console.log("Зарегистрирован пользователь:", values);
				alert(`Регистрация прошла успешно: ${values.username}`);
			},
			resetOnSuccess: true,
		});

		handle.watch("bio", (value) => updateBioCount(value));
		updateBioCount(handle.getValues().bio);

		handle.watch("password", (value) => {
			refs.passwordStrength.textContent = getPasswordStrength(value);
		});

		refs.fillButton.addEventListener("click", () => {
			handle.setValue("username", "ivan_petrov");
			handle.setValue("email", "ivan@example.com");
			handle.setValue("age", 25);
			handle.setValue("password", "secret123");
			handle.setValue("bio", "Привет, это пример заполнения формы.");
			updateBioCount(handle.getValues().bio);
			refs.passwordStrength.textContent = getPasswordStrength(handle.getValues().password);
		});

		refs.resetButton.addEventListener("click", () => {
			handle.reset();
			updateBioCount(handle.getValues().bio);
			refs.passwordStrength.textContent = "";
		});

		return () => handle();
	},
});

const formDemoPage: PageModule = {
	render(container): RenderResult {
		const instance = FormDemoView(container, {});
		return () => instance.destroy();
	},
};

export default formDemoPage;
