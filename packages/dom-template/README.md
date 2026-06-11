# dom-template

Что: один помощник `mountTemplate`, который вставляет HTML-строку (шаблон)
в DOM-контейнер и собирает все элементы с атрибутом `[ref]` в типизированный
объект ссылок.

Зачем: чтобы не писать руками кучу `container.querySelector(...)` после
вставки разметки — достаточно пометить нужные элементы атрибутом `ref` в
самом шаблоне, и получить готовые ссылки на них одним вызовом.

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
