interface CacheEntry {
	data: unknown;
	expiresAt: number;
}

/** Cache read result: the data and whether its TTL has expired (but it's still usable for display). */
export interface CacheResult<T> {
	data: T;
	stale: boolean;
}

/**
 * Simple in-memory cache for loader responses with a TTL, keyed by page path.
 * Supports stale-while-revalidate: after the TTL expires, the entry isn't removed
 * immediately but marked as `stale` — the caller can show it instantly and
 * refresh it in the background.
 */
export class PageCache {
	private store = new Map<string, CacheEntry>();

	constructor(private ttlMs = 30_000) {}

	/**
	 * Returns the data for a key and whether it's `stale` (TTL expired).
	 * Returns undefined only if there's no entry at all.
	 */
	get<T>(key: string): CacheResult<T> | undefined {
		const entry = this.store.get(key);
		if (!entry) return undefined;
		return { data: entry.data as T, stale: Date.now() > entry.expiresAt };
	}

	/** Stores data under a key, expiring `ttlMs` from now. */
	set<T>(key: string, data: T): void {
		this.store.set(key, { data, expiresAt: Date.now() + this.ttlMs });
	}

	/** Checks whether there's a fresh (non-expired) entry for the key. */
	has(key: string): boolean {
		const entry = this.store.get(key);
		return entry !== undefined && Date.now() <= entry.expiresAt;
	}

	/** Clears the entire cache. */
	clear(): void {
		this.store.clear();
	}
}
