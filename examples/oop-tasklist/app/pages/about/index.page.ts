import "./index.scss";
import templateHTML from "./index.html?raw";
import { component } from "@chepchik/dom-template";
import type { PageModule } from "@chepchik/spa-router";

interface AboutData {
	title: string;
	content: string;
}

interface AboutRefs extends Record<string, HTMLElement> {
	title: HTMLHeadingElement;
	content: HTMLParagraphElement;
	hint: HTMLParagraphElement;
}

interface AboutProps extends AboutData {
	/** Пример работы с query-параметрами: /about?ref=home */
	referrer: string | null;
}

const AboutView = component<AboutRefs, AboutProps>({
	template: templateHTML,
	setup({ refs, props }) {
		refs.title.textContent = props.title;
		refs.content.textContent = props.content;

		if (props.referrer) {
			refs.hint.textContent = `Переход по ссылке из: ${props.referrer}`;
			refs.hint.removeAttribute("hidden");
		}
	},
});

const aboutPage: PageModule<AboutData> = {
	async loader(ctx): Promise<AboutData> {
		const response = await fetch("/api/pages/about", { signal: ctx.signal });
		if (!response.ok) throw new Error("Failed to load about page data");
		return (await response.json()) as AboutData;
	},

	render(container, data, ctx) {
		const instance = AboutView(container, { ...data, referrer: ctx.query.get("ref") });
		return () => instance.destroy();
	},
};

export default aboutPage;
