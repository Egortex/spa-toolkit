# dom-template

Что: один помощник `mountTemplate`, который вставляет HTML-строку (шаблон)
в DOM-контейнер и собирает все элементы с атрибутом `[ref]` в типизированный
объект ссылок.

Зачем: чтобы не писать руками кучу `container.querySelector(...)` после
вставки разметки — достаточно пометить нужные элементы атрибутом `ref` в
самом шаблоне, и получить готовые ссылки на них одним вызовом.

## Установка

```sh
npm install dom-template
```

## Использование

```ts
import { mountTemplate } from "dom-template";

interface Refs {
	title: HTMLHeadingElement;
	button: HTMLButtonElement;
}

const refs = mountTemplate<Refs>(
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

## API

### `mountTemplate<TRefs>(container, template): TRefs`

- `container: HTMLElement` — куда вставить разметку.
- `template: string` — HTML-строка.
- Возвращает объект, где ключи — значения атрибутов `ref`, а значения —
  соответствующие DOM-элементы.
