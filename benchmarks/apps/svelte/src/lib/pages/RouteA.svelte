<script lang="ts">
	import { buildRows } from "../../words";

	const rows = buildRows(200);
</script>

<div id="route-ready">
	<h1>Route A</h1>
	<a href="/route-b" id="nav-to-b">Go to route B</a>
	<ul>
		{#each rows as row (row.id)}
			<li>{row.label}</li>
		{/each}
	</ul>
</div>
