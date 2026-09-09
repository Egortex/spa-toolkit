export function createForm(html: string): HTMLFormElement {
	const wrapper = document.createElement("div");
	wrapper.innerHTML = `<form>${html}</form>`;
	const form = wrapper.querySelector("form")!;
	document.body.appendChild(form);
	return form;
}

export function submit(form: HTMLFormElement): void {
	form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

export async function flush(times = 20): Promise<void> {
	for (let i = 0; i < times; i++) await Promise.resolve();
}
