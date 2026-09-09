# @chepchik/spa-router

![coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Egortex/spa-toolkit/main/packages/spa-router/coverage-badge.json) ![size](https://img.shields.io/bundlephobia/minzip/@chepchik/spa-router)

Лёгкий клиентский роутер для SPA на History API без привязки к UI-фреймворку.
Страницы и layout'ы остаются обычными TypeScript-модулями, а роутер отвечает за
навигацию, code splitting, загрузку и кэширование данных, отмену устаревшей
работы, восстановление скролла и View Transitions.

## Возможности

- перехват внутренних ссылок и навигация через History API;
- динамические параметры маршрутов и fallback-маршрут `*`;
- ленивые страницы и цепочки вложенных layout'ов;
- типобезопасные именованные маршруты и генерация URL;
- guard'ы с поддержкой синхронного и асинхронного результата;
- обычные и декларативные loader'ы;
- query cache со stable keys, дедупликацией запросов и stale-while-revalidate;
- skeleton-разметка на время ожидания `loader`, если данных ещё нет ни в каком кэше;
- композиция loader'ов через `parallel`, `sequential` и `defer`;
- отмена устаревших навигаций через `AbortSignal`;
- наблюдение за атомарными фазами навигации;
- route-level и page-level error boundaries;
- redirects с защитой от циклических перенаправлений;
- prefetch по наведению и preload критичных маршрутов;
- восстановление позиции скролла при `popstate`;
- View Transitions с fallback и учётом `prefers-reduced-motion`.

> Живой пример: [`examples/oop-tasklist`](../../examples/oop-tasklist) использует
> `defineRoutes`/типобезопасный `navigate`/`route().href()`, `onPhaseChange`,
> декларативный `loader()` + `query()` (route-level data cache) и `errorBoundary`
> в реальном приложении — см. `app/pages/routes.ts`, `main.ts`,
> `app/layouts/users/index.layout.ts`, `app/pages/users/[id]/index.page.ts`.

## Установка

```sh
npm install @chepchik/spa-router
```

## Быстрый старт

```ts
import { Router, defineRoutes } from "@chepchik/spa-router";
import type { RouteDefinition } from "@chepchik/spa-router";

const names = defineRoutes({
  home: "/",
  task: "/tasks/:id",
  profile: "/profile",
});

const mainLayout = () => import("./layouts/main/index.layout");

const routes: RouteDefinition[] = [
  {
    path: "/",
    load: () => import("./pages/home/index.page"),
  },
  {
    path: "/tasks/:id",
    layout: mainLayout,
    load: () => import("./pages/tasks/[id]/index.page"),
  },
  {
    path: "/old-profile",
    redirectTo: "/profile",
    load: () => import("./pages/profile/index.page"),
  },
  {
    path: "*",
    load: () => import("./pages/notFound/index.page"),
  },
];

const app = document.querySelector<HTMLElement>("#app")!;
const router = new Router(routes, app, names);
router.start();
```

Обычная навигация по URL остаётся доступной:

```ts
router.navigate("/tasks/42");
router.navigate("/profile", { replace: true, state: { source: "login" } });
```

## Типобезопасные именованные маршруты

`defineRoutes` сохраняет литеральные типы путей. Методы `navigate`, `prefetch`
и `route().href()` проверяют имя маршрута и обязательные параметры во время
компиляции. Значения параметров автоматически URL-кодируются.

```ts
router.navigate("task", { id: 42 });
router.navigate("home", {});

const href = router.route("task").href({ id: "draft 1" });
// /tasks/draft%201

await router.prefetch("task", { id: 42 });

// Ошибка TypeScript: отсутствует id.
// router.navigate("task", {});
```

Для генерации пути без экземпляра роутера можно использовать `buildRoutePath`:

```ts
import { buildRoutePath } from "@chepchik/spa-router";

const href = buildRoutePath("/users/:userId/tasks/:taskId", {
  userId: 7,
  taskId: 12,
});
```

## Страница и контекст маршрута

```ts
import type { PageModule } from "@chepchik/spa-router";

interface Task {
  id: number;
  title: string;
}

const page: PageModule<Task> = {
  async loader(ctx) {
    const response = await fetch(`/api/tasks/${ctx.params.id}`, {
      signal: ctx.signal,
    });
    return response.json() as Promise<Task>;
  },

  guard(ctx) {
    return ctx.query.get("preview") !== "forbidden";
  },

  render(container, task, ctx) {
    container.textContent = `${task.title} (${ctx.path})`;

    return () => {
      // Удаление подписок и других ресурсов страницы.
    };
  },
};

export default page;
```

`RouteContext` содержит:

- `path` — pathname текущего маршрута;
- `params` — декодированные динамические параметры;
- `query` — экземпляр `URLSearchParams`;
- `signal` — сигнал отмены текущей фазы навигации.

Если новая навигация начинается до завершения старой, старый `signal`
прерывается, а её результат не попадает в DOM или кэш.

## Декларативные loader'ы и query cache

Функция `loader` связывает загрузку с устойчивым ключом кэша и временем
актуальности. Свежие данные переиспользуются, устаревшие показываются сразу и
обновляются в фоне. Одновременные запросы с одинаковым ключом дедуплицируются.

```ts
import { loader } from "@chepchik/spa-router";
import type { PageModule } from "@chepchik/spa-router";

interface User {
  id: string;
  name: string;
}

const page: PageModule<User> = {
  loader: loader({
    key: (ctx) => ["user", ctx.params.id],
    staleTime: 60_000,
    load: async (ctx) => {
      const response = await fetch(`/api/users/${ctx.params.id}`, {
        signal: ctx.signal,
      });
      return response.json() as Promise<User>;
    },
  }),

  render(container, user) {
    container.textContent = user.name;
  },
};

export default page;
```

Удалить конкретное значение из router cache можно через тот же ключ:

```ts
router.invalidate(["user", "42"]);
```

Низкоуровневые `query`, `QueryCache`, `defaultQueryCache` и
`serializeCacheKey` также экспортируются для использования вне маршрутов:

```ts
import { query } from "@chepchik/spa-router";

const result = await query({
  key: ["settings"],
  staleTime: 30_000,
  loader: () => fetch("/api/settings").then((response) => response.json()),
});

console.log(result.data, result.state, result.revalidation);
```

## Skeleton: временная разметка на время загрузки

Если у страницы есть `loader`, можно объявить `skeleton(container)` — он
рендерится сразу после монтирования layout'а, **но только если данных ждать
реально придётся**: `fresh`/`stale` попадание в кэш (см. выше) отдаётся
мгновенно, и в этом случае `skeleton` не вызывается вообще — показывать
нечего, ждать не нужно. На время показа `<body>` получает класс
`has-skeleton` (снимается автоматически перед финальным рендером или при
ошибке).

```ts
const page: PageModule<User> = {
  loader: loader({ key: (ctx) => ["user", ctx.params.id], load: fetchUser }),

  skeleton(container) {
    container.innerHTML = `<p class="skeleton">Загрузка…</p>`;
  },

  render(container, user) {
    container.textContent = user.name;
  },
};
```

`skeleton` — синхронная функция без доступа к `ctx`/данным: она не может
знать, что загружается, только то, что что-то загружается. Если страница
не определяет `skeleton`, во время ожидания `loader` контейнер просто не
трогается (текущее содержимое, если оно было, остаётся видимым до коммита).

## Композиция loader'ов

### Параллельная загрузка

`parallel` запускает независимые loader'ы одновременно и объединяет результаты.

```ts
import { parallel } from "@chepchik/spa-router";

const loadPage = parallel({
  user: (ctx: { signal: AbortSignal }) => loadUser(ctx.signal),
  notifications: (ctx: { signal: AbortSignal }) => loadNotifications(ctx.signal),
});
```

### Последовательная загрузка

`sequential` запускает шаги по порядку. Каждый шаг получает исходный `context`
и накопленный объект `data`.

```ts
import { sequential } from "@chepchik/spa-router";

const loadPage = sequential<{ userId: string }>(
  ({ context }) => loadUser(context.userId).then((user) => ({ user })),
  ({ data }) => loadPermissions(data.user).then((permissions) => ({ permissions })),
);
```

### Отложенная загрузка

`defer` помечает некритичные данные: первый commit не ждёт их завершения, а
страница повторно рендерится после получения результата.

```ts
import { defer } from "@chepchik/spa-router";

const loadRecommendations = defer((ctx: { userId: string }) =>
  fetch(`/api/users/${ctx.userId}/recommendations`).then((response) => response.json()),
);

const pageLoader = async (ctx: { userId: string }) => ({
  user: await loadUser(ctx.userId),
  recommendations: await loadRecommendations(ctx),
});
```

До завершения deferred loader соответствующее поле имеет значение `undefined`.
Ошибки фоновой загрузки не отменяют уже завершённый commit.

## Фазы навигации

`onPhaseChange` позволяет подключить глобальный индикатор загрузки, аналитику
или диагностику. Все события одной навигации содержат один объект `Navigation`.

```ts
const unsubscribe = router.onPhaseChange(({ phase, navigation }) => {
  console.log(phase, navigation.id, navigation.from.href, navigation.to.href);

  if (phase === "load") document.body.classList.add("is-loading");
  if (phase === "success" || phase === "error" || phase === "cancel") {
    document.body.classList.remove("is-loading");
  }
});

// Позже:
unsubscribe();
```

Доступные фазы: `resolve`, `guard`, `load`, `commit`, `transition`, `dispose`,
`cancel`, `error` и `success`.

Для упрощённого наблюдения доступны статусы `loading`, `success` и `error`:

```ts
const unsubscribe = router.onStatusChange((status) => {
  console.log("navigation status:", status);
});
```

## Layout'ы

Layout может быть один или несколько. Общий префикс цепочки переиспользуется:
для него вызывается `update`, а размонтируется только изменившийся хвост.

```ts
import type { LayoutModule } from "@chepchik/spa-router";

const layout: LayoutModule = {
  render(container, ctx) {
    container.innerHTML = `<header>App</header><main></main>`;
    const outlet = container.querySelector<HTMLElement>("main")!;

    return {
      outlet,
      update(nextCtx) {
        container.dataset.path = nextCtx.path;
      },
      cleanup() {
        // Очистка ресурсов layout'а.
      },
    };
  },
};

export default layout;
```

Для вложенных layout'ов укажите массив загрузчиков от внешнего к внутреннему:

```ts
const routes: RouteDefinition[] = [{
  path: "/admin/users/:id",
  layout: [
    () => import("./layouts/app.layout"),
    () => import("./layouts/admin.layout"),
  ],
  load: () => import("./pages/admin/user.page"),
}];
```

Чтобы layout переиспользовался между маршрутами, передавайте одну и ту же ссылку
на функцию-загрузчик, а не создавайте новую стрелочную функцию для каждого route.

## Guard'ы и redirects

Guard выполняется до loader и commit. Если он возвращает `false`, текущая
навигация отменяется. Guard может самостоятельно запустить перенаправление.

```ts
const profilePage: PageModule = {
  guard() {
    if (isAuthenticated()) return true;
    router.navigate("/login", { replace: true });
    return false;
  },
  render(container) {
    container.textContent = "Profile";
  },
};
```

Статический redirect задаётся в маршруте:

```ts
{
  path: "/account",
  redirectTo: "/profile",
  load: () => import("./pages/profile/index.page"),
}
```

Redirect'ы разрешаются до загрузки страницы. Циклы и слишком длинные цепочки
завершаются ошибкой вместо бесконечной навигации.

## Error boundaries

Boundary можно определить на странице или маршруте. Page-level boundary имеет
приоритет. Перед его вызовом текущая страница и layout'ы корректно очищаются.
Boundary также может вернуть функцию cleanup.

```ts
import type { ErrorBoundary, RouteDefinition } from "@chepchik/spa-router";

const renderError: ErrorBoundary = (container, error) => {
  container.textContent = error instanceof Error ? error.message : "Unknown error";
  return () => container.replaceChildren();
};

const routes: RouteDefinition[] = [{
  path: "/reports",
  load: () => import("./pages/reports/index.page"),
  errorBoundary: renderError,
}];
```

Route-level boundary способен обработать даже ошибку динамического импорта
страницы. Page-level boundary задаётся полем `errorBoundary` в `PageModule`.

## Prefetch и preload

Вызов `start()` включает prefetch внутренних ссылок после короткого наведения.
Маршруты с `preload: true` начинают загружать модуль сразу после старта, кроме
текущего маршрута.

```ts
await router.prefetch("/tasks/42");
await router.prefetch("task", { id: 42 });
```

Prefetch использует тот же кэш, что и навигация. Ошибки prefetch игнорируются:
обычная навигация повторит запрос.

## Атомарный commit и View Transitions

Роутер сначала завершает resolve, guard и критическую загрузку, затем атомарно
обновляет цепочку layout'ов и страницу. Устаревшая навигация не может выполнить
частичный commit поверх более новой.

Commit оборачивается в View Transitions API, если оно поддерживается браузером
и пользователь не включил `prefers-reduced-motion: reduce`. Функция
`runTransition` экспортируется и может использоваться отдельно.

## Ссылки, которые не перехватываются

Роутер оставляет стандартное поведение браузера для:

- внешних URL;
- ссылок с `target`, отличным от `_self`;
- ссылок с атрибутом `download`;
- ссылок с атрибутом `data-no-router`;
- кликов с модификаторами или не основной кнопкой мыши;
- уже обработанных событий (`defaultPrevented`).

## Публичные API

Основные экспорты пакета:

- `Router`, `defineRoutes`, `buildRoutePath`;
- `loader`, `query`, `QueryCache`, `defaultQueryCache`;
- `parallel`, `sequential`, `defer`;
- `matchPath`, `PageCache`;
- `LayoutChainManager`, `ScrollManager`, `HoverPrefetcher`;
- `runTransition`;
- типы `Navigation`, `NavigationPhase`, `RouteContext`, `PageModule`,
  `LayoutModule`, `RouteDefinition`, `ErrorBoundary`, `CacheKey` и другие.

## Тестирование

Тесты находятся в каталоге `tests`.

```sh
pnpm --filter @chepchik/spa-router test
pnpm --filter @chepchik/spa-router test:coverage
```

Набор тестов проверяет runtime-поведение и TypeScript-контракты. Для исходного
кода пакета установлен порог покрытия 100% по statements, branches, functions
и lines.
