import { component } from "@chepchik/dom-template";
import type { PageModule } from "@chepchik/spa-router";

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

interface Refs extends Record<string, HTMLElement> {
	table: HTMLTableElement;
	tbody: HTMLTableSectionElement;
	sortButton: HTMLButtonElement;
	filterButton: HTMLButtonElement;
	clearFilterButton: HTMLButtonElement;
}

function renderRow(row: BigRow): HTMLTableRowElement {
	const tr = document.createElement("tr");
	for (const value of [String(row.id), row.name, row.email, row.status, row.date]) {
		const td = document.createElement("td");
		td.textContent = value;
		tr.appendChild(td);
	}
	return tr;
}

const View = component<Refs, Record<string, never>>({
	template: `
		<div>
			<button ref="sortButton" id="big-table-sort" type="button">Sort by name</button>
			<button ref="filterButton" id="big-table-filter" type="button">Filter</button>
			<button ref="clearFilterButton" id="big-table-clear-filter" type="button">Clear filter</button>
			<table ref="table" id="big-table">
				<thead><tr><th>id</th><th>name</th><th>email</th><th>status</th><th>date</th></tr></thead>
				<tbody ref="tbody"></tbody>
			</table>
		</div>
	`,
	setup({ refs, signal }) {
		const rows = buildBigRows(10_000);
		refs.tbody.replaceChildren(...rows.map(renderRow));

		refs.sortButton.addEventListener("click", () => {
			const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
			refs.tbody.replaceChildren(...sorted.map(renderRow));
		}, { signal });

		refs.filterButton.addEventListener("click", () => {
			const filtered = rows.filter((row) => row.name.includes(FILTER_NEEDLE));
			refs.tbody.replaceChildren(...filtered.map(renderRow));
		}, { signal });

		refs.clearFilterButton.addEventListener("click", () => {
			refs.tbody.replaceChildren(...rows.map(renderRow));
		}, { signal });
	},
});

const largeTablePage: PageModule = {
	render(container) {
		const instance = View(container, {});
		return () => instance.destroy();
	},
};

export default largeTablePage;
