import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimeoutSignal } from '../src/timeout.js';

// AbortSignal.reason is typed as `any`; read it as `unknown` so tests stay strictly typed.
function reasonOf(signal: AbortSignal): unknown {
  const reason: unknown = signal.reason;
  return reason;
}

describe('createTimeoutSignal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns an AbortSignal and a dispose function', () => {
    const parent = new AbortController();

    const result = createTimeoutSignal(parent.signal, 1000);

    expect(result.signal).toBeInstanceOf(AbortSignal);
    expect(typeof result.dispose).toBe('function');
  });

  it('is not aborted before timeoutMs has elapsed', () => {
    const parent = new AbortController();
    const { signal } = createTimeoutSignal(parent.signal, 1000);

    vi.advanceTimersByTime(999);

    expect(signal.aborted).toBe(false);
  });

  it('aborts with a TimeoutError DOMException at timeoutMs', () => {
    const parent = new AbortController();
    const { signal } = createTimeoutSignal(parent.signal, 1000);

    vi.advanceTimersByTime(1000);

    expect(signal.aborted).toBe(true);
    const reason = reasonOf(signal);
    expect(reason).toBeInstanceOf(DOMException);
    expect(reason).toMatchObject({ name: 'TimeoutError' });
  });

  it('aborts immediately when the parent aborts first and keeps its reason by reference', () => {
    const parent = new AbortController();
    const { signal } = createTimeoutSignal(parent.signal, 1000);
    const parentReason = new Error('user typed again');

    vi.advanceTimersByTime(300);
    expect(signal.aborted).toBe(false);
    parent.abort(parentReason);

    expect(signal.aborted).toBe(true);
    expect(reasonOf(signal)).toBe(parentReason);
  });

  it('returns an already aborted signal without an active timer for an aborted parent', () => {
    const parent = new AbortController();
    const parentReason = new Error('already cancelled');
    parent.abort(parentReason);

    const { signal } = createTimeoutSignal(parent.signal, 1000);

    expect(signal.aborted).toBe(true);
    expect(reasonOf(signal)).toBe(parentReason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer after the parent aborts', () => {
    const parent = new AbortController();
    createTimeoutSignal(parent.signal, 1000);
    expect(vi.getTimerCount()).toBe(1);

    parent.abort();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let a late timeout replace the parent abort reason', () => {
    const parent = new AbortController();
    const { signal } = createTimeoutSignal(parent.signal, 1000);
    const parentReason = new Error('parent first');

    vi.advanceTimersByTime(500);
    parent.abort(parentReason);
    vi.advanceTimersByTime(5000);

    expect(reasonOf(signal)).toBe(parentReason);
  });

  it('does not let a late parent abort replace the TimeoutError', () => {
    const parent = new AbortController();
    const { signal } = createTimeoutSignal(parent.signal, 1000);

    vi.advanceTimersByTime(1000);
    const timeoutReason = reasonOf(signal);
    parent.abort(new Error('too late'));

    expect(reasonOf(signal)).toBe(timeoutReason);
    expect(timeoutReason).toMatchObject({ name: 'TimeoutError' });
  });

  it('does not abort the parent when the timeout fires', () => {
    const parent = new AbortController();
    const { signal } = createTimeoutSignal(parent.signal, 1000);

    vi.advanceTimersByTime(1000);

    expect(signal.aborted).toBe(true);
    expect(parent.signal.aborted).toBe(false);
  });

  it('clears the timer on dispose and never aborts afterwards', () => {
    const parent = new AbortController();
    const handle = createTimeoutSignal(parent.signal, 1000);

    handle.dispose();

    expect(vi.getTimerCount()).toBe(0);
    expect(handle.signal.aborted).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(handle.signal.aborted).toBe(false);
  });

  it('ignores a parent abort that happens after dispose', () => {
    const parent = new AbortController();
    const handle = createTimeoutSignal(parent.signal, 1000);

    handle.dispose();
    parent.abort(new Error('after dispose'));

    expect(handle.signal.aborted).toBe(false);
  });

  it('allows dispose to be called repeatedly, including after an abort', () => {
    const timedOutParent = new AbortController();
    const timedOut = createTimeoutSignal(timedOutParent.signal, 1000);
    vi.advanceTimersByTime(1000);

    const cancelledParent = new AbortController();
    const cancelled = createTimeoutSignal(cancelledParent.signal, 1000);
    cancelledParent.abort();

    const idleParent = new AbortController();
    const idle = createTimeoutSignal(idleParent.signal, 1000);

    expect(() => {
      idle.dispose();
      idle.dispose();
      timedOut.dispose();
      timedOut.dispose();
      cancelled.dispose();
      cancelled.dispose();
    }).not.toThrow();
  });

  it('keeps two instances independent', () => {
    const parentA = new AbortController();
    const parentB = new AbortController();
    const a = createTimeoutSignal(parentA.signal, 100);
    const b = createTimeoutSignal(parentB.signal, 200);

    vi.advanceTimersByTime(100);
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);

    a.dispose();
    parentA.abort();
    expect(b.signal.aborted).toBe(false);

    vi.advanceTimersByTime(100);
    expect(b.signal.aborted).toBe(true);
    expect(parentB.signal.aborted).toBe(false);
  });

  it('with timeoutMs 0 does not abort synchronously but aborts once timers run', () => {
    const parent = new AbortController();
    const { signal } = createTimeoutSignal(parent.signal, 0);

    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(0);
    expect(signal.aborted).toBe(true);
    expect(reasonOf(signal)).toMatchObject({ name: 'TimeoutError' });
  });

  it('leaves no active timer after a timeout, a parent abort or a dispose', () => {
    const timeoutParent = new AbortController();
    createTimeoutSignal(timeoutParent.signal, 100);
    vi.advanceTimersByTime(100);
    expect(vi.getTimerCount()).toBe(0);

    const abortedParent = new AbortController();
    createTimeoutSignal(abortedParent.signal, 100);
    abortedParent.abort();
    expect(vi.getTimerCount()).toBe(0);

    const disposedParent = new AbortController();
    createTimeoutSignal(disposedParent.signal, 100).dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
