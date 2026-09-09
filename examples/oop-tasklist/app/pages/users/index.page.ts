import "./index.scss";
import templateHTML from "./index.html?raw";
import { component } from "@chepchik/dom-template";
import type { PageModule } from "@chepchik/spa-router";

interface UserRefs extends Record<string, HTMLElement> {
  list: HTMLElement;
}

/**
 * Содержимое outlet'а секции /users по умолчанию: список пользователей рендерит
 * `usersLayout` (сайдбар), здесь — лишь подсказка выбрать пользователя.
 */
const UsersHintView = component<UserRefs, Record<string, never>>({ template: templateHTML, setup() { } });

// Skeleton здесь намеренно не нужен: он показывается только пока есть активный
// `loader`, которого ждать нужно (см. PageModule.skeleton в @chepchik/spa-router,
// и usersLayout/users/[id] для реального примера с loader'ом) — а у этой страницы
// нет loader'а вообще, рендер мгновенный, ждать нечего.
const usersPage: PageModule = {
  render(container) {
    const instance = UsersHintView(container, {});
    return () => instance.destroy();
  },
};

export default usersPage;
