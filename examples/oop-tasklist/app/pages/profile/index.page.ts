import "./index.scss";
import templateHTML from "./index.html?raw";
import { component } from "@chepchik/dom-template";
import { router } from "../../../main";
import { clearAuthToken, getAuthToken } from "../../session/session";
import type { PageModule } from "@chepchik/spa-router";

interface ProfileData {
	user: {
		id: number;
		name: string;
	};
}

interface ProfileRefs extends Record<string, HTMLElement> {
	greeting: HTMLParagraphElement;
	logoutBtn: HTMLButtonElement;
}

const ProfileView = component<ProfileRefs, ProfileData>({
	template: templateHTML,
	setup({ refs, props, signal }) {
		refs.greeting.textContent = `Добро пожаловать, ${props.user.name}!`;

		// { signal } — слушатель снимется сам при уходе со страницы (component.destroy()),
		// без ручного removeEventListener.
		refs.logoutBtn.addEventListener(
			"click",
			() => {
				clearAuthToken();
				router.navigate("/login");
			},
			{ signal },
		);
	},
});

const profilePage: PageModule<ProfileData> = {
	guard(): boolean {
		if (!getAuthToken()) {
			router.navigate("/login", { replace: true });
			return false;
		}
		return true;
	},

	async loader(ctx): Promise<ProfileData> {
		const response = await fetch("/api/me", {
			headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
			signal: ctx.signal,
		});
		if (!response.ok) throw new Error("Failed to load profile");
		return (await response.json()) as ProfileData;
	},

	render(container, data) {
		const instance = ProfileView(container, data);
		return () => instance.destroy();
	},
};

export default profilePage;
