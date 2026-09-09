import "./index.scss";
import templateHTML from "./index.html?raw";
import { component } from "@chepchik/dom-template";
import type { LayoutModule, LayoutRenderResult } from "@chepchik/spa-router";

interface MainLayoutRefs extends Record<string, HTMLElement> {
	nav: HTMLElement;
	outlet: HTMLElement;
}

/** Подсвечивает в навигации ссылку, соответствующую текущему пути. */
function updateActiveLink(nav: HTMLElement, path: string): void {
	nav.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
		link.classList.toggle("site-nav__link--active", link.getAttribute("href") === path);
	});
}

/** Основной layout приложения: шапка с навигацией + outlet для текущей страницы. */
const mainLayout: LayoutModule = {
	render(container, ctx): LayoutRenderResult {
		// `component()` не отдаёт `refs` наружу (видны только внутри setup()/onUpdate),
		// а LayoutModule обязан вернуть `outlet` вызывающему роутеру — захватываем его
		// через замыкание: setup() выполняется синхронно, до того как фабрика вернёт instance.
		let outlet!: HTMLElement;

		const instance = component<MainLayoutRefs, { path: string }>({
			template: templateHTML,
			setup({ refs, props }) {
				outlet = refs.outlet;
				updateActiveLink(refs.nav, props.path);
			},
			onUpdate(props, { refs }) {
				updateActiveLink(refs.nav, props.path);
			},
		})(container, { path: ctx.path });

		return {
			outlet,
			update(nextCtx): void {
				instance.update({ path: nextCtx.path });
			},
			cleanup(): void {
				instance.destroy();
			},
		};
	},
};

export default mainLayout;
