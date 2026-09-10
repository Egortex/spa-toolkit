<script lang="ts">
	import { buildRows, type Row } from "../../words";

	const rows: Row[] = $state(buildRows(1000));

	function updateSequential(): void {
		// One point mutation per row, sequentially — not a single batched re-render.
		for (let i = 0; i < rows.length; i++) {
			rows[i].label += "*";
		}
	}
</script>

<div id="app-ready">
	<button id="update-1000-sequential" type="button" onclick={updateSequential}>Update 1000 sequentially</button>
	<ul>
		{#each rows as row (row.id)}
			<li>{row.label}</li>
		{/each}
	</ul>
</div>
