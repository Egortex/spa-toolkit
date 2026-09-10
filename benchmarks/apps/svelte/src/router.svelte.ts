// Tiny hand-rolled pushState router (idiomatic Svelte 5 runes), see SPEC.md's
// note that a framework without a "batteries included" router may hand-roll a
// simple pushState-based one instead of pulling in a routing library.

function normalize(pathname: string): string {
	if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
	return pathname || "/";
}

class RouterState {
	path = $state(normalize(window.location.pathname));
}

export const routerState = new RouterState();

export function navigate(path: string): void {
	const normalized = normalize(path);
	if (normalized === routerState.path) return;
	window.history.pushState({}, "", normalized);
	routerState.path = normalized;
}

window.addEventListener("popstate", () => {
	routerState.path = normalize(window.location.pathname);
});

// Intercept clicks on same-origin, root-relative <a href="/..."> links so
// in-app navigation is a pushState transition, not a full page reload.
document.addEventListener("click", (event: MouseEvent) => {
	if (event.defaultPrevented || event.button !== 0) return;
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

	const anchor = (event.target as HTMLElement).closest("a");
	if (!anchor) return;
	if (anchor.target && anchor.target !== "") return;
	if (anchor.hasAttribute("download")) return;

	const href = anchor.getAttribute("href");
	if (!href || !href.startsWith("/") || href.startsWith("//")) return;

	event.preventDefault();
	navigate(href);
});
