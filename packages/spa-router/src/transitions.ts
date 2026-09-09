/**
 * Performs a DOM update via the View Transitions API (`document.startViewTransition`)
 * if the browser supports it and the user hasn't requested reduced motion
 * (`prefers-reduced-motion: reduce`). Otherwise just runs `update()` directly.
 */
export async function runTransition(update: () => void | Promise<void>): Promise<void> {
  const doc = document as Document & {
    startViewTransition?: (callback: () => void | Promise<void>) => { updateCallbackDone?: Promise<void> } | unknown;
  };
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    await update();
    return;
  }
  const transition = doc.startViewTransition(update) as { updateCallbackDone?: Promise<void> } | undefined;
  await transition?.updateCallbackDone;
}
