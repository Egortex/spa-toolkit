import "./index.scss";
import templateHTML from "./index.html?raw";
import { component } from "@chepchik/dom-template";
import { createForm, FormSubmitError } from "@chepchik/bind-form";
import { router } from "../../../main";
import { setAuthToken } from "../../session/session";
import type { PageModule, RenderResult } from "@chepchik/spa-router";

interface LoginResponse {
	token: string;
}

interface LoginRefs extends Record<string, HTMLElement> {
	form: HTMLFormElement;
	error: HTMLParagraphElement;
}

const LoginView = component<LoginRefs, Record<string, never>>({
	template: templateHTML,
	setup({ refs }) {
		const handle = createForm(refs.form, {
			schema: {
				username: { required: "Введите логин" },
				password: {
					required: "Введите пароль",
					minLength: { value: 4, message: "Минимум 4 символа" },
				},
			},
			errorElement: refs.error,
			validateOn: "blur",
			// Неверные логин/пароль — не ошибка конкретного поля, а серверная ошибка формы:
			// FormSubmitError без field-совпадений уходит в form.formError и показывается
			// в errorElement автоматически (без ручного refs.error.textContent = ...).
			errorMessages: { INVALID_CREDENTIALS: "Неверный логин или пароль" },
			onSubmit: async (values) => {
				const response = await fetch("/api/login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(values),
				});

				if (!response.ok) throw new FormSubmitError([{ code: "INVALID_CREDENTIALS" }]);

				const data = (await response.json()) as LoginResponse;
				setAuthToken(data.token);
				router.navigate("profile", {});
			},
		});

		return () => handle();
	},
});

const loginPage: PageModule = {
	render(container): RenderResult {
		const instance = LoginView(container, {});
		return () => instance.destroy();
	},
};

export default loginPage;
