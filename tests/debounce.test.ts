import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../src/debounce.js';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns a function with a cancel method', () => {
    const debounced = debounce(vi.fn<() => void>(), 300);

    expect(typeof debounced).toBe('function');
    expect(typeof debounced.cancel).toBe('function');
  });

  it('does not call fn immediately', () => {
    const fn = vi.fn<() => void>();
    const debounced = debounce(fn, 300);

    debounced();

    expect(fn).not.toHaveBeenCalled();
  });

  it('does not call fn before the delay has elapsed', () => {
    const fn = vi.fn<() => void>();
    const debounced = debounce(fn, 300);

    debounced();
    vi.advanceTimersByTime(299);

    expect(fn).not.toHaveBeenCalled();
  });

  it('calls fn exactly once when the delay is reached', () => {
    const fn = vi.fn<() => void>();
    const debounced = debounce(fn, 300);

    debounced();
    vi.advanceTimersByTime(300);
    vi.advanceTimersByTime(1000);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes the latest arguments, including several of them', () => {
    const fn = vi.fn<(query: string, page: number) => void>();
    const debounced = debounce(fn, 300);

    debounced('sp', 1);
    debounced('spain', 2);
    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('spain', 2);
  });

  it('resets the timer when called again before the delay has elapsed', () => {
    const fn = vi.fn<(value: string) => void>();
    const debounced = debounce(fn, 300);

    debounced('first');
    vi.advanceTimersByTime(200);
    debounced('second');

    vi.advanceTimersByTime(100); // t = 300: the first timer would have fired here
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200); // t = 500: 300 ms after the second call
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('second');
  });

  it('runs only the last of several rapid calls', () => {
    const fn = vi.fn<(value: number) => void>();
    const debounced = debounce(fn, 300);

    debounced(1);
    debounced(2);
    debounced(3);
    debounced(4);
    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(4);
  });

  it('allows scheduling another call after one has run', () => {
    const fn = vi.fn<(value: string) => void>();
    const debounced = debounce(fn, 300);

    debounced('one');
    vi.advanceTimersByTime(300);
    debounced('two');
    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'one');
    expect(fn).toHaveBeenNthCalledWith(2, 'two');
  });

  it('cancel discards a pending call', () => {
    const fn = vi.fn<() => void>();
    const debounced = debounce(fn, 300);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(1000);

    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel can be called repeatedly and before any call', () => {
    const fn = vi.fn<() => void>();
    const debounced = debounce(fn, 300);

    expect(() => {
      debounced.cancel();
      debounced.cancel();
    }).not.toThrow();

    debounced();
    debounced.cancel();
    expect(() => {
      debounced.cancel();
    }).not.toThrow();
    vi.advanceTimersByTime(1000);

    expect(fn).not.toHaveBeenCalled();
  });

  it('remains usable for new calls after cancel', () => {
    const fn = vi.fn<(value: string) => void>();
    const debounced = debounce(fn, 300);

    debounced('discarded');
    debounced.cancel();
    debounced('kept');
    vi.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('kept');
  });

  it('keeps timers of separate wrappers independent', () => {
    const first = vi.fn<(value: string) => void>();
    const second = vi.fn<(value: string) => void>();
    const debouncedFirst = debounce(first, 300);
    const debouncedSecond = debounce(second, 300);

    debouncedFirst('a');
    debouncedSecond('b');
    debouncedFirst.cancel();
    vi.advanceTimersByTime(300);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith('b');
  });

  it('with delay 0 does not call fn synchronously but calls it once timers advance', () => {
    const fn = vi.fn<() => void>();
    const debounced = debounce(fn, 0);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('leaves no active timer after the call has run or has been cancelled', () => {
    const debounced = debounce(vi.fn<() => void>(), 300);

    debounced();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(300);
    expect(vi.getTimerCount()).toBe(0);

    debounced();
    expect(vi.getTimerCount()).toBe(1);
    debounced.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });
});
