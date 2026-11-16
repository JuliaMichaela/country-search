import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchCountries } from '../src/api.js';
import { DEBOUNCE_MS } from '../src/config.js';
import { createSearchController } from '../src/search-controller.js';
import type { CountryView, SearchState } from '../src/types.js';

// Unit test of one controller responsibility: a request that finished late must not clear the
// controller's reference to the newer active request. The real searchCountries stops waiting
// as soon as its signal aborts, which hides this scenario, so it is replaced here by a mock
// that keeps the signal but deliberately ignores cancellation.
vi.mock('../src/api.js', () => ({ searchCountries: vi.fn() }));

interface Call {
  readonly query: string;
  readonly signal: AbortSignal;
  resolve(countries: CountryView[]): void;
  reject(error: unknown): void;
}

const staleView: CountryView = {
  id: 'AAA',
  name: 'Stale',
  nativeName: 'Stale',
  flagEmoji: '🏳️',
  flagUrl: 'https://example.test/a.svg',
  region: 'Europe',
  subregion: 'Southern Europe',
  population: 1,
  demonym: 'Stale',
  independent: true,
  languages: ['Stale'],
};

let calls: Call[];
let states: SearchState[];

function callAt(index: number): Call {
  const call = calls[index];
  if (call === undefined) {
    throw new Error(
      `Expected searchCountries call #${index + 1}, but only ${calls.length} happened`,
    );
  }
  return call;
}

function currentState(): SearchState {
  const state = states.at(-1);
  if (state === undefined) {
    throw new Error('No state was published');
  }
  return state;
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('controller keeps ownership of the active request', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    states = [];
    vi.mocked(searchCountries).mockImplementation(
      (query, signal) =>
        new Promise<CountryView[]>((resolve, reject) => {
          calls.push({ query, signal, resolve, reject });
        }),
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const lateCompletions: readonly {
    readonly name: string;
    readonly complete: (call: Call) => void;
  }[] = [
    {
      name: 'a successful response',
      complete: (call) => {
        call.resolve([staleView]);
      },
    },
    {
      name: 'a plain error',
      complete: (call) => {
        call.reject(new TypeError('Failed to fetch'));
      },
    },
  ];

  it.each(lateCompletions)(
    'still aborts B after the stale A finished late with $name',
    async ({ complete }) => {
      const controller = createSearchController((state) => {
        states.push(state);
      });

      // 1. Request A starts.
      controller.setQuery('a');
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      const requestA = callAt(0);
      expect(requestA.query).toBe('a');
      expect(requestA.signal.aborted).toBe(false);

      // 2. Request B starts: A is aborted, B is still active.
      controller.setQuery('b');
      expect(requestA.signal.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      const requestB = callAt(1);
      expect(requestB.query).toBe('b');
      expect(requestB.signal.aborted).toBe(false);
      expect(currentState()).toStrictEqual({ status: 'loading', query: 'b' });

      // 3. The old A finishes while B is unfinished.
      complete(requestA);
      await flush();

      // 4. The state is still "loading b".
      expect(currentState()).toStrictEqual({ status: 'loading', query: 'b' });
      expect(requestB.signal.aborted).toBe(false);

      // 5-6. A new input C immediately aborts B, before the debounce advances.
      controller.setQuery('c');
      expect(requestB.signal.aborted).toBe(true);
      expect(calls).toHaveLength(2);
      expect(currentState()).toStrictEqual({ status: 'idle' });

      // 7. Cleanup: dispose cancels the pending debounce, no timers are left.
      expect(vi.getTimerCount()).toBe(1);
      controller.dispose();
      expect(vi.getTimerCount()).toBe(0);
      expect(calls).toHaveLength(2);
    },
  );
});
