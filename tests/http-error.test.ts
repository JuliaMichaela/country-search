import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http-error.js';

describe('HttpError', () => {
  it('is both an Error and an HttpError', () => {
    const error = new HttpError(500);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(HttpError);
  });

  it('keeps the status', () => {
    expect(new HttpError(503).status).toBe(503);
  });

  it('has the name HttpError', () => {
    expect(new HttpError(500).name).toBe('HttpError');
  });

  it('keeps a message passed to the constructor', () => {
    expect(new HttpError(500, 'Server exploded').message).toBe('Server exploded');
  });

  it('has a default message that contains the status', () => {
    const error = new HttpError(502);

    expect(error.message).toContain('502');
  });
});
