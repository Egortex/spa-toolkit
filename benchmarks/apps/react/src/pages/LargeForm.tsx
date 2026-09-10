import { useState } from "react";

const TEXT_FIELDS = 120;
const NUMBER_FIELDS = 30;
const CHECKBOX_FIELDS = 30;
const SELECT_FIELDS = 20;

const textNames = Array.from({ length: TEXT_FIELDS }, (_, i) => `text${i}`);
const numberNames = Array.from({ length: NUMBER_FIELDS }, (_, i) => `number${i}`);
const checkboxNames = Array.from({ length: CHECKBOX_FIELDS }, (_, i) => `checkbox${i}`);
const selectNames = Array.from({ length: SELECT_FIELDS }, (_, i) => `select${i}`);

type FormValues = Record<string, string | number | boolean>;

function initialValues(): FormValues {
	const values: FormValues = {};
	for (const name of textNames) values[name] = "";
	for (const name of numberNames) values[name] = 0;
	for (const name of checkboxNames) values[name] = false;
	for (const name of selectNames) values[name] = "a";
	return values;
}

export default function LargeForm() {
	const [values, setValues] = useState<FormValues>(initialValues);
	const [errors, setErrors] = useState<Record<string, string>>({});

	const validateText = (name: string, value: string) => {
		setErrors((prev) => {
			if (value.length > 200) return { ...prev, [name]: "too long" };
			if (!prev[name]) return prev;
			const next = { ...prev };
			delete next[name];
			return next;
		});
	};

	const setText = (name: string, value: string) => {
		setValues((prev) => ({ ...prev, [name]: value }));
		validateText(name, value);
	};

	const setNumber = (name: string, value: number) => {
		setValues((prev) => ({ ...prev, [name]: value }));
	};

	const setCheckbox = (name: string, value: boolean) => {
		setValues((prev) => ({ ...prev, [name]: value }));
	};

	const setSelect = (name: string, value: string) => {
		setValues((prev) => ({ ...prev, [name]: value }));
	};

	const fillForm = () => {
		const next: FormValues = { ...values };
		for (const name of textNames) next[name] = `value-${name}`;
		for (const name of numberNames) next[name] = 42;
		for (const name of checkboxNames) next[name] = true;
		for (const name of selectNames) next[name] = "b";
		setValues(next);
		setErrors({});
	};

	return (
		<form id="large-form">
			<button id="fill-form" type="button" onClick={fillForm}>Fill form</button>
			{textNames.map((name) => (
				<label key={name}>
					{name}
					<input
						type="text"
						name={name}
						value={values[name] as string}
						onChange={(event) => setText(name, event.target.value)}
					/>
					{errors[name] ? <span className="field-error">{errors[name]}</span> : null}
				</label>
			))}
			{numberNames.map((name) => (
				<label key={name}>
					{name}
					<input
						type="number"
						name={name}
						value={values[name] as number}
						onChange={(event) => setNumber(name, Number(event.target.value))}
					/>
				</label>
			))}
			{checkboxNames.map((name) => (
				<label key={name}>
					<input
						type="checkbox"
						name={name}
						checked={values[name] as boolean}
						onChange={(event) => setCheckbox(name, event.target.checked)}
					/>
					{name}
				</label>
			))}
			{selectNames.map((name) => (
				<label key={name}>
					{name}
					<select name={name} value={values[name] as string} onChange={(event) => setSelect(name, event.target.value)}>
						<option value="a">a</option>
						<option value="b">b</option>
						<option value="c">c</option>
					</select>
				</label>
			))}
		</form>
	);
}
