import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { DEBOUNCE_MS, TIMEOUT_MS } from '../src/config.js';
import { createSearchController } from '../src/search-controller.js';
import type { SearchController } from '../src/search-controller.js';
import type { CountryView, SearchState } from '../src/types.js';

// --- Fixtures: a raw API payload (unknown JSON) and, separately, the view it must become. ---

function rawCountry(name: string, code: string): Record<string, unknown> {
  return {
    name,
    nativeName: name,
    alpha3Code: code,
    flag: '🏳',
    flags: {
      svg: `https://flagcdn.com/${code.toLowerCase()}.svg`,
      png: `https://flagcdn.com/w320/${code.toLowerCase()}.png`,
    },
    region: 'Europe',
    subregion: 'Southern Europe',
    population: 1000,
    demonym: 'Someone',
    independent: true,
    languages: [{ name: 'Somelang' }],
  };
}

function expectedView(name: string, code: string): CountryView {
  return {
    id: code,
    name,
    nativeName: name,
    flagEmoji: '🏳',
    flagUrl: `https://flagcdn.com/${code.toLowerCase()}.svg`,
    region: 'Europe',
    subregion: 'Southern Europe',
    population: 1000,
    demonym: 'Someone',
    independent: true,
    languages: ['Somelang'],
  };
}

const spainRaw = rawCountry('Spain', 'ESP');
const spainView = expectedView('Spain', 'ESP');
const swedenRaw = rawCountry('Sweden', 'SWE');

// --- Controllable fetch ---

type Outcome =
  | { readonly kind: 'response'; readonly response: Response }
  | { readonly kind: 'failure'; readonly error: unknown };

interface PendingRequest {
  readonly url: string;
  readonly signal: AbortSignal;
  respond(response: Response): void;
  fail(error: unknown): void;
}

let fetchMock: Mock<typeof fetch>;
let requests: PendingRequest[];
// When true, newly started requests ignore abort and can still be answered afterwards.
let ignoreAbort: boolean;
let states: SearchState[];

function okResponse(data: unknown): Response {
  const response = new Response(null, { status: 200 });
  vi.spyOn(response, 'json').mockResolvedValue(data);
  return response;
}

function statusResponse(status: number): Response {
  return new Response(null, { status });
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      { once: true },
    );
  });
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

function installFetch(): void {
  fetchMock.mockImplementation(async (input, init) => {
    const signal = init?.signal;
    if (signal === undefined || signal === null) {
      throw new Error('fetch was called without a signal');
    }

    let settle: (outcome: Outcome) => void = () => {};
    const settled = new Promise<Outcome>((resolve) => {
      settle = resolve;
    });
    requests.push({
      url: urlOf(input),
      signal,
      respond: (response) => {
        settle({ kind: 'response', response });
      },
      fail: (error) => {
        settle({ kind: 'failure', error });
      },
    });

    const outcome = ignoreAbort
      ? await settled
      : await Promise.race([settled, waitForAbort(signal).then(() => undefined)]);

    if (outcome === undefined) {
      // Honour the abort the way real fetch does: reject with signal.reason.
      signal.throwIfAborted();
      throw new Error('Expected the signal to be aborted');
    }
    if (outcome.kind === 'failure') {
      throw outcome.error;
    }
    return outcome.response;
  });
}

