/**
 * Inserts an HTML template into a container and collects elements with a [ref]
 * attribute into a typed object — a lightweight alternative to querySelector calls.
 */
export function mountTemplate<TRefs extends Record<string, HTMLElement> = Record<string, HTMLElement>>(
	container: HTMLElement,
	template: string,
): TRefs {
	const fragment = document.createRange().createContextualFragment(template);

	const refs = Array.from(fragment.querySelectorAll<HTMLElement>("[ref]")).reduce(
		(acc, elem) => {
			const refName = elem.getAttribute("ref");
			if (refName) acc[refName] = elem;
			return acc;
		},
		{} as Record<string, HTMLElement>,
	) as TRefs;

	container.appendChild(fragment);
	return refs;
}
