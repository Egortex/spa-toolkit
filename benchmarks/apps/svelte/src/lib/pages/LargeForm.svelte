<script lang="ts">
	const TEXT_FIELDS = 120;
	const NUMBER_FIELDS = 30;
	const CHECKBOX_FIELDS = 30;
	const SELECT_FIELDS = 20;

	const textNames = Array.from({ length: TEXT_FIELDS }, (_, i) => `text${i}`);
	const numberNames = Array.from({ length: NUMBER_FIELDS }, (_, i) => `number${i}`);
	const checkboxNames = Array.from({ length: CHECKBOX_FIELDS }, (_, i) => `checkbox${i}`);
	const selectNames = Array.from({ length: SELECT_FIELDS }, (_, i) => `select${i}`);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const values: Record<string, any> = $state({});
	for (const name of textNames) values[name] = "";
	for (const name of numberNames) values[name] = 0;
	for (const name of checkboxNames) values[name] = false;
	for (const name of selectNames) values[name] = "a";

	function fillForm(): void {
		for (const name of textNames) values[name] = `value-${name}`;
		for (const name of numberNames) values[name] = 42;
		for (const name of checkboxNames) values[name] = true;
		for (const name of selectNames) values[name] = "b";
	}
</script>

<form id="large-form">
	<button id="fill-form" type="button" onclick={fillForm}>Fill form</button>
	{#each textNames as name (name)}
		<label>{name}<input type="text" maxlength="200" bind:value={values[name]} /></label>
	{/each}
	{#each numberNames as name (name)}
		<label>{name}<input type="number" bind:value={values[name]} /></label>
	{/each}
	{#each checkboxNames as name (name)}
		<label><input type="checkbox" bind:checked={values[name]} />{name}</label>
	{/each}
	{#each selectNames as name (name)}
		<label>
			{name}
			<select bind:value={values[name]}>
				<option value="a">a</option>
				<option value="b">b</option>
				<option value="c">c</option>
			</select>
		</label>
	{/each}
</form>
