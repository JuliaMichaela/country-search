import { HttpError } from './http-error.js';
import type { SearchError } from './types.js';

export type ClassifiedError = { readonly kind: 'cancelled' } | SearchError;

export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof HttpError) {
    return { kind: 'http', status: error.status };
  }

  // DOMException is checked explicitly: it is not an Error subclass in every runtime.
  if (error instanceof Error || error instanceof DOMException) {
    if (error.name === 'AbortError') {
      return { kind: 'cancelled' };
    }
    if (error.name === 'TimeoutError') {
      return { kind: 'timeout' };
    }
  }

  return { kind: 'network' };
}
