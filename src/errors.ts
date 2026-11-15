import type { SearchError } from './types.js';

export type ClassifiedError = { readonly kind: 'cancelled' } | SearchError;

export const classifyError: (error: unknown) => ClassifiedError = () => {
  throw new Error('Not implemented');
};
