import { For } from "solid-js";
import { A } from "@solidjs/router";
import { buildRows } from "../words";

export default function RouteB() {
	const rows = buildRows(200);

	return (
		<div id="route-ready">
			<h1>Route B</h1>
			<A href="/route-a" id="nav-to-a">Go to route A</A>
			<ul>
				<For each={rows}>{(row) => <li>{row.label}</li>}</For>
			</ul>
		</div>
	);
}
