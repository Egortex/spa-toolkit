import "./index.scss";
import templateHTML from "./index.html?raw";
import { component } from "@chepchik/dom-template";
import type { User } from "../../../services/ApiService";
import { jsonPlaceholderApi as api } from "../../../services/container";
import { loader, type PageModule } from "@chepchik/spa-router";

interface UserRefs extends Record<string, HTMLElement> {
  heading: HTMLHeadingElement;
  name: HTMLElement;
  email: HTMLElement;
}

const UserView = component<UserRefs, { id: string; user: User }>({
  template: templateHTML,
  setup({ refs, props }) {
    refs.heading.textContent = `Пользователь #${props.id}`;
    refs.name.textContent = props.user.name;
    refs.email.textContent = props.user.email;
  },
});

const UserErrorView = component<UserRefs, { id: string }>({
  template: templateHTML,
  setup({ refs, props }) {
    refs.heading.textContent = `Пользователь #${props.id}`;
    refs.name.textContent = "Не удалось загрузить пользователя";
    refs.email.textContent = "Попробуйте открыть страницу ещё раз.";
  },
});

const UserSkeletonView = component<UserRefs, Record<string, never>>({
  template: templateHTML,
  setup({ refs }) {
    refs.heading.textContent = "Загрузка...";
    refs.heading.classList.add("skeleton", "user-detail__skeleton-heading");
    refs.name.textContent = "Загрузка...";
    refs.name.classList.add("skeleton", "user-detail__skeleton-text");
    refs.email.textContent = "Загрузка...";
    refs.email.classList.add("skeleton", "user-detail__skeleton-text");
  },
});

const userPage: PageModule<User> = {
  // Декларативный loader с ключом кэша: fresh — отдаётся без повторного запроса,
  // stale (за пределами staleTime) — отдаётся сразу + фоновая revalidation,
  // expired/нет записи — ждём httpGet. Ключ включает :id, так что у каждого
  // пользователя своя запись кэша.
  loader: loader({
    key: (ctx) => ["user", ctx.params.id],
    load: (ctx) => api.httpGet<User>(`users/${ctx.params.id}`, ctx.signal),
    staleTime: 30_000,
  }),

  skeleton(container): void {
    UserSkeletonView(container, {});
  },

  render(container, data, ctx) {
    const instance = UserView(container, { id: ctx.params.id, user: data });
    return () => instance.destroy();
  },

  // Если loader упал (сеть/404), предыдущее дерево уничтожается и вместо
  // console.error+пустого DOM рендерится это.
  errorBoundary(container, _error, ctx) {
    const instance = UserErrorView(container, { id: ctx.params.id });
    return () => instance.destroy();
  },
};

export default userPage;
