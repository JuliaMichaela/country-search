export type Debounced<Args extends unknown[]> = ((...args: Args) => void) & {
  cancel(): void;
};

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const debounced = (...args: Args): void => {
    cancel();
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delay);
  };

  return Object.assign(debounced, { cancel });
}
