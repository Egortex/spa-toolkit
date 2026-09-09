import "./index.scss";
import templateHTML from "./index.html?raw";
import { component, createState } from "@chepchik/dom-template";
import type { User } from "../../services/ApiService";
import { jsonPlaceholderApi as api } from "../../services/container";
import { query } from "@chepchik/spa-router";
import type { LayoutModule, LayoutRenderResult } from "@chepchik/spa-router";

interface UsersLayoutRefs extends Record<string, HTMLElement> {
	list: HTMLUListElement;
	outlet: HTMLElement;
}

/** Подсвечивает в списке ссылку на пользователя, открытого в данный момент в outlet'е. */
function highlightActive(list: HTMLElement, activeId: string): void {
	list.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
		link.classList.toggle("users-layout__link--active", link.dataset.userId === activeId);
	});
}

/** Перерисовывает список пользователей в сайдбаре. */
function renderUserList(list: HTMLUListElement, users: User[], activeId: string): void {
	list.innerHTML = "";
	users.forEach((user) => {
		const item = document.createElement("li");
		item.className = "users-layout__item";

		const link = document.createElement("a");
		link.href = `/users/${user.id}`;
		link.textContent = user.name;
		link.dataset.userId = String(user.id);
		item.appendChild(link);

		list.appendChild(item);
	});
	highlightActive(list, activeId);
}

/**
 * Layout секции /users: master-detail — слева список пользователей (общий для
 * /users и /users/:id), справа outlet с деталями. Монтируется вторым в цепочке
 * после `mainLayout`.
 *
 * Список пользователей берётся через `query()` — route-level data cache
 * spa-router (fresh/stale/expired, `staleTime: 30_000`) вместо ручного
 * модульного `cachedUsers`/`AbortController`, которые были здесь раньше:
 * повторный заход в /users в течение 30с не бьёт по сети вообще, а после —
 * список отдаётся из кэша немедленно и обновляется в фоне (stale-while-revalidate).
 */
const usersLayout: LayoutModule = {
	render(container, ctx): LayoutRenderResult {
		let outlet!: HTMLElement;

		const instance = component<UsersLayoutRefs, { activeId: string }>({
			template: templateHTML,
			setup({ refs, props, signal }) {
				outlet = refs.outlet;

				// createState — точечная подписка "значение → узел", не связана с
				// шаблоном автоматически; auto-unsubscribe через `signal` при destroy().
				const users = createState<User[] | null>(null);
				users.subscribe((list) => {
					if (list === null) refs.list.innerHTML = '<li class="users-layout__item--loading">Загрузка...</li>';
					else renderUserList(refs.list, list, props.activeId);
				}, { signal });

				void query<User[]>({ key: ["users"], loader: () => api.getUsers(), staleTime: 30_000 }).then((result) => {
					if (signal.aborted) return;
					users.set(result.data);
					void result.revalidation?.then((fresh) => {
						if (!signal.aborted) users.set(fresh);
					});
				});
			},
			onUpdate(props, { refs }) {
				highlightActive(refs.list, props.activeId);
			},
		})(container, { activeId: ctx.params.id ?? "" });

		return {
			outlet,
			update(nextCtx): void {
				instance.update({ activeId: nextCtx.params.id ?? "" });
			},
			cleanup(): void {
				instance.destroy();
			},
		};
	},
};

export default usersLayout;
