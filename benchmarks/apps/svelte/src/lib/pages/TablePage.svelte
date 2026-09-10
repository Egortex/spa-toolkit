<script lang="ts">
	import { buildRows, type Row } from "../../words";

	let { include100k = false }: { include100k?: boolean } = $props();

	let rows: Row[] = $state([]);
	let selectedId: number | null = $state(null);

	function run(): void {
		rows = buildRows(1000);
		selectedId = null;
	}

	function runLots(): void {
		rows = buildRows(10_000);
		selectedId = null;
	}

	function run100k(): void {
		rows = buildRows(100_000);
		selectedId = null;
	}

	function add(): void {
		rows = [...rows, ...buildRows(1000)];
	}

	function update(): void {
		for (let i = 0; i < rows.length; i += 10) {
			rows[i].label += " !!!";
		}
	}

	function clear(): void {
		rows = [];
		selectedId = null;
	}

	function select(id: number): void {
		selectedId = id;
	}

	function remove(id: number): void {
		rows = rows.filter((row) => row.id !== id);
	}

	function swapRows(): void {
		if (rows.length < 999) return;
		const a = rows[1];
		const b = rows[998];
		rows[1] = b;
		rows[998] = a;
	}
</script>

<div class="bench-controls">
	<button id="run" type="button" onclick={run}>Create 1,000 rows</button>
	<button id="runlots" type="button" onclick={runLots}>Create 10,000 rows</button>
	{#if include100k}
		<button id="run100k" type="button" onclick={run100k}>Create 100,000 rows</button>
	{/if}
	<button id="add" type="button" onclick={add}>Append 1,000 rows</button>
	<button id="update" type="button" onclick={update}>Update every 10th row</button>
	<button id="clear" type="button" onclick={clear}>Clear</button>
	<button id="swaprows" type="button" onclick={swapRows}>Swap rows</button>
</div>
<table id="table">
	<tbody>
		{#each rows as row (row.id)}
			<tr class:danger={row.id === selectedId}>
				<td class="col-md-1">{row.id}</td>
				<td class="col-md-4">
					<a href="#" onclick={(event) => { event.preventDefault(); select(row.id); }}>{row.label}</a>
				</td>
				<td class="col-md-1">
					<a href="#" data-action="remove" onclick={(event) => { event.preventDefault(); remove(row.id); }}>✖</a>
				</td>
				<td class="col-md-6"></td>
			</tr>
		{/each}
	</tbody>
</table>
