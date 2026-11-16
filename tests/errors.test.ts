import { describe, expect, it } from 'vitest';
import { classifyError } from '../src/errors.js';
import { HttpError } from '../src/http-error.js';

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('classifyError', () => {
  it('treats a DOMException named AbortError as cancelled', () => {
    const error = new DOMException('The operation was aborted.', 'AbortError');

    expect(classifyError(error)).toStrictEqual({ kind: 'cancelled' });
  });

  it('treats a plain Error named AbortError as cancelled', () => {
    expect(classifyError(namedError('AbortError', 'aborted'))).toStrictEqual({
      kind: 'cancelled',
    });
  });

  it('treats a DOMException named TimeoutError as a timeout', () => {
    const error = new DOMException('The operation timed out.', 'TimeoutError');

    expect(classifyError(error)).toStrictEqual({ kind: 'timeout' });
  });

  it('treats a plain Error named TimeoutError as a timeout', () => {
    expect(classifyError(namedError('TimeoutError', 'timed out'))).toStrictEqual({
      kind: 'timeout',
    });
  });

  it('describes HttpError(500) as an http error with status 500', () => {
    expect(classifyError(new HttpError(500))).toStrictEqual({ kind: 'http', status: 500 });
  });

  it('describes HttpError(429) as an http error with status 429', () => {
    expect(classifyError(new HttpError(429))).toStrictEqual({ kind: 'http', status: 429 });
  });

  it('keeps HttpError(404) as an http error instead of turning it into a result', () => {
    expect(classifyError(new HttpError(404))).toStrictEqual({ kind: 'http', status: 404 });
  });

  it('treats a TypeError from fetch as a network error', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toStrictEqual({ kind: 'network' });
  });

  it('treats a generic Error as a network error', () => {
    expect(classifyError(new Error('Something broke'))).toStrictEqual({ kind: 'network' });
  });

  it('safely treats null, undefined, a string and a number as network errors', () => {
    expect(classifyError(null)).toStrictEqual({ kind: 'network' });
    expect(classifyError(undefined)).toStrictEqual({ kind: 'network' });
    expect(classifyError('AbortError')).toStrictEqual({ kind: 'network' });
    expect(classifyError(42)).toStrictEqual({ kind: 'network' });
  });

  it('does not treat a message containing AbortError as a cancellation', () => {
    expect(classifyError(new Error('AbortError: request failed'))).toStrictEqual({
      kind: 'network',
    });
  });

  it('keeps an HttpError whose message mentions TimeoutError as an http error', () => {
    expect(classifyError(new HttpError(504, 'TimeoutError upstream'))).toStrictEqual({
      kind: 'http',
      status: 504,
    });
  });
});
