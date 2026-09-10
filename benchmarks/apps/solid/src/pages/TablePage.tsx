import { createSignal, For } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { buildRows, type Row } from "../words";

interface TablePageProps {
	include100k: boolean;
}

export default function TablePage(props: TablePageProps) {
	const [rows, setRows] = createStore<Row[]>([]);
	const [selectedId, setSelectedId] = createSignal<number | null>(null);

	const run = () => {
		setRows(buildRows(1000));
		setSelectedId(null);
	};
	const runLots = () => {
		setRows(buildRows(10_000));
		setSelectedId(null);
	};
	const run100k = () => {
		setRows(buildRows(100_000));
		setSelectedId(null);
	};
	const add = () => setRows(produce((draft) => draft.push(...buildRows(1000))));

	const update = () => {
		for (let i = 0; i < rows.length; i += 10) {
			setRows(i, "label", rows[i].label + " !!!");
		}
	};

	const clear = () => {
		setRows([]);
		setSelectedId(null);
	};

	const swapRows = () => {
		if (rows.length < 999) return;
		setRows(
			produce((draft) => {
				const tmp = draft[1];
				draft[1] = draft[998];
				draft[998] = tmp;
			}),
		);
	};

	const select = (id: number) => setSelectedId(id);

	const remove = (id: number) => {
		setRows(produce((draft) => {
			const idx = draft.findIndex((row) => row.id === id);
			if (idx !== -1) draft.splice(idx, 1);
		}));
	};

	return (
		<>
			<div class="bench-controls">
				<button id="run" type="button" onClick={run}>Create 1,000 rows</button>
				<button id="runlots" type="button" onClick={runLots}>Create 10,000 rows</button>
				{props.include100k && (
					<button id="run100k" type="button" onClick={run100k}>Create 100,000 rows</button>
				)}
				<button id="add" type="button" onClick={add}>Append 1,000 rows</button>
				<button id="update" type="button" onClick={update}>Update every 10th row</button>
				<button id="clear" type="button" onClick={clear}>Clear</button>
				<button id="swaprows" type="button" onClick={swapRows}>Swap rows</button>
			</div>
			<table id="table">
				<tbody>
					<For each={rows}>
						{(row) => (
							<tr classList={{ danger: selectedId() === row.id }}>
								<td class="col-md-1">{row.id}</td>
								<td class="col-md-4">
									<a onClick={(e) => { e.preventDefault(); select(row.id); }}>{row.label}</a>
								</td>
								<td class="col-md-1">
									<a data-action="remove" onClick={(e) => { e.preventDefault(); remove(row.id); }}>✖</a>
								</td>
								<td class="col-md-6" />
							</tr>
						)}
					</For>
				</tbody>
			</table>
		</>
	);
}
