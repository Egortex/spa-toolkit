/**
 * Минимальный примитив локального состояния — сознательно НЕ реактивный рантайм и
 * НЕ Virtual DOM: `subscribe()` — точечная подписка "значение → узел", вызываемая
 * синхронно при `set()`. Ничего не решает за автора компонента, что перерисовывать —
 * он сам пишет `state.subscribe(v => refs.name.textContent = v)`.
 */

/** Опции подписки на состояние. */
export interface StateSubscribeOptions {
	/** Если передан, подписка автоматически снимается при аборте сигнала (обычно — `ctx.signal`). */
	signal?: AbortSignal;
}

/** Функция отписки, возвращаемая `subscribe()`. */
export type Unsubscribe = () => void;

/** Примитив локального состояния, возвращаемый `createState()`. */
export interface State<T> {
	/** Текущее значение. */
	get(): T;
	/** Устанавливает новое значение (или вычисляет его из предыдущего) и синхронно уведомляет подписчиков. */
	set(next: T | ((prev: T) => T)): void;
	/**
	 * Подписывает `listener` на изменения значения; вызывается синхронно из `set()`.
	 * Если передан `options.signal`, подписка автоматически снимается при его аборте —
	 * так подписки, сделанные внутри `setup()`, отписываются вместе с `component.destroy()`.
	 */
	subscribe(listener: (value: T) => void, options?: StateSubscribeOptions): Unsubscribe;
}

/**
 * Создаёт минимальный примитив состояния: `get()`/`set()`/`subscribe()`.
 *
 * Не привязан к шаблону и ничего не перерисовывает сам — подписчики должны явно
 * мутировать нужные DOM-узлы (см. README, раздел «state»).
 */
export function createState<T>(initial: T): State<T> {
	let value = initial;
	const listeners = new Set<(value: T) => void>();

	return {
		get() {
			return value;
		},
		set(next) {
			value = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
			for (const listener of listeners) listener(value);
		},
		subscribe(listener, options) {
			listeners.add(listener);
			const unsubscribe: Unsubscribe = () => listeners.delete(listener);

			const signal = options?.signal;
			if (signal) {
				if (signal.aborted) unsubscribe();
				else signal.addEventListener("abort", unsubscribe, { once: true });
			}

			return unsubscribe;
		},
	};
}
