import { component } from "@chepchik/dom-template";
import { createForm, type FieldSchema } from "@chepchik/bind-form";
import type { PageModule } from "@chepchik/spa-router";

const TEXT_FIELDS = 120;
const NUMBER_FIELDS = 30;
const CHECKBOX_FIELDS = 30;
const SELECT_FIELDS = 20;

function fieldNames(): { text: string[]; number: string[]; checkbox: string[]; select: string[] } {
	return {
		text: Array.from({ length: TEXT_FIELDS }, (_, i) => `text${i}`),
		number: Array.from({ length: NUMBER_FIELDS }, (_, i) => `number${i}`),
		checkbox: Array.from({ length: CHECKBOX_FIELDS }, (_, i) => `checkbox${i}`),
		select: Array.from({ length: SELECT_FIELDS }, (_, i) => `select${i}`),
	};
}

function buildFormHtml(): string {
	const { text, number, checkbox, select } = fieldNames();
	const textInputs = text.map((name) => `<label>${name}<input type="text" name="${name}" /></label>`).join("");
	const numberInputs = number.map((name) => `<label>${name}<input type="number" name="${name}" /></label>`).join("");
	const checkboxInputs = checkbox.map((name) => `<label><input type="checkbox" name="${name}" />${name}</label>`).join("");
	const selectInputs = select
		.map((name) => `<label>${name}<select name="${name}"><option value="a">a</option><option value="b">b</option><option value="c">c</option></select></label>`)
		.join("");
	return `
		<form ref="form" id="large-form">
			<button ref="fillButton" id="fill-form" type="button">Fill form</button>
			${textInputs}${numberInputs}${checkboxInputs}${selectInputs}
		</form>
	`;
}

interface Refs extends Record<string, HTMLElement> {
	form: HTMLFormElement;
	fillButton: HTMLButtonElement;
}

type Schema = Record<string, FieldSchema<any>>;

const View = component<Refs, Record<string, never>>({
	template: buildFormHtml(),
	setup({ refs }) {
		const { text, number, checkbox, select } = fieldNames();
		const schema: Schema = {};
		for (const name of text) schema[name] = { type: "text", maxLength: { value: 200, message: "too long" } };
		for (const name of number) schema[name] = { type: "number" };
		for (const name of checkbox) schema[name] = { type: "checkbox" };
		for (const name of select) schema[name] = { type: "text" };

		const handle = createForm(refs.form, {
			schema,
			validateOn: "input",
			onSubmit: () => { /* not exercised by this benchmark */ },
		});

		refs.fillButton.addEventListener("click", () => {
			for (const name of text) handle.setValue(name, `value-${name}`);
			for (const name of number) handle.setValue(name, 42);
			for (const name of checkbox) handle.setValue(name, true);
			for (const name of select) handle.setValue(name, "b");
		});
	},
});

const largeFormPage: PageModule = {
	render(container) {
		const instance = View(container, {});
		return () => instance.destroy();
	},
};

export default largeFormPage;
