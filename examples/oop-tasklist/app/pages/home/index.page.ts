import "./index.scss";
import templateHTML from "./index.html?raw";
import { component } from "@chepchik/dom-template";
import type { PageModule } from "@chepchik/spa-router";

interface HomeData {
	title: string;
	content: string;
}

interface HomeRefs extends Record<string, HTMLElement> {
	title: HTMLHeadingElement;
	content: HTMLParagraphElement;
}

const HomeView = component<HomeRefs, HomeData>({
	template: templateHTML,
	setup({ refs, props }) {
		refs.title.textContent = props.title;
		refs.content.textContent = props.content;
	},
});

const homePage: PageModule<HomeData> = {
	async loader(ctx): Promise<HomeData> {
		const response = await fetch("/api/pages/home", { signal: ctx.signal });
		if (!response.ok) throw new Error("Failed to load home page data");
		return (await response.json()) as HomeData;
	},

	render(container, data) {
		const instance = HomeView(container, data);
		return () => instance.destroy();
	},
};

export default homePage;
