import { component } from "@chepchik/dom-template";
import type { PageModule } from "@chepchik/spa-router";

const HomeView = component({
	template: `
		<div id="app-ready">
			<h1>spa-toolkit benchmark app</h1>
			<nav>
				<a href="/table">table</a>
				<a href="/table-100k">table-100k</a>
				<a href="/updates-1000">updates-1000</a>
				<a href="/components-1000">components-1000</a>
				<a href="/large-form">large-form</a>
				<a href="/large-table">large-table</a>
				<a href="/route-a">route-a</a>
			</nav>
		</div>
	`,
	setup() {},
});

const homePage: PageModule = {
	render(container) {
		const instance = HomeView(container, {});
		return () => instance.destroy();
	},
};

export default homePage;
