# dom-template

![coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Egortex/spa-toolkit/main/packages/dom-template/coverage-badge.json) ![size](https://img.shields.io/bundlephobia/minzip/@chepchik/dom-template)

Что: `mountTemplate` — помощник, который вставляет HTML-строку (шаблон)
в DOM-контейнер и собирает все элементы с атрибутом `[ref]` в типизированный
объект ссылок, и `component()` — надстроенная поверх него мини-компонентная
система (`refs`/`props`/`state`/lifecycle/cleanup).

Зачем: чтобы не писать руками кучу `container.querySelector(...)` после
вставки разметки — достаточно пометить нужные элементы атрибутом `ref` в
самом шаблоне, и получить готовые ссылки на них одним вызовом. `component()`
добавляет сверху жизненный цикл mount/update/destroy с автоматической отменой
side-эффектов через `AbortSignal` — но при этом остаётся тонким слоем над
настоящим DOM: **никакого Virtual DOM и diff'а здесь нет** — `setup()` мутирует
реальные узлы напрямую.

> Живой пример: [`examples/oop-tasklist`](../../examples/oop-tasklist) — почти
> все страницы и оба layout'а (`app/pages/*/index.page.ts`,
> `app/layouts/*/index.layout.ts`) написаны на `component()`, а
> `app/layouts/users/index.layout.ts` дополнительно показывает `createState`
> (точечная подписка списка пользователей на перерисовку). `mountTemplate`
> напрямую остался в `app/components/component.ts` — внутри уже существовавшей
> OOP-обвязки (`Component`/`TaskManager`), которую не стали переводить на
> `component()` в этом проходе (другая модель владения жизненным циклом,
> см. README примера).

## Что выбрать: `mountTemplate` vs `component()` vs `createState`

| | `mountTemplate` | `component()` | `createState` |
|---|---|---|---|
| Что делает | Вставляет HTML-строку в контейнер, собирает `[ref]` в объект | Фабрика с жизненным циклом поверх `mountTemplate` | Значение + подписчики (`get`/`set`/`subscribe`), без DOM вообще |
| Единица работы | Разовая операция (вызвал — забыл) | Долгоживущий *экземпляр* (create → mount → update* → destroy) | Долгоживущее *значение*, не привязанное к какому-то одному компоненту |
| `refs` | Возвращает наружу (`result.refs`) | Видны только внутри `setup()`/`onUpdate` — наружу не отдаются | — |
| `props` / обновление данных | Нет — вставил заново вручную | `instance.update(nextProps)` без remount'а | `state.set(next)` |
| Отмена side-эффектов | Вручную (`removeEventListener`, отмена fetch и т.п. — сами) | `signal` в `setup()`, абортится в `destroy()` | Через `{ signal }` в `subscribe()`, если он передан |
| Уничтожение | Вручную: `nodes.forEach(n => n.remove())` | `instance.destroy()` — каскад (дети → abort → cleanup → remove) | Нет "уничтожения" — просто перестают подписываться/держать ссылку |
| Композиция (вложенные компоненты) | Нет встроенной поддержки | `mountChild()` с каскадным `destroy()` | — (можно шарить один `state` между несколькими `setup()`) |
| Когда использовать | Разовая вставка разметки без своей "жизни": статичный блок, одноразовая замена содержимого, список `<li>`, который целиком перерисовывается при каждом изменении (см. `TaskManager.displayTasks()` в примере) | Всё, что имеет жизненный цикл, совпадающий с чем-то внешним: страница/layout роутера (mount при заходе, destroy при уходе), виджет с `fetch`/подписками, которые обязаны отмениться при размонтировании | Значение, за которым нужно наблюдать: счётчик, список из API, флаг загрузки — особенно если несколько разных DOM-узлов (или несколько компонентов) должны реагировать на одно и то же изменение |

Правило по умолчанию: если внутри вашего кода после вставки шаблона появляется
`addEventListener`, `fetch` или что-то ещё, что нужно будет отменить/убрать
позже — берите `component()`, а не голый `mountTemplate` с ручным cleanup'ом.
Если разметка статична и никогда не обновляется без полного пересоздания —
`mountTemplate` достаточно, `component()` не даст никакой выгоды.

## Установка

```sh
npm install @chepchik/dom-template
```

## Использование

