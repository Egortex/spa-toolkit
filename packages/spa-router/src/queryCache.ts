export type CacheKey = readonly unknown[];
export type QueryState = "fresh" | "stale" | "expired";

export interface QueryCacheEntry<T = unknown> {
	data: T;
	updatedAt: number;
	staleTime: number;
}

export interface QueryCacheResult<T> extends QueryCacheEntry<T> {
	state: Exclude<QueryState, "expired">;
}

function normalize(value: unknown, seen: Set<object>): unknown {
	if (value === null || typeof value !== "object") return value;
	if (seen.has(value)) throw new TypeError("Cache keys cannot contain circular values.");
	seen.add(value);
	try {
		if (Array.isArray(value)) return value.map((item) => normalize(item, seen));
		const source = value as Record<string, unknown>;
		return Object.keys(source)
			.sort()
			.reduce<Record<string, unknown>>((result, key) => {
				result[key] = normalize(source[key], seen);
				return result;
			}, {});
	} finally {
		seen.delete(value);
	}
}

/** Serializes a cache key deterministically, including nested plain objects. */
export function serializeCacheKey(key: CacheKey): string {
	return JSON.stringify(normalize(key, new Set()));
}

/** In-memory query cache with fresh, stale and expired states. */
export class QueryCache {
	private entries = new Map<string, QueryCacheEntry>();
	private pending = new Map<string, Promise<unknown>>();

	/** Reads an entry. Missing or invalidated entries are expired. */
	get<T>(key: CacheKey, now = Date.now()): QueryCacheResult<T> | undefined {
		const entry = this.entries.get(serializeCacheKey(key)) as QueryCacheEntry<T> | undefined;
		if (!entry) return undefined;
		return { ...entry, state: now - entry.updatedAt <= entry.staleTime ? "fresh" : "stale" };
	}

	/** Stores data and its freshness policy. */
	set<T>(key: CacheKey, data: T, staleTime = 30_000, updatedAt = Date.now()): void {
		this.entries.set(serializeCacheKey(key), { data, staleTime, updatedAt });
	}

	/** Removes an entry so its next read is expired. */
	invalidate(key: CacheKey): void {
		this.entries.delete(serializeCacheKey(key));
	}

	/** Clears all query data. */
	clear(): void {
		this.entries.clear();
		this.pending.clear();
	}

	/** Deduplicates concurrent fetches for one key. */
	fetch<T>(key: CacheKey, loader: () => Promise<T>, staleTime: number): Promise<T> {
		const serialized = serializeCacheKey(key);
		const existing = this.pending.get(serialized) as Promise<T> | undefined;
		if (existing) return existing;
		const request = loader().then((data) => {
			this.set(key, data, staleTime);
			return data;
		}).finally(() => this.pending.delete(serialized));
		this.pending.set(serialized, request);
		return request;
	}
}

/** Shared cache used by standalone query calls unless another cache is supplied. */
export const defaultQueryCache = new QueryCache();
