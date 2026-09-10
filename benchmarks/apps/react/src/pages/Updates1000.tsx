import { useState } from "react";
import { buildRows, type Row } from "../words";

export default function Updates1000() {
	const [rows, setRows] = useState<Row[]>(() => buildRows(1000));

	const updateSequential = () => {
		// One point mutation per row, sequentially — same shape of loop a normal
		// developer would write. We deliberately do NOT reach for flushSync/
		// startTransition tricks: React's normal automatic batching applies here,
		// which is the honest "out of the box" behavior this scenario measures.
		for (let i = 0; i < 1000; i++) {
			setRows((prev) => {
				const next = prev.slice();
				next[i] = { ...next[i], label: next[i].label + "*" };
				return next;
			});
		}
	};

	return (
		<div id="app-ready">
			<button id="update-1000-sequential" type="button" onClick={updateSequential}>
				Update 1000 sequentially
			</button>
			<ul>
				{rows.map((row) => (
					<li key={row.id}>{row.label}</li>
				))}
			</ul>
		</div>
	);
}
