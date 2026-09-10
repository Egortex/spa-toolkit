import { For } from "solid-js";
import { createStore } from "solid-js/store";
import { buildRows, type Row } from "../words";

export default function Updates1000() {
	const [rows, setRows] = createStore<Row[]>(buildRows(1000));

	const updateSequential = () => {
		// One point mutation per row, sequentially — not a single batched re-render.
		for (let i = 0; i < rows.length; i++) {
			setRows(i, "label", rows[i].label + "*");
		}
	};

	return (
		<div id="app-ready">
			<button id="update-1000-sequential" type="button" onClick={updateSequential}>Update 1000 sequentially</button>
			<ul>
				<For each={rows}>{(row) => <li>{row.label}</li>}</For>
			</ul>
		</div>
	);
}
