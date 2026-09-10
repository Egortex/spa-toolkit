import { component } from "@chepchik/dom-template";
import type { PageModule } from "@chepchik/spa-router";
import { buildRows, type Row } from "../words";

interface TableRefs extends Record<string, HTMLElement> {
	controls: HTMLElement;
	table: HTMLTableElement;
	tbody: HTMLTableSectionElement;
}

interface RowEntry {
	row: Row;
	tr: HTMLTableRowElement;
	label: HTMLAnchorElement;
}

/**
 * Идиоматично для spa-toolkit: пакет не тащит Virtual DOM (см. README dom-template),
 * поэтому список из тысяч строк — это прямые DOM-операции (createElement/append/remove),
 * а не диффинг. Ровно так писал бы этот код обычный пользователь пакета.
 */
function buildControlsHtml(include100k: boolean): string {
	return `
		<div ref="controls" class="bench-controls">
			<button ref="run" id="run" type="button">Create 1,000 rows</button>
			<button ref="runlots" id="runlots" type="button">Create 10,000 rows</button>
			${include100k ? '<button ref="run100k" id="run100k" type="button">Create 100,000 rows</button>' : ""}
			<button ref="add" id="add" type="button">Append 1,000 rows</button>
			<button ref="update" id="update" type="button">Update every 10th row</button>
			<button ref="clear" id="clear" type="button">Clear</button>
			<button ref="swaprows" id="swaprows" type="button">Swap rows</button>
		</div>
		<table ref="table" id="table">
			<tbody ref="tbody"></tbody>
		</table>
	`;
}

function createRowElement(row: Row, onSelect: (id: number) => void, onRemove: (id: number) => void, signal: AbortSignal): RowEntry {
	const tr = document.createElement("tr");

	const tdId = document.createElement("td");
	tdId.className = "col-md-1";
	tdId.textContent = String(row.id);

	const tdLabel = document.createElement("td");
	tdLabel.className = "col-md-4";
	const label = document.createElement("a");
	label.textContent = row.label;
	label.addEventListener("click", (event) => { event.preventDefault(); onSelect(row.id); }, { signal });
	tdLabel.appendChild(label);

	const tdRemove = document.createElement("td");
	tdRemove.className = "col-md-1";
	const removeLink = document.createElement("a");
	removeLink.dataset.action = "remove";
	removeLink.textContent = "✖";
	removeLink.addEventListener("click", (event) => { event.preventDefault(); onRemove(row.id); }, { signal });
	tdRemove.appendChild(removeLink);

	const tdSpacer = document.createElement("td");
	tdSpacer.className = "col-md-6";

	tr.append(tdId, tdLabel, tdRemove, tdSpacer);
	return { row, tr, label };
}

function createTableComponent(include100k: boolean) {
	return component<TableRefs, Record<string, never>>({
		template: buildControlsHtml(include100k),
		setup({ refs, signal }) {
			let entries: RowEntry[] = [];
			let selectedId: number | null = null;
			const byId = new Map<number, RowEntry>();

			const select = (id: number): void => {
				if (selectedId !== null) byId.get(selectedId)?.tr.classList.remove("danger");
				selectedId = id;
				byId.get(id)?.tr.classList.add("danger");
			};

			const remove = (id: number): void => {
				const entry = byId.get(id);
				if (!entry) return;
				entry.tr.remove();
				byId.delete(id);
				entries = entries.filter((e) => e.row.id !== id);
			};

			const renderAll = (rows: Row[]): void => {
				byId.clear();
				const fragment = document.createDocumentFragment();
				entries = rows.map((row) => {
					const entry = createRowElement(row, select, remove, signal);
					byId.set(row.id, entry);
					fragment.appendChild(entry.tr);
					return entry;
				});
				refs.tbody.replaceChildren(fragment);
				selectedId = null;
			};

			const appendRows = (rows: Row[]): void => {
				const fragment = document.createDocumentFragment();
				for (const row of rows) {
					const entry = createRowElement(row, select, remove, signal);
					byId.set(row.id, entry);
					entries.push(entry);
					fragment.appendChild(entry.tr);
				}
				refs.tbody.appendChild(fragment);
			};

			refs.run.addEventListener("click", () => renderAll(buildRows(1000)), { signal });
			refs.runlots.addEventListener("click", () => renderAll(buildRows(10_000)), { signal });
			(refs.run100k as HTMLButtonElement | undefined)?.addEventListener("click", () => renderAll(buildRows(100_000)), { signal });
			refs.add.addEventListener("click", () => appendRows(buildRows(1000)), { signal });

			refs.update.addEventListener("click", () => {
				for (let i = 0; i < entries.length; i += 10) {
					entries[i].row.label += " !!!";
					entries[i].label.textContent = entries[i].row.label;
				}
			}, { signal });

			refs.clear.addEventListener("click", () => {
				refs.tbody.replaceChildren();
				entries = [];
				byId.clear();
				selectedId = null;
			}, { signal });

			refs.swaprows.addEventListener("click", () => {
				if (entries.length < 999) return;
				const a = entries[1];
				const b = entries[998];
				// Swap two DOM nodes' positions regardless of adjacency, via a placeholder marker.
				const placeholder = document.createComment("");
				a.tr.replaceWith(placeholder);
				b.tr.replaceWith(a.tr);
				placeholder.replaceWith(b.tr);
				entries[1] = b;
				entries[998] = a;
			}, { signal });
		},
	});
}

export function createTablePage(include100k: boolean): PageModule {
	const View = createTableComponent(include100k);
	return {
		render(container) {
			const instance = View(container, {});
			return () => instance.destroy();
		},
	};
}
