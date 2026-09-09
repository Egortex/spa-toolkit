type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

// Minimal ambient declaration so the dev-only NODE_ENV check below compiles without a `@types/node`
// devDependency; this package stays runtime dependency-free (CON-001).
declare const process: { env?: { NODE_ENV?: string } } | undefined;

/**
 * Applies `aria-invalid` to `input` based on `hasError`, and (when `hasError` is true) links it to
 * `errorElement` via `aria-describedby`, generating a stable `id` for `errorElement` if it doesn't
 * have one yet (`${field}-error`). When `hasError` is false, `aria-invalid` is removed and the
 * `aria-describedby` reference to the error element is removed (without touching other ids the
 * consumer may have added there) (REQ-010/REQ-011).
 */
export function applyFieldAccessibility(input: FieldElement, field: string, errorElement: HTMLElement | null, hasError: boolean): void {
	if (hasError) {
		input.setAttribute("aria-invalid", "true");
	} else {
		input.removeAttribute("aria-invalid");
	}

	if (!errorElement) return;

	if (!errorElement.id) errorElement.id = `${field}-error`;
	ensureErrorElementA11y(errorElement);

	const describedBy = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
	const withoutErrorId = describedBy.filter((id) => id !== errorElement.id);

	if (hasError) {
		input.setAttribute("aria-describedby", [...withoutErrorId, errorElement.id].join(" "));
	} else if (withoutErrorId.length > 0) {
		input.setAttribute("aria-describedby", withoutErrorId.join(" "));
	} else {
		input.removeAttribute("aria-describedby");
	}
}

/** Marks a field's error element as an accessible live region (`role="alert"`, `aria-live="polite"`), once. */
export function ensureErrorElementA11y(errorElement: HTMLElement): void {
	if (!errorElement.hasAttribute("role")) errorElement.setAttribute("role", "alert");
	if (!errorElement.hasAttribute("aria-live")) errorElement.setAttribute("aria-live", "polite");
}

/**
 * Focuses the first field (in DOM order, via `form.elements`, not schema key order) that has an
 * entry in `errors`. Does nothing beyond a single `.focus()` call — it never sets `tabindex` or
 * otherwise affects subsequent Tab/Shift+Tab navigation (REQ-012/REQ-013).
 */
export function focusFirstInvalidField(form: HTMLFormElement, errors: Record<string, string | undefined>): void {
	for (const element of Array.from(form.elements) as HTMLElement[]) {
		const name = element.getAttribute("name");
		if (!name || !errors[name]) continue;

		const focusable = element as unknown as { focus?: () => void };
		if (typeof focusable.focus === "function") focusable.focus();
		return;
	}
}

/**
 * Dev-only check (skipped when `process.env.NODE_ENV === "production"`): warns via `console.warn`
 * if a schema field's input has no associated `<label for="...">` in the form (REQ-014). Intended
 * to be tree-shaken out of production builds together with its call site.
 */
export function warnIfLabelMissing(form: HTMLFormElement, field: string): void {
	if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return;

	const element = form.elements.namedItem(field);
	if (!element || !(element instanceof HTMLElement)) return;

	const id = element.getAttribute("id");
	const hasLabelFor = id ? form.querySelector(`label[for="${id}"]`) !== null : false;
	const hasWrappingLabel = element.closest("label") !== null;
	const hasAriaLabel = element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");

	if (!hasLabelFor && !hasWrappingLabel && !hasAriaLabel) {
		console.warn(`[bind-form] Field "${field}" has no associated <label>. Add <label for="${id ?? field}"> for accessibility.`);
	}
}
