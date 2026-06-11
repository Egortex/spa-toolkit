import type { LayoutLoader, LayoutRenderResult, RouteContext } from "./types";

/** A mounted layout: a reference to its loader (for diffing) and its render result. */
export interface MountedLayout {
	loader: LayoutLoader;
	result: LayoutRenderResult;
}

/** Normalizes `RouteDefinition.layout` (a single layout, a chain, or none) into an array. */
export function toLayoutChain(layout: LayoutLoader | LayoutLoader[] | undefined): LayoutLoader[] {
	if (!layout) return [];
	return Array.isArray(layout) ? layout : [layout];
}

/**
 * Manages the currently mounted chain of layouts: computes the common prefix
 * with the new chain, unmounts the "tail", reuses matching layouts (calling
 * their `update()`) and mounts the new ones.
 */
export class LayoutChainManager {
	private chain: MountedLayout[] = [];

	/** Length of the common prefix of the current and new chains (compared by `LayoutLoader` references). */
	commonPrefixLength(layoutChain: LayoutLoader[]): number {
		let common = 0;
		while (
			common < this.chain.length &&
			common < layoutChain.length &&
			this.chain[common].loader === layoutChain[common]
		) {
			common++;
		}
		return common;
	}

	/** The `outlet` of the last mounted layout, or `fallback` if the chain is empty. */
	lastOutlet(fallback: HTMLElement): HTMLElement {
		return this.chain.length > 0 ? this.chain[this.chain.length - 1].result.outlet : fallback;
	}

	/**
	 * Ensures the required layout chain is mounted into `container` and returns
	 * the `outlet` of the last one — the element the current page should render into.
	 *
	 * `common` is the length of the common prefix of the current and new chains
	 * (compared by `LayoutLoader` references). Layouts in the common prefix are not
	 * recreated — only their `update()` is called (e.g. to highlight the active link).
	 * Layouts past the prefix are unmounted (`cleanup()`), and new ones are mounted
	 * one by one, each into the `outlet` of the previous one.
	 *
	 * `onUnmountTail` is called before unmounting the "tail" — gives the router a
	 * chance to clean up the current page before its layouts' markup is cleared.
	 */
	async mount(
		layoutChain: LayoutLoader[],
		common: number,
		ctx: RouteContext,
		layoutModulePromises: Map<LayoutLoader, ReturnType<LayoutLoader>>,
		container: HTMLElement,
		onUnmountTail: () => void,
	): Promise<HTMLElement> {
		if (common < this.chain.length) {
			onUnmountTail();
			for (let i = this.chain.length - 1; i >= common; i--) {
				this.chain[i].result.cleanup?.();
			}
			this.chain.length = common;
			if (common === 0) container.innerHTML = "";
		}

		for (let i = 0; i < common; i++) {
			this.chain[i].result.update?.(ctx);
		}

		let outlet = common > 0 ? this.chain[common - 1].result.outlet : container;

		for (let i = common; i < layoutChain.length; i++) {
			outlet.innerHTML = "";
			const loader = layoutChain[i];
			const module = await layoutModulePromises.get(loader)!;
			const result = module.default.render(outlet, ctx);
			this.chain.push({ loader, result });
			outlet = result.outlet;
		}

		return outlet;
	}
}
