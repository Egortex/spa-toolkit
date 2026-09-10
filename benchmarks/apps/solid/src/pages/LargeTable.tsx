import { createSignal, For } from "solid-js";

interface BigRow {
	id: number;
	name: string;
	email: string;
	status: string;
	date: string;
}

const STATUSES = ["active", "pending", "disabled"];
const FILTER_NEEDLE = "a1"; // deliberately matches roughly ~10% of generated names below

function buildBigRows(count: number): BigRow[] {
	const rows: BigRow[] = [];
	for (let i = 0; i < count; i++) {
		rows.push({
			id: i + 1,
			name: `user-${i.toString(36)}`,
			email: `user-${i}@example.com`,
			status: STATUSES[i % STATUSES.length],
			date: new Date(2024, 0, 1 + (i % 365)).toISOString().slice(0, 10),
		});
	}
	return rows;
}

const allRows = buildBigRows(10_000);

export default function LargeTable() {
	const [rows, setRows] = createSignal<BigRow[]>(allRows);

	const sort = () => {
		setRows((prev) => [...prev].sort((a, b) => a.name.localeCompare(b.name)));
	};

	const filter = () => {
		setRows(allRows.filter((row) => row.name.includes(FILTER_NEEDLE)));
	};

	const clearFilter = () => {
		setRows(allRows);
	};

	return (
		<div>
			<button id="big-table-sort" type="button" onClick={sort}>Sort by name</button>
			<button id="big-table-filter" type="button" onClick={filter}>Filter</button>
			<button id="big-table-clear-filter" type="button" onClick={clearFilter}>Clear filter</button>
			<table id="big-table">
				<thead>
					<tr>
						<th>id</th>
						<th>name</th>
						<th>email</th>
						<th>status</th>
						<th>date</th>
					</tr>
				</thead>
				<tbody>
					<For each={rows()}>
						{(row) => (
							<tr>
								<td>{row.id}</td>
								<td>{row.name}</td>
								<td>{row.email}</td>
								<td>{row.status}</td>
								<td>{row.date}</td>
							</tr>
						)}
					</For>
				</tbody>
			</table>
		</div>
	);
}
