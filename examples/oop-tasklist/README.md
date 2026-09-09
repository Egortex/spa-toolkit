# OOP Task List

SPA-приложение со списком задач на Vanilla TypeScript — живой пример
использования всех трёх пакетов `spa-toolkit`: типобезопасный роутер
([`@chepchik/spa-router`](../../packages/spa-router)), typed-форма с
валидацией и accessibility ([`@chepchik/bind-form`](../../packages/bind-form))
и вставка шаблонов ([`@chepchik/dom-template`](../../packages/dom-template)).
Плюс Express-сервер для API и статики, Tailwind CSS + SCSS для стилей.

Это workspace-пакет внутри монорепозитория `spa-toolkit` (не отдельный
репозиторий и не git submodule): зависимости на `@chepchik/*` объявлены как
`workspace:*`, поэтому пример всегда собирается против текущего кода
`packages/*`, а не против опубликованной npm-версии.

Подробное описание архитектуры — см. [ARCHITECTURE.md](./ARCHITECTURE.md).

## Что здесь показано из 0.2.0

### spa-router

- **Типобезопасные маршруты** — `defineRoutes` в [app/pages/routes.ts](app/pages/routes.ts),
  `router.navigate('users.detail', { id })` / `router.route(name).href(params)` вместо строк
  ([main.ts](main.ts)).
- **Навигационные фазы** — `router.onPhaseChange` в [main.ts](main.ts) поверх уже
  использовавшегося `onStatusChange`.
- **Route-level data cache** — `query()` вместо ручного модульного кэша в
  [app/layouts/users/index.layout.ts](app/layouts/users/index.layout.ts) (список пользователей,
  `staleTime: 30_000`, stale-while-revalidate) и декларативный `loader()` с ключом кэша в
  [app/pages/users/[id]/index.page.ts](app/pages/users/[id]/index.page.ts).
- **`errorBoundary`** — та же страница `/users/:id`: если `loader` упадёт (сеть/404), вместо
  `console.error` рендерится `UserErrorView`.

### bind-form

- **`createForm`** — везде, где раньше был `bindForm`: [app/pages/login](app/pages/login/index.page.ts),
  [app/pages/form-demo](app/pages/form-demo/index.page.ts),
  [app/components/task/TaskManager.ts](app/components/task/TaskManager.ts).
- **Типизированные значения** — `age: number` в форме регистрации (`type: "number"` в схеме),
  не строка.
- **Пайплайн `sync → async → server`** — на странице `/form-demo`: async-проверка занятости
  имени пользователя (поле `username`, стадия `async`) отдельно от серверной ошибки email
  через `FormSubmitError`/`errorMessages` (стадия `server`, срабатывает на submit) — обе видно
  в одной форме, но на разных стадиях пайплайна.
- **Accessibility из коробки** — `aria-invalid`/`aria-describedby`/автофокус на невалидное поле
  работают на всех формах без дополнительной настройки (это поведение `createForm` по умолчанию).

### dom-template

- **`component()`** — почти все страницы и оба layout'а
  (`app/pages/*/index.page.ts`, `app/layouts/*/index.layout.ts`).
- **`createState`** — [app/layouts/users/index.layout.ts](app/layouts/users/index.layout.ts):
  список пользователей как `State<User[] | null>`, точечная подписка перерисовывает сайдбар.
- **Композиция `component()` + существующий OOP-слой** — [app/pages/tasks/index.page.ts](app/pages/tasks/index.page.ts)
  монтирует страницу через `component()`, а внутри `setup()` создаёт `TaskManager`/`SearchPanel`
  (класс `Component` из [app/components/component.ts](app/components/component.ts) — этот слой
  **не** переведён на `component()`: у `TaskManager`/`SearchPanel` богатый публичный API
  (`getTasks`/`searchTasks`/`triggerEvent`), которым пользуются друг друга, и создаются они
  заново при каждом заходе на `/tasks`, а не как app-shell-синглтоны. Переписывать эту связку
  под контракт `component()` (`{nodes, update, destroy}`) в рамках этого прохода не стали —
  это осознанная граница, а не недосмотр. Прямой `mountTemplate` также остался в
  `TaskManager.displayTasks()` (перерисовка списка `<li>` на каждое изменение — разовая
  операция без lifecycle-выгоды от `component()`).

## Стек

- **Vite 8** — сборка и dev-сервер клиента
- **TypeScript 6** (strict, без `any`)
- **Express 5** — API и раздача статики/SPA fallback
- **Tailwind CSS 4** + **SCSS** — стили

## Требования

- Node.js 22+
- pnpm (см. корневой [README.md](../../README.md#разработка))

## Установка

Из корня монорепозитория (устанавливает зависимости для всех пакетов и
примеров сразу):

```bash
pnpm install
```

## Разработка

Запускает одновременно клиент (Vite, порт 5173) и сервер (Express, порт 3001),
с проксированием `/api` с клиента на сервер:

```bash
pnpm --filter oop-tasklist-example run dev
```

Открыть http://localhost:5173

## Сборка и продакшн-запуск

```bash
pnpm --filter oop-tasklist-example run build   # сборка клиента в dist/
pnpm --filter oop-tasklist-example run start   # запуск Express-сервера (отдаёт dist/ + API)
```

Открыть http://localhost:3001

## Проверка типов

```bash
pnpm --filter oop-tasklist-example run typecheck
```

## Запуск через Docker

```bash
docker compose up --build
```

Приложение будет доступно на http://localhost:3001.

## Структура проекта

```
app/
  session/       # хранение/проверка токена авторизации (localStorage) — не роутер,
                  # сам роутер теперь приходит из @chepchik/spa-router
  layouts/       # общие layout'ы (шапка/навигация), переиспользуются между страницами
  pages/         # страницы (file-based маршрутизация), у каждой свой .html/.scss/.page.ts
  components/    # переиспользуемые UI-компоненты (Component, TaskManager, SearchPanel, ...)
  services/      # ApiService — обёртка над axios
  assets/style/  # глобальные стили (тема, Tailwind)
server/
  index.ts       # Express-приложение: API, статика, SPA fallback
  middleware/     # логгер запросов, проверка авторизации
  data/          # статичный контент страниц (home/about)
main.ts          # точка входа клиента
```

## Демо-авторизация

Для страницы `/login` используйте логин `admin` / пароль `admin`.
Токен хранится в `localStorage` и проверяется guard'ом страницы `/profile`.

## Дальнейшие задачи (TODO)

- ~~Сделать по нажатию на Enter добавление задачи~~ — готово (форма задач через `createForm`)
- ~~Preload критичных маршрутов, skeleton-состояния, stale-while-revalidate~~ — готово (см. [ARCHITECTURE.md](./ARCHITECTURE.md#22-роутер--approuter))
- ~~Параллельная загрузка layout/page-модулей и отмена устаревших запросов через AbortSignal~~ — готово (см. [ARCHITECTURE.md](./ARCHITECTURE.md#22-роутер--approuter))
- ~~Вложенные маршруты / master-detail для `/users` → `/users/:id`~~ — готово (см. [ARCHITECTURE.md](./ARCHITECTURE.md#23-layouts--applayouts))
- ~~View Transitions, прогресс-бар вместо затемнения, debounce для prefetch~~ — готово (см. [ARCHITECTURE.md](./ARCHITECTURE.md#22-роутер--approuter))
- Добавить поиск
- Добавить фильтрацию
