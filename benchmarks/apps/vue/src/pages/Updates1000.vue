<script setup lang="ts">
import { ref } from "vue";
import { buildRows, type Row } from "../words";

const rows = ref<Row[]>(buildRows(1000));

function updateSequential(): void {
	// One point mutation per row, sequentially — not a single batched re-render.
	for (let i = 0; i < rows.value.length; i++) {
		rows.value[i].label += "*";
	}
}
</script>

<template>
	<div id="app-ready">
		<button id="update-1000-sequential" type="button" @click="updateSequential">Update 1000 sequentially</button>
		<ul>
			<li v-for="row in rows" :key="row.id">{{ row.label }}</li>
		</ul>
	</div>
</template>
