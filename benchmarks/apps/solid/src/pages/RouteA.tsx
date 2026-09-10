import { For } from "solid-js";
import { A } from "@solidjs/router";
import { buildRows } from "../words";

export default function RouteA() {
	const rows = buildRows(200);

	return (
		<div id="route-ready">
			<h1>Route A</h1>
			<A href="/route-b" id="nav-to-b">Go to route B</A>
			<ul>
				<For each={rows}>{(row) => <li>{row.label}</li>}</For>
			</ul>
		</div>
	);
}
