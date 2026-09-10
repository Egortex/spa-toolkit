<script setup lang="ts">
import { ref } from "vue";

interface BigRow {
	id: number;
	name: string;
	email: string;
	status: string;
	date: string;
}

const STATUSES = ["active", "pending", "disabled"];
const FILTER_NEEDLE = "a1"; // deliberately matches roughly ~10% of generated names below

function buildBigRows(count: number): BigRow[] {
	const rows: BigRow[] = [];
	for (let i = 0; i < count; i++) {
		rows.push({
			id: i + 1,
			name: `user-${i.toString(36)}`,
			email: `user-${i}@example.com`,
			status: STATUSES[i % STATUSES.length],
			date: new Date(2024, 0, 1 + (i % 365)).toISOString().slice(0, 10),
		});
	}
	return rows;
}

const allRows = buildBigRows(10_000);
const rows = ref<BigRow[]>(allRows);

function sort(): void {
	rows.value = [...rows.value].sort((a, b) => a.name.localeCompare(b.name));
}

function filter(): void {
	rows.value = allRows.filter((row) => row.name.includes(FILTER_NEEDLE));
}

function clearFilter(): void {
	rows.value = allRows;
}
</script>

<template>
	<div>
		<button id="big-table-sort" type="button" @click="sort">Sort by name</button>
		<button id="big-table-filter" type="button" @click="filter">Filter</button>
		<button id="big-table-clear-filter" type="button" @click="clearFilter">Clear filter</button>
		<table id="big-table">
			<thead>
				<tr>
					<th>id</th>
					<th>name</th>
					<th>email</th>
					<th>status</th>
					<th>date</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="row in rows" :key="row.id">
					<td>{{ row.id }}</td>
					<td>{{ row.name }}</td>
					<td>{{ row.email }}</td>
					<td>{{ row.status }}</td>
					<td>{{ row.date }}</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>
