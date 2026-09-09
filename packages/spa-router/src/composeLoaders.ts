export type Loader<Context = unknown, Result = unknown> = (context: Context) => Promise<Result> | Result;

const deferredMarker = Symbol("spa-router-deferred");

export interface DeferredValue<T> {
  readonly [deferredMarker]: true;
  readonly run: () => Promise<T>;
}

/** Marks non-critical loader work so a router commit does not wait for it. */
export function defer<Context, Result>(loader: Loader<Context, Result>): Loader<Context, DeferredValue<Result>> {
  return (context) => ({
    [deferredMarker]: true,
    run: () => Promise.resolve(loader(context)),
  });
}

/** Returns whether a composed value represents deferred loader work. */
export function isDeferredValue(value: unknown): value is DeferredValue<unknown> {
  return typeof value === "object" && value !== null && deferredMarker in value;
}

type LoaderRecord<Context> = Record<string, Loader<Context, unknown>>;
type LoaderRecordResult<Loaders extends Record<string, Loader<any, unknown>>> = {
  [Key in keyof Loaders]: Awaited<ReturnType<Loaders[Key]>>;
};

function loaderName(loader: Function, index: number): string {
  const name = loader.name.replace(/Loader$/, "");
  return name || String(index);
}

/** Runs loaders concurrently and combines their results by record key or function name. */
export function parallel<Context, Loaders extends LoaderRecord<Context>>(
  loaders: Loaders,
): Loader<Context, LoaderRecordResult<Loaders>>;
export function parallel<Context>(...loaders: Loader<Context, unknown>[]): Loader<Context, Record<string, unknown>>;
export function parallel<Context>(
  ...input: [LoaderRecord<Context>] | Loader<Context, unknown>[]
): Loader<Context, Record<string, unknown>> {
  const record = input.length === 1 && typeof input[0] === "object"
    ? input[0] as LoaderRecord<Context>
    : Object.fromEntries((input as Loader<Context, unknown>[]).map((loader, index) => [loaderName(loader, index), loader]));
  return async (context) => {
    const entries = Object.entries(record);
    const values = await Promise.all(entries.map(([, loader]) => loader(context)));
    return Object.fromEntries(entries.map(([key], index) => [key, values[index]]));
  };
}

export interface SequentialContext<Context, Data> {
  context: Context;
  data: Data;
}

/** Runs loader steps in order, merging object results into accumulated `data`. */
export function sequential<Context>(
  ...steps: Loader<SequentialContext<Context, Record<string, unknown>>, unknown>[]
): Loader<Context, Record<string, unknown>> {
  return async (context) => {
    let data: Record<string, unknown> = {};
    for (const step of steps) {
      const result = await step({ context, data });
      data = typeof result === "object" && result !== null && !isDeferredValue(result)
        ? { ...data, ...result as Record<string, unknown> }
        : { ...data, [loaderName(step, Object.keys(data).length)]: result };
    }
    return data;
  };
}
