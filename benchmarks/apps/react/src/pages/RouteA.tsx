import { useMemo } from "react";
import { Link } from "react-router-dom";
import { buildRows } from "../words";

export default function RouteA() {
	const rows = useMemo(() => buildRows(200), []);

	return (
		<div id="route-ready">
			<h1>Route A</h1>
			<Link to="/route-b" id="nav-to-b">Go to route B</Link>
			<ul>
				{rows.map((row) => (
					<li key={row.id}>{row.label}</li>
				))}
			</ul>
		</div>
	);
}
