import { component } from "@chepchik/dom-template";
import type { PageModule } from "@chepchik/spa-router";
import { buildRows, type Row } from "../words";

interface Refs extends Record<string, HTMLElement> {
	list: HTMLUListElement;
	updateButton: HTMLButtonElement;
}

const View = component<Refs, Record<string, never>>({
	template: `
		<div id="app-ready">
			<button ref="updateButton" id="update-1000-sequential" type="button">Update 1000 sequentially</button>
			<ul ref="list"></ul>
		</div>
	`,
	setup({ refs, signal }) {
		const rows: Row[] = buildRows(1000);
		const items: HTMLLIElement[] = rows.map((row) => {
			const li = document.createElement("li");
			li.textContent = row.label;
			return li;
		});
		refs.list.replaceChildren(...items);

		refs.updateButton.addEventListener("click", () => {
			// One point mutation per row, sequentially — not a single batched re-render.
			for (let i = 0; i < rows.length; i++) {
				rows[i].label += "*";
				items[i].textContent = rows[i].label;
			}
		}, { signal });
	},
});

const updates1000Page: PageModule = {
	render(container) {
		const instance = View(container, {});
		return () => instance.destroy();
	},
};

export default updates1000Page;
