import "./index.scss";
import templateHTML from "./index.html?raw";
import { component } from "@chepchik/dom-template";
import type { PageModule } from "@chepchik/spa-router";

interface NotFoundRefs extends Record<string, HTMLElement> {
	message: HTMLParagraphElement;
}

const NotFoundView = component<NotFoundRefs, { path: string }>({
	template: templateHTML,
	setup({ refs, props }) {
		refs.message.textContent = `Страница «${props.path}» не найдена.`;
	},
});

const notFoundPage: PageModule = {
	render(container, _data, ctx) {
		const instance = NotFoundView(container, { path: ctx.path });
		return () => instance.destroy();
	},
};

export default notFoundPage;
