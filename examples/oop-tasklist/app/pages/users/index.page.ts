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

const UserSkeletonView = component<UserRefs, Record<string, never>>({
  template: templateHTML, setup({ refs }) {
    refs.list.textContent = "Загрузка...";
    refs.list.classList.add("skeleton", "users-list__skeleton-text");
  },
});

const usersPage: PageModule = {
  render(container) {
    const instance = UsersHintView(container, {});
    return () => instance.destroy();
  },
  skeleton(container) {
    const instance = UserSkeletonView(container, {});
    return () => instance.destroy();
  },
};

export default usersPage;
