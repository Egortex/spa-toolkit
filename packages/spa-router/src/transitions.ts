/**
 * Performs a DOM update via the View Transitions API (`document.startViewTransition`)
 * if the browser supports it and the user hasn't requested reduced motion
 * (`prefers-reduced-motion: reduce`). Otherwise just runs `update()` directly.
 */
export async function runTransition(update: () => void | Promise<void>): Promise<void> {
  const doc = document as Document & {
    startViewTransition?: (callback: () => void | Promise<void>) => {
      updateCallbackDone?: Promise<void>;
      ready?: Promise<void>;
      finished?: Promise<void>;
    } | unknown;
  };
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    await update();
    return;
  }
  const transition = doc.startViewTransition(update) as
    | { updateCallbackDone?: Promise<void>; ready?: Promise<void>; finished?: Promise<void> }
    | undefined;
  // `ready`/`finished` reject when a newer navigation starts its own transition
  // before this one finishes (the browser "skips" the superseded transition).
  // That's expected under rapid navigation and must not surface as an unhandled
  // promise rejection — only `updateCallbackDone` (the DOM update itself) matters here.
  transition?.ready?.catch(() => undefined);
  transition?.finished?.catch(() => undefined);
  await transition?.updateCallbackDone;
}
