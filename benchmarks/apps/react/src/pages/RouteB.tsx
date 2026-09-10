import { useMemo } from "react";
import { Link } from "react-router-dom";
import { buildRows } from "../words";

export default function RouteB() {
	const rows = useMemo(() => buildRows(200), []);

	return (
		<div id="route-ready">
			<h1>Route B</h1>
			<Link to="/route-a" id="nav-to-a">Go to route A</Link>
			<ul>
				{rows.map((row) => (
					<li key={row.id}>{row.label}</li>
				))}
			</ul>
		</div>
	);
}
