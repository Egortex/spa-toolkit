import { defaultQueryCache, type CacheKey, type QueryCache } from "./queryCache";

export interface QueryOptions<T> {
	key: CacheKey;
	loader: () => Promise<T>;
	staleTime?: number;
	cache?: QueryCache;
}

export interface QueryResult<T> {
	data: T;
	state: "fresh" | "stale" | "expired";
	revalidation?: Promise<T>;
}

/**
 * Reads query data using stale-while-revalidate semantics. Fresh data is reused,
 * stale data is returned immediately while one refresh runs, and missing data is awaited.
 */
export async function query<T>(options: QueryOptions<T>): Promise<QueryResult<T>> {
	const cache = options.cache ?? defaultQueryCache;
	const staleTime = options.staleTime ?? 30_000;
	const cached = cache.get<T>(options.key);
	if (cached?.state === "fresh") return { data: cached.data, state: "fresh" };
	if (cached?.state === "stale") {
		return {
			data: cached.data,
			state: "stale",
			revalidation: cache.fetch(options.key, options.loader, staleTime),
		};
	}
	return {
		data: await cache.fetch(options.key, options.loader, staleTime),
		state: "expired",
	};
}