```ts
import { mountTemplate } from "@chepchik/dom-template";

interface Refs {
	title: HTMLHeadingElement;
	button: HTMLButtonElement;
}

const { refs } = mountTemplate<Refs>(
	container,
	`
  <h1 ref="title">Hello</h1>
  <button ref="button">Click</button>
`,
);

refs.button.addEventListener("click", () => {
	refs.title.textContent = "Clicked!";
});
```

### Списки ссылок: `ref="name[]"`

Если в шаблоне несколько элементов помечены одинаковым именем с суффиксом
`[]`, они собираются в массив — удобно для повторяющихся блоков (строки
списка, карточки и т.п.):

```ts
interface Refs {
	item: HTMLLIElement[];
}

const { refs } = mountTemplate<Refs>(
	list,
	`
  <li ref="item[]">First</li>
  <li ref="item[]">Second</li>
`,
);

refs.item.forEach((li) => li.classList.add("task"));
```

### Точка вставки: `options.position`

По умолчанию шаблон добавляется в конец контейнера (`"append"`). Доступны
также `"prepend"` (в начало) и `"replace"` (полностью заменить содержимое
контейнера):

```ts
mountTemplate(container, html, { position: "prepend" });
mountTemplate(container, html, { position: "replace" });
```

### Возвращаемые узлы: `result.nodes`

`mountTemplate` возвращает не только `refs`, но и `nodes` — массив корневых
узлов, вставленных в контейнер. Это удобно, если шаблон нужно позже удалить
целиком:

```ts
const { nodes } = mountTemplate(container, html);

// ...позже
nodes.forEach((node) => node.remove());
```

### Атрибут `ref` после вставки

По умолчанию `mountTemplate` удаляет атрибут `ref` у привязанных элементов
после сборки ссылок, чтобы он не оставался в финальном DOM. Чтобы оставить
атрибут как есть, передайте `removeRefAttribute: false`:

```ts
mountTemplate(container, html, { removeRefAttribute: false });
```

## ⚠️ Безопасность

`mountTemplate` вставляет `template` как настоящий DOM через
`Range.createContextualFragment`. Это означает, что встроенные обработчики
событий (`onclick="..."`) и другая исполняемая разметка из шаблона
**выполнятся**. Передавайте сюда только доверенные строки (статичные шаблоны
компонентов), а не значения, полученные напрямую от пользователя — иначе
это открывает XSS.

## Компоненты: `component()`

`component({ template, setup })` — фабрика мини-компонента поверх `mountTemplate`.
`setup()` вызывается один раз при монтировании и получает `refs`/`props`/`state`/`signal` —
никакого Virtual DOM и diff'а: `setup()` работает с настоящими DOM-узлами напрямую.

```ts
import { component } from "@chepchik/dom-template";

interface Refs {
	name: HTMLElement;
	button: HTMLButtonElement;
}

interface Props {
	userId: string;
}

const UserCard = component<Refs, Props>({
	template: `
		<div class="card">
			<span ref="name">…</span>
			<button ref="button">Reload</button>
		</div>
	`,
	setup({ refs, props, signal }) {
		refs.name.textContent = `Loading user ${props.userId}…`;

		fetch(`/api/users/${props.userId}`, { signal })
			.then((res) => res.json())
			.then((user) => {
				refs.name.textContent = user.name;
			})
			.catch((err) => {
				if (err.name === "AbortError") return; // компонент уже уничтожен — это ожидаемо
				refs.name.textContent = "Failed to load";
			});

		refs.button.addEventListener("click", () => refs.name.textContent = "Reloading…", { signal });
	},
	onUpdate(props, { refs }) {
		refs.name.textContent = `Loading user ${props.userId}…`;
	},
});

const card = UserCard(container, { userId: "42" });

// позже, без remount'а:
card.update({ userId: "43" });

// при размонтировании:
card.destroy();
```

### Жизненный цикл: `create → mount → setup → (update)* → destroy`

- `UserCard(container, props)` — монтирует шаблон (через `mountTemplate`), создаёт
  собственный `AbortController` для экземпляра и вызывает `setup({ refs, props, signal, state, mountChild })`
  ровно один раз.
- `instance.update(nextProps)` — мержит `nextProps` в живой (мутируемый) объект `props`
  и вызывает `onUpdate(props, ctx)` (если он определён), **не** пересоздавая DOM/`refs`/`AbortController`.