function requestAt(index: number): PendingRequest {
  const request = requests[index];
  if (request === undefined) {
    throw new Error(`Expected fetch call #${index + 1}, but only ${requests.length} happened`);
  }
  return request;
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

function start(): SearchController {
  return createSearchController((state) => {
    states.push(state);
  });
}

// Types a query and lets the debounce fire, so the request is in flight.
async function startRequest(controller: SearchController, query: string): Promise<void> {
  controller.setQuery(query);
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
}

describe('createSearchController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    states = [];
    ignoreAbort = false;
    fetchMock = vi.fn<typeof fetch>();
    installFetch();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('starting a search', () => {
    it('publishes idle when created', () => {
      start();

      expect(states).toStrictEqual([{ status: 'idle' }]);
    });

    it('trims the query', async () => {
      const controller = start();

      await startRequest(controller, '  spain \t');

      expect(requestAt(0).url).toBe('https://countries.dev/name/spain');
      expect(currentState()).toStrictEqual({ status: 'loading', query: 'spain' });
    });

    it('starts the search only after DEBOUNCE_MS, publishing loading with the current query', async () => {
      const controller = start();

      controller.setQuery('spain');
      expect(currentState()).toStrictEqual({ status: 'idle' });

      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(currentState()).toStrictEqual({ status: 'idle' });

      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(requestAt(0).url).toBe('https://countries.dev/name/spain');
      expect(currentState()).toStrictEqual({ status: 'loading', query: 'spain' });
    });

    it('starts only the last query after rapid input changes', async () => {
      const controller = start();

      controller.setQuery('s');
      await vi.advanceTimersByTimeAsync(100);
      controller.setQuery('sp');
      await vi.advanceTimersByTimeAsync(100);
      controller.setQuery('spain');
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(requestAt(0).url).toBe('https://countries.dev/name/spain');
    });
  });

  describe('cancelling', () => {
    it('aborts the active request immediately on a new input, before the new debounce', async () => {
      const controller = start();
      await startRequest(controller, 'sp');
      expect(requestAt(0).signal.aborted).toBe(false);

      controller.setQuery('spa');

      expect(requestAt(0).signal.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('aborts the active request even when the same text is entered again', async () => {
      const controller = start();
      await startRequest(controller, 'spain');

      controller.setQuery('spain');

      expect(requestAt(0).signal.aborted).toBe(true);
    });

    it('aborts the active request and the pending debounce on empty input and publishes idle', async () => {
      const controller = start();
      await startRequest(controller, 'spain');
      controller.setQuery('spa');

      controller.setQuery('');

      expect(requestAt(0).signal.aborted).toBe(true);
      expect(currentState()).toStrictEqual({ status: 'idle' });
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(currentState()).toStrictEqual({ status: 'idle' });
    });

    it('treats whitespace-only input as empty', async () => {
      const controller = start();
      controller.setQuery('spain');

      controller.setQuery('   ');

      expect(currentState()).toStrictEqual({ status: 'idle' });
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not let a late response bring back cards after the input was cleared', async () => {
      ignoreAbort = true;
      const controller = start();
      await startRequest(controller, 'spain');

      controller.setQuery('');
      requestAt(0).respond(okResponse([spainRaw]));
      await flush();

      expect(currentState()).toStrictEqual({ status: 'idle' });
      expect(states.some((state) => state.status === 'results')).toBe(false);
    });
  });

  describe('results', () => {
    it('publishes results for a successful non-empty response', async () => {
      const controller = start();
      await startRequest(controller, 'spain');

      requestAt(0).respond(okResponse([spainRaw]));
      await flush();

      expect(currentState()).toStrictEqual({
        status: 'results',
        query: 'spain',
        countries: [spainView],
      });
    });

    it('publishes empty for an empty successful response', async () => {
      const controller = start();
      await startRequest(controller, 'zzz');

      requestAt(0).respond(okResponse([]));
      await flush();

      expect(currentState()).toStrictEqual({ status: 'empty', query: 'zzz' });
    });

    it('publishes empty for HTTP 404', async () => {
      const controller = start();
      await startRequest(controller, 'zzz');

      requestAt(0).respond(statusResponse(404));
      await flush();

      expect(currentState()).toStrictEqual({ status: 'empty', query: 'zzz' });
    });
  });

  describe('errors', () => {
    it('publishes error/network for a network failure', async () => {
      const controller = start();
      await startRequest(controller, 'spain');

      requestAt(0).fail(new TypeError('Failed to fetch'));
      await flush();

      expect(currentState()).toStrictEqual({
        status: 'error',
        query: 'spain',
        error: { kind: 'network' },
      });
    });

    it.each([[429], [500]])('publishes error/http with status %i', async (status) => {
      const controller = start();
      await startRequest(controller, 'spain');

      requestAt(0).respond(statusResponse(status));
      await flush();

      expect(currentState()).toStrictEqual({
        status: 'error',
        query: 'spain',
        error: { kind: 'http', status },
      });
    });

    it('publishes error/timeout when the request times out', async () => {
      const controller = start();
      await startRequest(controller, 'spain');

      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

      expect(currentState()).toStrictEqual({
        status: 'error',
        query: 'spain',
        error: { kind: 'timeout' },
      });
    });
  });

  describe('stale requests', () => {
    it('does not publish an error for a cancelled request or change the new state', async () => {
      const controller = start();
      await startRequest(controller, 'sp');
      controller.setQuery('spain');
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      await flush();

      expect(states.some((state) => state.status === 'error')).toBe(false);
      expect(currentState()).toStrictEqual({ status: 'loading', query: 'spain' });
    });

    it('ignores a late response of a stale request', async () => {
      ignoreAbort = true;
      const controller = start();
      await startRequest(controller, 'sp');
      await startRequest(controller, 'spain');

      requestAt(1).respond(okResponse([spainRaw]));
      await flush();
      requestAt(0).respond(okResponse([swedenRaw]));
      await flush();

      expect(currentState()).toStrictEqual({
        status: 'results',
        query: 'spain',
        countries: [spainView],
      });
      expect(states.some((state) => state.status === 'results' && state.query === 'sp')).toBe(
        false,
      );
    });

    it('ignores a late failure of a stale request', async () => {
      ignoreAbort = true;
      const controller = start();
      await startRequest(controller, 'sp');
      await startRequest(controller, 'spain');

      requestAt(0).fail(new TypeError('Failed to fetch'));
      await flush();

      expect(states.some((state) => state.status === 'error')).toBe(false);
      expect(currentState()).toStrictEqual({ status: 'loading', query: 'spain' });
    });

    it('ignores a late failure of a stale request that arrives after the new result', async () => {
      ignoreAbort = true;
      const controller = start();
      await startRequest(controller, 'sp');
      await startRequest(controller, 'spain');
      requestAt(1).respond(okResponse([spainRaw]));
      await flush();

      requestAt(0).fail(new Error('boom'));
      await flush();

      expect(currentState()).toStrictEqual({
        status: 'results',
        query: 'spain',
        countries: [spainView],
      });
    });
  });

  describe('retry', () => {
    it('restarts the current query immediately, without debounce, after an error', async () => {
      const controller = start();
      await startRequest(controller, '  spain ');
      requestAt(0).respond(statusResponse(500));
      await flush();
      expect(currentState().status).toBe('error');

      controller.retry();
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(requestAt(1).url).toBe('https://countries.dev/name/spain');
      expect(currentState()).toStrictEqual({ status: 'loading', query: 'spain' });

      requestAt(1).respond(okResponse([spainRaw]));
      await flush();
      expect(currentState()).toStrictEqual({
        status: 'results',
        query: 'spain',
        countries: [spainView],
      });
    });

    it('does nothing in the idle state', () => {
      const controller = start();

      controller.retry();

      expect(states).toStrictEqual([{ status: 'idle' }]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does nothing while loading', async () => {
      const controller = start();
      await startRequest(controller, 'spain');
      const published = states.length;

      controller.retry();
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(requestAt(0).signal.aborted).toBe(false);
      expect(states).toHaveLength(published);
    });

    it('does nothing after results', async () => {
      const controller = start();
      await startRequest(controller, 'spain');
      requestAt(0).respond(okResponse([spainRaw]));
      await flush();
      const published = states.length;

      controller.retry();
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(states).toHaveLength(published);
    });

    it('does nothing after an empty result', async () => {
      const controller = start();
      await startRequest(controller, 'zzz');
      requestAt(0).respond(statusResponse(404));
      await flush();
      const published = states.length;

      controller.retry();
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(states).toHaveLength(published);
    });
  });

  describe('dispose', () => {
    it('aborts the active request and publishes nothing afterwards', async () => {
      ignoreAbort = true;
      const controller = start();
      await startRequest(controller, 'spain');
      const published = states.length;

      controller.dispose();
      expect(requestAt(0).signal.aborted).toBe(true);
      requestAt(0).respond(okResponse([spainRaw]));
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

      expect(states).toHaveLength(published);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('cancels a pending debounce', async () => {
      const controller = start();
      controller.setQuery('spain');
      const published = states.length;

      controller.dispose();
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(states).toHaveLength(published);
    });

    it('can be called repeatedly', async () => {
      const controller = start();
      await startRequest(controller, 'spain');

      expect(() => {
        controller.dispose();
        controller.dispose();
      }).not.toThrow();
    });

    it('makes setQuery do nothing', async () => {
      const controller = start();
      controller.dispose();
      const published = states.length;

      controller.setQuery('spain');
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(states).toHaveLength(published);
    });

    it('makes retry do nothing, even after an error', async () => {
      const controller = start();
      await startRequest(controller, 'spain');
      requestAt(0).respond(statusResponse(500));
      await flush();
      expect(currentState().status).toBe('error');
      const published = states.length;

      controller.dispose();
      controller.retry();
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(states).toHaveLength(published);
    });
  });

  describe('independence', () => {
    it('keeps two controllers independent', async () => {
      const otherStates: SearchState[] = [];
      const first = start();
      const second = createSearchController((state) => {
        otherStates.push(state);
      });

      first.setQuery('spain');
      second.setQuery('sweden');
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstRequest = requestAt(0);
      const secondRequest = requestAt(1);
      expect(firstRequest.url).toBe('https://countries.dev/name/spain');
      expect(secondRequest.url).toBe('https://countries.dev/name/sweden');

      // Cancelling or disposing one controller leaves the other request alone.
      first.setQuery('spa');
      expect(firstRequest.signal.aborted).toBe(true);
      expect(secondRequest.signal.aborted).toBe(false);

      const published = states.length;
      second.dispose();
      expect(secondRequest.signal.aborted).toBe(true);
      first.setQuery('spain');
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      requestAt(2).respond(okResponse([spainRaw]));
      await flush();

      expect(currentState()).toStrictEqual({
        status: 'results',
        query: 'spain',
        countries: [spainView],
      });
      expect(states.length).toBeGreaterThan(published);
      expect(otherStates.some((state) => state.status === 'results')).toBe(false);
      expect(otherStates.at(-1)).toStrictEqual({ status: 'loading', query: 'sweden' });
    });
  });
});
