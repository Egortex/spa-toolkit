<script lang="ts">
	// A non-trivial component with its own local reactive state (checked flag + a click counter).
	let { index }: { index: number } = $props();

	let checked = $state(false);
	let count = $state(0);
</script>

<li class="task-card">
	<input type="checkbox" bind:checked />
	<span>Task #{index}</span>
	<button type="button" onclick={() => (count += 1)}>+</button>
	<span>{count}</span>
</li>
