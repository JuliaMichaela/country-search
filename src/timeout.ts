export interface TimeoutSignal {
  readonly signal: AbortSignal;
  dispose(): void;
}

export function createTimeoutSignal(parentSignal: AbortSignal, timeoutMs: number): TimeoutSignal {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Releases both resources: the timer and the listener on the parent signal.
  // Safe to call any number of times; it never aborts the returned signal.
  function release(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    parentSignal.removeEventListener('abort', onParentAbort);
  }

  function onParentAbort(): void {
    release();
    controller.abort(parentSignal.reason);
  }

  function onTimeout(): void {
    timer = undefined;
    release();
    controller.abort(
      new DOMException(`The operation timed out after ${timeoutMs} ms.`, 'TimeoutError'),
    );
  }

  if (parentSignal.aborted) {
    controller.abort(parentSignal.reason);
  } else {
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
    timer = setTimeout(onTimeout, timeoutMs);
  }

  return {
    signal: controller.signal,
    dispose(): void {
      release();
    },
  };
}
