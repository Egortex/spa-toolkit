<script setup lang="ts">
import { ref } from "vue";
import { buildRows, type Row } from "../words";

defineProps<{ include100k?: boolean }>();

const rows = ref<Row[]>([]);
const selectedId = ref<number | null>(null);

function run(): void {
	rows.value = buildRows(1000);
	selectedId.value = null;
}

function runLots(): void {
	rows.value = buildRows(10_000);
	selectedId.value = null;
}

function run100k(): void {
	rows.value = buildRows(100_000);
	selectedId.value = null;
}

function add(): void {
	rows.value = rows.value.concat(buildRows(1000));
}

function update(): void {
	for (let i = 0; i < rows.value.length; i += 10) {
		rows.value[i].label += " !!!";
	}
}

function clear(): void {
	rows.value = [];
	selectedId.value = null;
}

function swapRows(): void {
	const list = rows.value;
	if (list.length < 999) return;
	const a = list[1];
	const b = list[998];
	list[1] = b;
	list[998] = a;
}

function select(id: number): void {
	selectedId.value = id;
}

function remove(id: number): void {
	rows.value = rows.value.filter((row) => row.id !== id);
}
</script>

<template>
	<div class="bench-controls">
		<button id="run" type="button" @click="run">Create 1,000 rows</button>
		<button id="runlots" type="button" @click="runLots">Create 10,000 rows</button>
		<button v-if="include100k" id="run100k" type="button" @click="run100k">Create 100,000 rows</button>
		<button id="add" type="button" @click="add">Append 1,000 rows</button>
		<button id="update" type="button" @click="update">Update every 10th row</button>
		<button id="clear" type="button" @click="clear">Clear</button>
		<button id="swaprows" type="button" @click="swapRows">Swap rows</button>
	</div>
	<table id="table">
		<tbody>
			<tr v-for="row in rows" :key="row.id" :class="{ danger: row.id === selectedId }">
				<td class="col-md-1">{{ row.id }}</td>
				<td class="col-md-4">
					<a href="#" @click.prevent="select(row.id)">{{ row.label }}</a>
				</td>
				<td class="col-md-1">
					<a href="#" data-action="remove" @click.prevent="remove(row.id)">&#10006;</a>
				</td>
				<td class="col-md-6"></td>
			</tr>
		</tbody>
	</table>
</template>
