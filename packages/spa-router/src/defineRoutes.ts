export type RouteMap = Readonly<Record<string, string>>;

/** Extracts `:parameter` segment names from a route template. */
export type ExtractParamNames<Path extends string> =
	Path extends `${string}:${infer Param}/${infer Rest}`
		? Param | ExtractParamNames<`/${Rest}`>
		: Path extends `${string}:${infer Param}`
			? Param
			: never;

/** Maps a route template to the object required to build its URL. */
export type ExtractParams<Path extends string> = [ExtractParamNames<Path>] extends [never]
	? Record<never, never>
	: { [Key in ExtractParamNames<Path>]: string | number };

export type RouteName<Routes extends RouteMap> = Extract<keyof Routes, string>;
export type NamedRouteParams<Routes extends RouteMap, Name extends RouteName<Routes>> = ExtractParams<Routes[Name]>;

/** Preserves route names and path literals for type-safe router APIs. */
export function defineRoutes<const Routes extends RouteMap>(routes: Routes): Routes {
	return routes;
}

/** Replaces route template parameters and URL-encodes their values. */
export function buildRoutePath<Path extends string>(path: Path, params: ExtractParams<Path>): string {
	const values = params as Record<string, string | number>;
	return path.replace(/:([^/]+)/g, (_match, name: string) => {
		if (!(name in values)) throw new Error(`Missing route parameter '${name}'.`);
		return encodeURIComponent(String(values[name]));
	});
}
