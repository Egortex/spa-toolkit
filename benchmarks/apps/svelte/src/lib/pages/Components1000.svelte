<script lang="ts">
	import TaskCard from "./TaskCard.svelte";

	let indices: number[] = $state([]);

	function mount1000(): void {
		indices = Array.from({ length: 1000 }, (_, i) => i);
	}

	function unmount1000(): void {
		indices = [];
	}
</script>

<div id="app-ready">
	<button id="mount-1000" type="button" onclick={mount1000}>Mount 1000</button>
	<button id="unmount-1000" type="button" onclick={unmount1000}>Unmount all</button>
	<ul>
		{#each indices as index (index)}
			<TaskCard {index} />
		{/each}
	</ul>
</div>
