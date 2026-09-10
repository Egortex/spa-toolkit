<script setup lang="ts">
import { reactive } from "vue";

const TEXT_FIELDS = 120;
const NUMBER_FIELDS = 30;
const CHECKBOX_FIELDS = 30;
const SELECT_FIELDS = 20;

const textNames = Array.from({ length: TEXT_FIELDS }, (_, i) => `text${i}`);
const numberNames = Array.from({ length: NUMBER_FIELDS }, (_, i) => `number${i}`);
const checkboxNames = Array.from({ length: CHECKBOX_FIELDS }, (_, i) => `checkbox${i}`);
const selectNames = Array.from({ length: SELECT_FIELDS }, (_, i) => `select${i}`);

interface FormState {
	[key: string]: string | number | boolean;
}

const form = reactive<FormState>({});
for (const name of textNames) form[name] = "";
for (const name of numberNames) form[name] = 0;
for (const name of checkboxNames) form[name] = false;
for (const name of selectNames) form[name] = "a";

const errors = reactive<Record<string, string>>({});

function validateText(name: string): void {
	const value = form[name] as string;
	errors[name] = value.length > 200 ? "too long" : "";
}

function fillForm(): void {
	for (const name of textNames) {
		form[name] = `value-${name}`;
		validateText(name);
	}
	for (const name of numberNames) form[name] = 42;
	for (const name of checkboxNames) form[name] = true;
	for (const name of selectNames) form[name] = "b";
}
</script>

<template>
	<form id="large-form" @submit.prevent>
		<button id="fill-form" type="button" @click="fillForm">Fill form</button>
		<label v-for="name in textNames" :key="name">
			{{ name }}
			<input type="text" v-model="form[name]" @input="validateText(name)" />
			<span v-if="errors[name]">{{ errors[name] }}</span>
		</label>
		<label v-for="name in numberNames" :key="name">
			{{ name }}
			<input type="number" v-model.number="form[name]" />
		</label>
		<label v-for="name in checkboxNames" :key="name">
			<input type="checkbox" v-model="form[name]" />
			{{ name }}
		</label>
		<label v-for="name in selectNames" :key="name">
			{{ name }}
			<select v-model="form[name]">
				<option value="a">a</option>
				<option value="b">b</option>
				<option value="c">c</option>
			</select>
		</label>
	</form>
</template>
