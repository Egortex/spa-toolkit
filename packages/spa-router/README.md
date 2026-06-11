# spa-router

Что: лёгкий клиентский роутер для SPA на History API. Перехватывает клики
по внутренним ссылкам, сопоставляет путь с маршрутами, лениво загружает
страницы и layout'ы (code splitting), поддерживает loader'ы (загрузка
данных перед рендером), guard'ы (проверка доступа), кэш с
stale-while-revalidate, hover-prefetch, восстановление скролла и плавные
переходы через View Transitions API.

Зачем: чтобы организовать навигацию без перезагрузки страницы и без
тяжёлого SPA-фреймворка — каждая страница и layout это просто модуль с
`render`/`loader`/`guard`, а роутер берёт на себя матчинг маршрутов,
загрузку данных, кэширование и UX-детали (skeleton, скролл, transitions).

## Установка

```sh
npm install @chepchik/spa-router
```

## Использование

```ts
import { Router } from "@chepchik/spa-router";
import type { RouteDefinition } from "@chepchik/spa-router";

const routes: RouteDefinition[] = [
	{
		path: "/",
		load: () => import("./pages/home/index.page"),
	},
	{
		path: "/tasks/:id",
		load: () => import("./pages/tasks/[id]/index.page"),
		layout: () => import("./layouts/main/index.layout"),
	},
	{
		path: "*",
		load: () => import("./pages/notFound/index.page"),
	},
];

const router = new Router(routes, document.querySelector("#app")!);
router.onStatusChange((status) => console.log("nav status:", status));
router.start();
```

## Контракты модулей

Каждый `PageModule` (страница) описывает:

- `loader?(ctx)` — загружает данные перед рендером (поддерживает кэш и prefetch).
- `guard?(ctx)` — проверяет доступ к маршруту; при `false` сам выполняет редирект.
- `skeleton?(container)` — временная заглушка, пока `loader` ещё не завершился.
- `render(container, data, ctx)` — рендер страницы; может вернуть функцию
  очистки, вызываемую перед уходом со страницы.

Каждый `LayoutModule` (общий "каркас": шапка, меню) описывает:

- `render(container, ctx)` — возвращает `LayoutRenderResult`:
  - `outlet` — элемент, в который роутер вставит текущую страницу/вложенный layout;
  - `update?(ctx)` — вызывается на каждой навигации, если layout не пересоздаётся;
  - `cleanup?()` — вызывается перед размонтированием layout'а.

`RouteDefinition.layout` может быть одним загрузчиком layout'а или массивом
(цепочка вложенных layout'ов). Роутер сравнивает цепочки по ссылкам на
функции и пересоздаёт только изменившийся "хвост".

## Структура пакета

- **Router.ts** — основной класс `Router`, связывающий все модули в единый
  цикл навигации: клик/popstate -> матчинг маршрута -> guard -> loader
  (с учётом кэша) -> монтирование layout'ов и страницы -> восстановление скролла.
- **match.ts** — `matchPath(pattern, pathname)`: сопоставление шаблона
  маршрута (`/tasks/:id`) с реальным путём и извлечение параметров.
  Чистая функция, используется в `Router.resolve`.
- **cache.ts** — `PageCache`: in-memory кэш результатов `loader()` с TTL и
  поддержкой stale-while-revalidate (устаревшие данные показываются сразу,
  пока в фоне грузятся свежие).
- **layoutChain.ts** — `LayoutChainManager` и `toLayoutChain`: монтирование
  и переиспользование цепочки вложенных layout'ов между навигациями
  (общий префикс переиспользуется, изменившийся хвост — пересоздаётся).
- **prefetch.ts** — `preloadCriticalRoutes` (предзагрузка маршрутов с
  `preload: true` сразу после старта) и `HoverPrefetcher` (предзагрузка
  данных страницы по наведению на ссылку, с задержкой `PREFETCH_HOVER_DELAY_MS`).
- **scroll.ts** — `ScrollManager`: запоминает и восстанавливает позицию
  скролла между навигациями (для кнопок назад/вперёд).
- **transitions.ts** — `runTransition(update)`: обёртка над View Transitions
  API для плавной смены содержимого страницы (с фолбэком и учётом
  `prefers-reduced-motion`).
- **types.ts** — публичные типы/контракты: `PageModule`, `LayoutModule`,
  `RouteDefinition`, `RouteContext` и т.д.
