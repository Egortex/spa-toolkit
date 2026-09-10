import { component } from "@chepchik/dom-template";
import type { PageModule } from "@chepchik/spa-router";
import { buildRows } from "../words";

interface Refs extends Record<string, HTMLElement> {
	list: HTMLUListElement;
}

const View = component<Refs, Record<string, never>>({
	template: `
		<div id="route-ready">
			<h1>Route A</h1>
			<a href="/route-b" id="nav-to-b">Go to route B</a>
			<ul ref="list"></ul>
		</div>
	`,
	setup({ refs }) {
		const rows = buildRows(200);
		refs.list.replaceChildren(...rows.map((row) => {
			const li = document.createElement("li");
			li.textContent = row.label;
			return li;
		}));
	},
});

const routeAPage: PageModule = {
	render(container) {
		const instance = View(container, {});
		return () => instance.destroy();
	},
};

export default routeAPage;
