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

	/**
	 * Removes an entry so its next read is expired. Also disowns any fetch
	 * currently in flight for this key: when that fetch eventually resolves, its
	 * result is no longer written to the cache — otherwise a fetch started
	 * before `invalidate()` was called could silently repopulate the entry with
	 * a value the caller had already decided was stale, right after asking for
	 * it to be forgotten.
	 */
	invalidate(key: CacheKey): void {
		const serialized = serializeCacheKey(key);
		this.entries.delete(serialized);
		this.pending.delete(serialized);
	}

	/**
	 * Clears all query data, including disowning every fetch currently in
	 * flight (see `invalidate()` — the same reasoning applies per-key here, for
	 * all keys at once).
	 */
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
			// Only write back if this fetch is still the one `pending` is tracking
			// for this key — `invalidate()`/`clear()` disown it by removing it from
			// `pending` without being able to cancel the in-flight promise itself.
			if (this.pending.get(serialized) === request) this.set(key, data, staleTime);
			return data;
		}).finally(() => {
			if (this.pending.get(serialized) === request) this.pending.delete(serialized);
		});
		this.pending.set(serialized, request);
		return request;
	}
}

/** Shared cache used by standalone query calls unless another cache is supplied. */
export const defaultQueryCache = new QueryCache();
