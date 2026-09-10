import { A } from "@solidjs/router";

export default function Home() {
	return (
		<div id="app-ready">
			<h1>solid benchmark app</h1>
			<nav>
				<A href="/table">table</A>
				<A href="/table-100k">table-100k</A>
				<A href="/updates-1000">updates-1000</A>
				<A href="/components-1000">components-1000</A>
				<A href="/large-form">large-form</A>
				<A href="/large-table">large-table</A>
				<A href="/route-a">route-a</A>
			</nav>
		</div>
	);
}