- `instance.destroy()`:
  1. каскадно уничтожает всех детей, смонтированных через `mountChild` (дети → родитель);
  2. вызывает `abortController.abort()` — сигнал, переданный в `setup()`, становится `aborted`;
  3. вызывает cleanup-функцию, возвращённую из `setup()` (если она есть);
  4. удаляет `nodes` компонента из DOM.

  `destroy()` идемпотентен — повторный вызов на уже уничтоженном экземпляре ничего не делает.
  `update()` на уже уничтоженном экземпляре бросает ошибку.

#### Методы и хуки жизненного цикла

| Стадия | Вызывает | Сигнатура | Когда срабатывает |
|---|---|---|---|
| **Create** | вы | `component(definition): ComponentFactory<TProps>` | Один раз при объявлении — ничего ещё не смонтировано, это просто фабрика |
| **Mount** | вы | `factory(container, initialProps): ComponentInstance<TProps>` | Вставляет шаблон, создаёт `AbortController`, вызывает `setup()` |
| ↳ хук | dom-template | `definition.setup(ctx: SetupContext<TRefs, TProps>): void \| (() => void)` | Один раз, синхронно, внутри вызова фабрики. Может вернуть cleanup-функцию |
| **Update** | вы | `instance.update(nextProps: Partial<TProps>): void` | Сколько угодно раз, пока экземпляр не уничтожен |
| ↳ хук | dom-template | `definition.onUpdate?(props: TProps, ctx: SetupContext<TRefs, TProps>): void` | Вызывается из `instance.update()`, если определён в `definition` |
| **Destroy** | вы | `instance.destroy(): void` | Один раз; идемпотентен (повторный вызов — no-op) |
| ↳ шаг 1 | dom-template | — | Уничтожает всех детей, смонтированных через `mountChild` (порядок: дети → родитель) |
| ↳ шаг 2 | dom-template | — | `abortController.abort()` — `signal`, переданный в `setup()`, становится `aborted` |
| ↳ шаг 3 | dom-template | вызывает cleanup, возвращённый `setup()` | Функция, которую вернул `setup()` (если вернул) |
| ↳ шаг 4 | dom-template | — | Удаляет `instance.nodes` из DOM |

Композиция и состояние — доступны только *внутри* `setup()`/`onUpdate` через `ctx`, отдельных вызовов "снаружи" нет:

| Что | Сигнатура (внутри `ctx`) | Зачем |
|---|---|---|
| `ctx.mountChild` | `mountChild(childFactory, container, props): ComponentInstance` | Монтирует дочерний компонент, регистрирует для каскадного `destroy()` |
| `ctx.state` | `state<T>(initial: T): State<T>` | То же самое, что импортированный `createState` — доступен прямо в `setup()` без импорта |
| `ctx.signal` | `AbortSignal` | Передавайте в `fetch`/`addEventListener`/`subscribe` для автоотмены при `destroy()` |

### Автоочистка side-эффектов через `AbortSignal`

Вместо того чтобы вручную писать `removeEventListener`/отменять запросы в cleanup-функции,
передавайте `signal` из `setup()` во все API, которые его поддерживают:

```ts
setup({ refs, signal }) {
	refs.button.addEventListener("click", onClick, { signal });
	fetch(url, { signal });
}
```

При `destroy()` эти обработчики/запросы отменяются автоматически — `signal` абортится,
и браузер сам снимает слушатель / отклоняет запрос с `AbortError`.

⚠️ **Ограничение**: `{ signal }` нативно поддерживают только API, которые сами это
реализуют (`fetch`, `addEventListener` — в достаточно свежих браузерах). "Голый"
`setTimeout`/`setInterval` `signal` не принимает — для них нужен явный паттерн-обёртка:

```ts
setup({ signal }) {
	const id = setTimeout(() => { /* ... */ }, 1000);
	signal.addEventListener("abort", () => clearTimeout(id));
}
```

Для ресурсов, которые вообще не выражаются через `AbortSignal` (например, отписка от
сторонней библиотеки без поддержки `signal`), верните cleanup-функцию из `setup()` —
она будет вызвана при `destroy()` вместе с `abort()`:

```ts
setup() {
	const subscription = thirdPartyLib.subscribe(...);
	return () => subscription.unsubscribe();
}
```

### `state`: точечная синхронизация без Virtual DOM

`state` в `setup()` — это фабрика `createState`, доступная прямо в контексте. Она
создаёт минимальный примитив состояния: `get()`/`set()`/`subscribe()`. Это **не**
реактивный шаблонизатор — `state` ничего не решает сам за вас, что перерисовывать.
Вы явно подписываете конкретный DOM-узел на конкретное значение:

```ts
setup({ refs, state, signal }) {
	const count = state(0);

	count.subscribe((value) => {
		refs.counter.textContent = String(value);
	}, { signal }); // автоотписка при destroy()

	refs.increment.addEventListener("click", () => {
		count.set((prev) => prev + 1);
	}, { signal });
}
```

`subscribe()` вызывается синхронно при каждом `set()`. Подписка, сделанная с опцией
`{ signal }`, автоматически снимается при аборте этого сигнала — то есть подписки,
созданные внутри `setup()` с `ctx.signal`, отписываются сами при `component.destroy()`.
Если `state` используется вне `setup()` (например, в module-level сторе), отписку нужно
делать вручную — вызвав функцию, которую возвращает `subscribe()`.

### Композиция: `mountChild`

Компоненты можно вкладывать друг в друга. Внутри `setup()` доступен `mountChild`,
который монтирует дочерний компонент и регистрирует его для каскадного `destroy()`:

```ts
const Avatar = component<{ img: HTMLImageElement }, { src: string }>({
	template: `<img ref="img" />`,
	setup({ refs, props }) {
		refs.img.src = props.src;
	},
});

const UserCard = component<{ avatarSlot: HTMLElement }, Props>({
	template: `<div><div ref="avatarSlot"></div></div>`,
	setup({ refs, props, mountChild }) {
		mountChild(Avatar, refs.avatarSlot, { src: props.avatarUrl });
	},
});
```

При `destroy()` родителя все дети, смонтированные через `mountChild`, уничтожаются
**первыми** (порядок: дети → родитель), до вызова cleanup-функции и удаления узлов
самого родителя.

⚠️ Если дочерний компонент монтируется вручную (напрямую вызовом его фабрики, а не
через `mountChild`), это не баг, а осознанная граница ответственности: `mountChild`
никогда об этом экземпляре не узнает, каскадный `destroy()` его не затронет — автор
компонента сам обязан вызвать `child.destroy()` (например, из cleanup-функции,
возвращённой `setup()`). `mountChild` — безопасный путь по умолчанию; ручное монтирование
используйте только когда вам нужен контроль над жизненным циклом ребёнка отдельно
от родителя.

## API

### `mountTemplate<TRefs>(container, template, options?): { refs: TRefs; nodes: ChildNode[] }`

- `container: HTMLElement` — куда вставить разметку.
- `template: string` — доверенная HTML-строка.
- `options?: MountTemplateOptions`
  - `position?: "append" | "prepend" | "replace"` — куда вставить фрагмент
    относительно контейнера. По умолчанию `"append"`.
  - `removeRefAttribute?: boolean` — удалять атрибут `[ref]` после сборки
    ссылок. По умолчанию `true`.
- Возвращает:
  - `refs: TRefs` — объект, где ключи — имена из атрибутов `ref`, а значения —
    соответствующие DOM-элементы (`ref="name"`) или массивы элементов
    (`ref="name[]"`).
  - `nodes: ChildNode[]` — корневые узлы, вставленные в контейнер.

Если один и тот же одиночный `ref` встречается в шаблоне несколько раз, или
одно и то же имя используется и как одиночная ссылка, и как список —
`mountTemplate` бросает ошибку.

### `component<TRefs, TProps>(definition): ComponentFactory<TProps>`

- `definition.template: string` — та же семантика `[ref]`/`[ref][]`, что и в `mountTemplate`.
- `definition.setup(ctx: SetupContext<TRefs, TProps>): void | (() => void)` — вызывается один
  раз при монтировании; может вернуть cleanup-функцию.
- `definition.onUpdate?(props: TProps, ctx): void` — вызывается из `instance.update(props)`.
- `ctx: SetupContext<TRefs, TProps>`: `{ refs, props, signal, state, mountChild }`.
- Возвращает фабрику `(container: HTMLElement, props: TProps) => ComponentInstance<TProps>`.
- `ComponentInstance<TProps>`: `{ nodes, update(nextProps: Partial<TProps>), destroy() }`.

### `createState<T>(initial: T): State<T>`

- Возвращает `{ get(), set(next), subscribe(listener, options?) }`.
- `set(next: T | ((prev: T) => T))` — синхронно уведомляет всех подписчиков.
- `subscribe(listener, { signal? })` — возвращает функцию отписки; если передан `signal`,
  подписка снимается автоматически при его аборте.
