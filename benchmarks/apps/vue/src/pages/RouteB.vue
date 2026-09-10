<script setup lang="ts">
import { buildRows } from "../words";

const rows = buildRows(200);
</script>

<template>
	<div id="route-ready">
		<h1>Route B</h1>
		<router-link to="/route-a" id="nav-to-a">Go to route A</router-link>
		<ul>
			<li v-for="row in rows" :key="row.id">{{ row.label }}</li>
		</ul>
	</div>
</template>
