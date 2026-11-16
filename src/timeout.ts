export interface TimeoutSignal {
  readonly signal: AbortSignal;
  dispose(): void;
}

export const createTimeoutSignal: (
  parentSignal: AbortSignal,
  timeoutMs: number,
) => TimeoutSignal = () => {
  throw new Error('Not implemented');
};
