# spa-toolkit

Набор маленьких независимых пакетов без зависимостей для SPA на чистом
TypeScript: роутер, биндинг форм и помощник для работы с DOM-шаблонами.
Каждый пакет можно использовать отдельно.

## Пакеты

| Пакет (npm)                                       | Описание                                                                                                      | README                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`@chepchik/spa-router`](packages/spa-router)     | Лёгкий клиентский роутер: History API, вложенные layout'ы, loader'ы, guard'ы, кэш, prefetch, View Transitions | [packages/spa-router/README.md](packages/spa-router/README.md)     |
| [`@chepchik/bind-form`](packages/bind-form)       | Биндинг формы: обработка submit, валидация по схеме, показ ошибок                                             | [packages/bind-form/README.md](packages/bind-form/README.md)       |
| [`@chepchik/dom-template`](packages/dom-template) | Вставка HTML-шаблона в DOM со сбором `[ref]`-элементов в типизированный объект                                | [packages/dom-template/README.md](packages/dom-template/README.md) |

## Примеры

В [`examples/oop-tasklist`](examples/oop-tasklist) — приложение на всех трёх
пакетах (типобезопасные маршруты и query cache из `spa-router`, `createForm`
из `bind-form`, `component()` из `dom-template`). Живёт прямо в этом
монорепозитории (workspace-пакет, не submodule) и всегда собирается против
текущего кода `packages/*` — см. [examples/oop-tasklist/README.md](examples/oop-tasklist/README.md).

## Разработка

Монорепозиторий на [pnpm workspaces](https://pnpm.io/workspaces).

```sh
pnpm install
pnpm build   # собрать все пакеты (packages/*)
pnpm test    # прогнать тесты всех пакетов
```

Каждый пакет собирается через Vite в `dist/` и публикуется в npm
независимо — см. [Публикация в npm](#публикация-в-npm).

## Публикация в npm

Публикация выполняется через GitHub Actions
([.github/workflows/publish.yml](.github/workflows/publish.yml)) при
создании git-тега вида `<пакет>-v<версия>`, например:

- `spa-router-v0.1.0`
- `bind-form-v0.1.0`
- `dom-template-v0.1.0`

### Как выпустить новую версию пакета

1. Убедиться, что рабочая директория чистая (всё закоммичено).
2. Запустить:
   ```sh
   pnpm release -- <spa-router|bind-form|dom-template> <patch|minor|major>
   ```
   Скрипт ([scripts/release.mjs](scripts/release.mjs)) поднимет версию в
   `packages/<пакет>/package.json`, закоммитит её и создаст тег
   `<пакет>-v<версия>`.
3. Запушить коммит и тег — это запустит публикацию:
   ```sh
   git push origin main <пакет>-v<версия>
   ```
4. Workflow соберёт пакет (`pnpm build`) и опубликует его в npm
   (`npm publish --provenance`) с правами `public`.

### Настройка (один раз)

Публикация идёт через npm **Trusted Publishing** (OIDC) — без долгоживущего
токена в секретах репозитория. Для каждого из трёх пакетов на npmjs.com:
Settings → Trusted Publisher → GitHub Actions → указать этот репозиторий
(`Egortex/spa-toolkit`) и workflow-файл (`publish.yml`).
