/**
 * Мини-компонентная система поверх `mountTemplate` — НЕ Virtual DOM: `setup()`
 * работает с настоящими DOM-узлами напрямую (`refs.name.textContent = ...`,
 * `refs.button.addEventListener(...)`), никакого diff'а и виртуального дерева нет.
 *
 * Каждый смонтированный экземпляр получает собственный `AbortController` —
 * его `signal` передаётся в `setup()` и абортится при `destroy()`, автоматически
 * отменяя все `fetch`/`addEventListener`/подписки, зарегистрированные через
 * этот `signal` — без необходимости вручную перечислять их в cleanup-функции.
 */

import { mountTemplate, type MountTemplateResult, type RefsMap } from "./mountTemplate";
import { createState } from "./state";

/** Функция очистки, которую может вернуть `setup()` для ресурсов, не выражаемых через `AbortSignal`. */
export type CleanupFn = () => void;

/** Контекст, передаваемый в `setup()` и `onUpdate()`. */
export interface SetupContext<TRefs extends RefsMap, TProps> {
	/** Типизированные ссылки на элементы с атрибутом `[ref]` из `template`. */
	refs: TRefs;
	/** Живой (мутируемый) объект props — отражает последние значения, переданные в `instance.update()`. */
	props: TProps;
	/** Сигнал, абортящийся при `instance.destroy()` — передавайте его в `fetch`/`addEventListener`/и т.п. */
	signal: AbortSignal;
	/**
	 * Фабрика минимального примитива состояния (см. `createState` в `./state`), доступная
	 * прямо в `setup()`: `const count = state(0); count.subscribe(v => ..., { signal });`.
	 * Не связана с шаблоном автоматически — точечная синхронизация "значение → узел".
	 */
	state: typeof createState;
	/**
	 * Монтирует дочерний компонент внутрь указанного контейнера и регистрирует его
	 * для каскадного `destroy()`: при уничтожении текущего экземпляра все дети,
	 * смонтированные через `mountChild`, уничтожаются первыми (порядок: дети → родитель).
	 */
	mountChild<TChildProps>(
		childFactory: ComponentFactory<TChildProps>,
		container: HTMLElement,
		props: TChildProps,
	): ComponentInstance<TChildProps>;
}

/** Описание компонента: шаблон разметки и функция инициализации. */
export interface ComponentDefinition<TRefs extends RefsMap, TProps> {
	/** HTML-строка шаблона — та же семантика `[ref]`/`[ref][]`, что и в `mountTemplate`. */
	template: string;
	/** Вызывается один раз при монтировании экземпляра. Может вернуть cleanup-функцию. */
	setup(ctx: SetupContext<TRefs, TProps>): void | CleanupFn;
	/** Вызывается из `instance.update(nextProps)`, без пересоздания DOM/refs/AbortController. */
	onUpdate?(props: TProps, ctx: SetupContext<TRefs, TProps>): void;
}

/** Смонтированный экземпляр компонента. */
export interface ComponentInstance<TProps> {
	/** Корневые узлы, вставленные в контейнер (то же, что `MountTemplateResult.nodes`). */
	nodes: ChildNode[];
	/**
	 * Обновляет `props` уже смонтированного экземпляра без remount'а: мержит переданные
	 * поля в живой объект `props` и вызывает `onUpdate` (если он определён в `ComponentDefinition`).
	 */
	update(nextProps: Partial<TProps>): void;
	/**
	 * Уничтожает экземпляр: сперва каскадно уничтожает всех детей, смонтированных через
	 * `mountChild` (дети → родитель), затем абортит `signal`, затем вызывает cleanup-функцию,
	 * возвращённую из `setup()` (если есть), и наконец удаляет `nodes` из DOM.
	 *
	 * Идемпотентна: повторный вызов `destroy()` на уже уничтоженном экземпляре — no-op.
	 */
	destroy(): void;
}

/** Фабричная функция, возвращаемая `component()`: монтирует компонент в контейнер. */
export type ComponentFactory<TProps> = (container: HTMLElement, props: TProps) => ComponentInstance<TProps>;

/**
 * Создаёт фабрику компонента поверх `mountTemplate`: `template`/`refs` собираются
 * через существующий `mountTemplate(container, definition.template, { removeRefAttribute: true })`,
 * `setup()` вызывается один раз при монтировании с `{ refs, props, signal, mountChild }`.
 *
 * Компонент — не Virtual DOM: DOM остаётся настоящим DOM, `setup()`/подписчики `state`
 * мутируют его напрямую.
 */
export function component<TRefs extends RefsMap, TProps = Record<string, never>>(
	definition: ComponentDefinition<TRefs, TProps>,
): ComponentFactory<TProps> {
	return (container: HTMLElement, initialProps: TProps): ComponentInstance<TProps> => {
		const abortController = new AbortController();
		const props: TProps = { ...initialProps };
		const children: ComponentInstance<unknown>[] = [];

		const mounted: MountTemplateResult<TRefs> = mountTemplate<TRefs>(container, definition.template, {
			removeRefAttribute: true,
		});

		const ctx: SetupContext<TRefs, TProps> = {
			refs: mounted.refs,
			props,
			signal: abortController.signal,
			state: createState,
			mountChild(childFactory, childContainer, childProps) {
				const child = childFactory(childContainer, childProps);
				children.push(child as ComponentInstance<unknown>);
				return child;
			},
		};

		const cleanup = definition.setup(ctx) ?? undefined;

		let destroyed = false;

		return {
			nodes: mounted.nodes,
			update(nextProps: Partial<TProps>) {
				if (destroyed) throw new Error("component: cannot update a destroyed instance");
				Object.assign(props as object, nextProps as object);
				definition.onUpdate?.(props, ctx);
			},
			destroy() {
				if (destroyed) return;
				destroyed = true;

				for (const child of children.splice(0)) child.destroy();

				abortController.abort();
				cleanup?.();

				for (const node of mounted.nodes) node.remove();
			},
		};
	};
}
