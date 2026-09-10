import { component, createState, type ComponentInstance } from "@chepchik/dom-template";
import type { PageModule } from "@chepchik/spa-router";

interface CardRefs extends Record<string, HTMLElement> {
	checkbox: HTMLInputElement;
	label: HTMLSpanElement;
	countButton: HTMLButtonElement;
	count: HTMLSpanElement;
}

interface CardProps {
	index: number;
}

/** A non-trivial component with its own local reactive state (checked flag + a click counter). */
const TaskCard = component<CardRefs, CardProps>({
	template: `
		<li class="task-card">
			<input ref="checkbox" type="checkbox" />
			<span ref="label"></span>
			<button ref="countButton" type="button">+</button>
			<span ref="count">0</span>
		</li>
	`,
	setup({ refs, props, signal }) {
		refs.label.textContent = `Task #${props.index}`;

		const checked = createState(false);
		checked.subscribe((value) => { refs.checkbox.checked = value; }, { signal });
		refs.checkbox.addEventListener("change", () => checked.set(refs.checkbox.checked), { signal });

		const count = createState(0);
		count.subscribe((value) => { refs.count.textContent = String(value); }, { signal });
		refs.countButton.addEventListener("click", () => count.set((n) => n + 1), { signal });
	},
});

interface Refs extends Record<string, HTMLElement> {
	list: HTMLUListElement;
	mountButton: HTMLButtonElement;
	unmountButton: HTMLButtonElement;
}

const View = component<Refs, Record<string, never>>({
	template: `
		<div id="app-ready">
			<button ref="mountButton" id="mount-1000" type="button">Mount 1000</button>
			<button ref="unmountButton" id="unmount-1000" type="button">Unmount all</button>
			<ul ref="list"></ul>
		</div>
	`,
	setup({ refs, signal }) {
		let instances: ComponentInstance<CardProps>[] = [];

		refs.mountButton.addEventListener("click", () => {
			instances = Array.from({ length: 1000 }, (_, index) => TaskCard(refs.list, { index }));
		}, { signal });

		refs.unmountButton.addEventListener("click", () => {
			for (const instance of instances.splice(0)) instance.destroy();
		}, { signal });
	},
});

const components1000Page: PageModule = {
	render(container) {
		const instance = View(container, {});
		return () => instance.destroy();
	},
};

export default components1000Page;
