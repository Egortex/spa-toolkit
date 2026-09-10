<script setup lang="ts">
import { buildRows } from "../words";

const rows = buildRows(200);
</script>

<template>
	<div id="route-ready">
		<h1>Route A</h1>
		<router-link to="/route-b" id="nav-to-b">Go to route B</router-link>
		<ul>
			<li v-for="row in rows" :key="row.id">{{ row.label }}</li>
		</ul>
	</div>
</template>
