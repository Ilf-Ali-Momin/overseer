/**
 * Collect items and hand them over once per animation frame, so a burst of WebSocket events causes
 * one store update instead of one per message.
 */
export interface FrameBatcher<T> {
  push: (item: T) => void;
  /** Deliver anything queued right now. */
  flush: () => void;
  /** Drop the queue and cancel the pending frame. */
  dispose: () => void;
}

export function createFrameBatcher<T>(
  deliver: (items: T[]) => void,
  schedule: (fn: () => void) => unknown = (fn) => requestAnimationFrame(fn),
  cancel: (handle: unknown) => void = (h) => cancelAnimationFrame(h as number),
): FrameBatcher<T> {
  let queue: T[] = [];
  let handle: unknown = null;

  const flush = () => {
    if (handle !== null) cancel(handle);
    handle = null;
    if (queue.length === 0) return;
    const items = queue;
    queue = [];
    deliver(items);
  };

  return {
    push: (item) => {
      queue.push(item);
      if (handle !== null) return;
      // A scheduler may run the callback synchronously; only keep the handle if it did not.
      let ran = false;
      const h = schedule(() => {
        ran = true;
        handle = null;
        flush();
      });
      if (!ran) handle = h ?? true;
    },
    flush,
    dispose: () => {
      if (handle !== null) cancel(handle);
      handle = null;
      queue = [];
    },
  };
}
