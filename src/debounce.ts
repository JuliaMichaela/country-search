export type Debounced<Args extends unknown[]> = ((...args: Args) => void) & {
  cancel(): void;
};

export const debounce: <Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
) => Debounced<Args> = () => {
  throw new Error('Not implemented');
};
