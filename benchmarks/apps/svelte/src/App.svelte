<script lang="ts">
	import { routerState } from "./router.svelte";
	import Home from "./lib/pages/Home.svelte";
	import TablePage from "./lib/pages/TablePage.svelte";
	import Updates1000 from "./lib/pages/Updates1000.svelte";
	import Components1000 from "./lib/pages/Components1000.svelte";
	import LargeForm from "./lib/pages/LargeForm.svelte";
	import LargeTable from "./lib/pages/LargeTable.svelte";
	import RouteA from "./lib/pages/RouteA.svelte";
	import RouteB from "./lib/pages/RouteB.svelte";
</script>

{#if routerState.path === "/"}
	<Home />
{:else if routerState.path === "/table"}
	<TablePage include100k={false} />
{:else if routerState.path === "/table-100k"}
	<TablePage include100k={true} />
{:else if routerState.path === "/updates-1000"}
	<Updates1000 />
{:else if routerState.path === "/components-1000"}
	<Components1000 />
{:else if routerState.path === "/large-form"}
	<LargeForm />
{:else if routerState.path === "/large-table"}
	<LargeTable />
{:else if routerState.path === "/route-a"}
	<RouteA />
{:else if routerState.path === "/route-b"}
	<RouteB />
{:else}
	<div id="app-ready">
		<p>Not found: {routerState.path}</p>
	</div>
{/if}
