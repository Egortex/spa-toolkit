<script lang="ts">
	import { buildRows } from "../../words";

	const rows = buildRows(200);
</script>

<div id="route-ready">
	<h1>Route B</h1>
	<a href="/route-a" id="nav-to-a">Go to route A</a>
	<ul>
		{#each rows as row (row.id)}
			<li>{row.label}</li>
		{/each}
	</ul>
</div>
