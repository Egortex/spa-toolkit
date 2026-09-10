import { For } from "solid-js";
import { createStore } from "solid-js/store";

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
	const [values, setValues] = createStore<FormValues>(initialValues());
	const [errors, setErrors] = createStore<Record<string, string | undefined>>({});

	const validateText = (name: string, value: string) => {
		setErrors(name, value.length > 200 ? "too long" : undefined);
	};

	const setText = (name: string, value: string) => {
		setValues(name, value);
		validateText(name, value);
	};

	const fillForm = () => {
		for (const name of textNames) setText(name, `value-${name}`);
		for (const name of numberNames) setValues(name, 42);
		for (const name of checkboxNames) setValues(name, true);
		for (const name of selectNames) setValues(name, "b");
	};

	return (
		<form id="large-form">
			<button id="fill-form" type="button" onClick={fillForm}>Fill form</button>
			<For each={textNames}>
				{(name) => (
					<label>
						{name}
						<input
							type="text"
							name={name}
							value={values[name] as string}
							onInput={(e) => setText(name, e.currentTarget.value)}
						/>
						{errors[name] && <span class="field-error">{errors[name]}</span>}
					</label>
				)}
			</For>
			<For each={numberNames}>
				{(name) => (
					<label>
						{name}
						<input
							type="number"
							name={name}
							value={values[name] as number}
							onInput={(e) => setValues(name, e.currentTarget.valueAsNumber)}
						/>
					</label>
				)}
			</For>
			<For each={checkboxNames}>
				{(name) => (
					<label>
						<input
							type="checkbox"
							name={name}
							checked={values[name] as boolean}
							onChange={(e) => setValues(name, e.currentTarget.checked)}
						/>
						{name}
					</label>
				)}
			</For>
			<For each={selectNames}>
				{(name) => (
					<label>
						{name}
						<select
							name={name}
							value={values[name] as string}
							onChange={(e) => setValues(name, e.currentTarget.value)}
						>
							<option value="a">a</option>
							<option value="b">b</option>
							<option value="c">c</option>
						</select>
					</label>
				)}
			</For>
		</form>
	);
}
