/**
 * Inserts an HTML template into a container and collects elements with a [ref]
 * attribute into a typed object — a lightweight alternative to querySelector calls.
 */

export type RefsMap = Record<string, HTMLElement | HTMLElement[]>;

export interface MountTemplateOptions {
	/** Куда вставить фрагмент относительно контейнера. По умолчанию `"append"`. */
	position?: "append" | "prepend" | "replace";
	/** Удалять ли атрибут `[ref]` у привязанных элементов после сборки. По умолчанию `true`. */
	removeRefAttribute?: boolean;
}

export interface MountTemplateResult<TRefs extends RefsMap> {
	/** Типизированные ссылки на элементы с атрибутом `[ref]`. */
	refs: TRefs;
	/** Корневые узлы, вставленные в контейнер — пригодны для последующего удаления. */
	nodes: ChildNode[];
}

/**
 * Вставляет HTML-шаблон в контейнер и собирает ссылки на элементы с атрибутом `[ref]`.
 *
 * - `ref="name"` — одиночная ссылка, `refs.name: HTMLElement`.
 * - `ref="name[]"` — ссылка-список, `refs.name: HTMLElement[]` (для повторяющихся элементов).
 *
 * ⚠️ `template` должен быть доверенной строкой — он вставляется как реальный DOM
 * (включая обработчики вида `onclick`), поэтому не передавайте сюда пользовательский ввод
 * без предварительной санитизации.
 */
export function mountTemplate<TRefs extends RefsMap = Record<string, HTMLElement>>(
	container: HTMLElement,
	template: string,
	options: MountTemplateOptions = {},
): MountTemplateResult<TRefs> {
	const { position = "append", removeRefAttribute = true } = options;
	const fragment = document.createRange().createContextualFragment(template);

	const refs: RefsMap = {};
	for (const elem of fragment.querySelectorAll<HTMLElement>("[ref]")) {
		const rawName = elem.getAttribute("ref");
		if (!rawName) continue;

		const isList = rawName.endsWith("[]");
		const refName = isList ? rawName.slice(0, -2) : rawName;

		if (isList) {
			const list = refs[refName];
			if (Array.isArray(list)) list.push(elem);
			else if (list === undefined) refs[refName] = [elem];
			else throw new Error(`mountTemplate: ref "${refName}" is used both as a single element and as a list ("${rawName}")`);
		} else {
			if (refName in refs) throw new Error(`mountTemplate: duplicate ref "${refName}"`);
			refs[refName] = elem;
		}

		if (removeRefAttribute) elem.removeAttribute("ref");
	}

	const nodes = Array.from(fragment.childNodes);

	if (position === "replace") container.replaceChildren(fragment);
	else if (position === "prepend") container.prepend(fragment);
	else container.appendChild(fragment);

	return { refs: refs as TRefs, nodes };
}
