import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { DEBOUNCE_MS } from '../src/config.js';
import { createSearchController } from '../src/search-controller.js';
import type { SearchController } from '../src/search-controller.js';
import type { CountryView, SearchState } from '../src/types.js';

// Regression test for the stale-response race: while "spain" is still in flight the user types
// "france". The real controller, searchCountries, debounce and error classification are used;
// only fetch is replaced.

// --- Explicit fixtures: raw API payloads and, separately, the views they must become. ---

const spainRaw = {
  name: 'Spain',
  nativeName: 'España',
  alpha3Code: 'ESP',
  flag: '🇪🇸',
  flags: { svg: 'https://flagcdn.com/es.svg', png: 'https://flagcdn.com/w320/es.png' },
  region: 'Europe',
  subregion: 'Southern Europe',
  population: 47351567,
  demonym: 'Spanish',
  independent: true,
  languages: [{ name: 'Spanish' }],
};

const franceRaw = {
  name: 'France',
  nativeName: 'France',
  alpha3Code: 'FRA',
  flag: '🇫🇷',
  flags: { svg: 'https://flagcdn.com/fr.svg', png: 'https://flagcdn.com/w320/fr.png' },
  region: 'Europe',
  subregion: 'Western Europe',
  population: 67391582,
  demonym: 'French',
  independent: true,
  languages: [{ name: 'French' }],
};

const franceView: CountryView = {
  id: 'FRA',
  name: 'France',
  nativeName: 'France',
  flagEmoji: '🇫🇷',
  flagUrl: 'https://flagcdn.com/fr.svg',
  region: 'Europe',
  subregion: 'Western Europe',
  population: 67391582,
  demonym: 'French',
  independent: true,
  languages: ['French'],
};

// --- Controllable fetch ---

type Outcome =
  | { readonly kind: 'response'; readonly response: Response }
  | { readonly kind: 'failure'; readonly error: unknown };

// One fetch call. `finish` and `fail` are separate events of the test bench: the moment the
// transport completes. They never turn an already rejected fetch Promise into a resolved one.
interface Transport {
  readonly url: string;
  readonly signal: AbortSignal;
  finish(response: Response): void;
  fail(error: unknown): void;
  // Set once the fetch Promise was rejected because the signal aborted.
  rejection(): { readonly reason: unknown } | undefined;
}

let fetchMock: Mock<typeof fetch>;
let transports: Transport[];
let states: SearchState[];

function okResponse(data: unknown): Response {
  const response = new Response(null, { status: 200 });
  vi.spyOn(response, 'json').mockResolvedValue(data);
  return response;
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

// honoursAbort = true: aborting the signal rejects the fetch Promise with signal.reason, like
// real fetch. honoursAbort = false: the transport ignores the signal and only settles when the
// test says so.
function installFetch(honoursAbort: boolean): void {
  fetchMock.mockImplementation(async (input, init) => {
    const signal = init?.signal;
    if (signal === undefined || signal === null) {
      throw new Error('fetch was called without a signal');
    }

    let settle: (outcome: Outcome) => void = () => {};
    const settled = new Promise<Outcome>((resolve) => {
      settle = resolve;
    });
    let rejection: { readonly reason: unknown } | undefined;
    transports.push({
      url: urlOf(input),
      signal,
      finish: (response) => {
        settle({ kind: 'response', response });
      },
      fail: (error) => {
        settle({ kind: 'failure', error });
      },
      rejection: () => rejection,
    });

    const outcome = honoursAbort
      ? await Promise.race([settled, waitForAbort(signal).then(() => undefined)])
      : await settled;

    if (outcome === undefined) {
      rejection = { reason: signal.reason };
      signal.throwIfAborted();
      throw new Error('Expected the signal to be aborted');
    }
    if (outcome.kind === 'failure') {
      throw outcome.error;
    }
    return outcome.response;
  });
}

function transportAt(index: number): Transport {
  const transport = transports[index];
  if (transport === undefined) {
    throw new Error(`Expected fetch call #${index + 1}, but only ${transports.length} happened`);
  }
  return transport;
}

function currentState(): SearchState {
  const state = states.at(-1);
  if (state === undefined) {
    throw new Error('No state was published');
  }
  return state;
}

function reasonOf(signal: AbortSignal): unknown {
  const reason: unknown = signal.reason;
  return reason;
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

function start(): SearchController {
  return createSearchController((state) => {
    states.push(state);
  });
}

function expectNoSpainAndNoError(): void {
  const showedSpain = states.some(
    (state) =>
      state.status === 'results' && state.countries.some((country) => country.id === 'ESP'),
  );
  const showedSpainQuery = states.some(
    (state) => state.status === 'results' && state.query === 'spain',
  );
  expect(showedSpain).toBe(false);
  expect(showedSpainQuery).toBe(false);
  expect(states.some((state) => state.status === 'error')).toBe(false);
}

describe('request race: "spain" is in flight while "france" is typed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    transports = [];
    states = [];
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('really cancels the earlier request, and the later transport completion changes nothing', async () => {
    installFetch(true);
    const controller = start();

    // 1. "spain" is typed and, after the debounce, its request is in flight.
    controller.setQuery('spain');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const spain = transportAt(0);
    expect(spain.url).toBe('https://countries.dev/name/spain');
    expect(spain.signal.aborted).toBe(false);

    // 2. "france" is typed: the first request is aborted right now, before any timer advances
    // and before the second fetch exists.
    controller.setQuery('france');
    expect(spain.signal.aborted).toBe(true);
    expect(reasonOf(spain.signal)).toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 3. After the debounce the second request starts.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const france = transportAt(1);
    expect(france.url).toBe('https://countries.dev/name/france');
    expect(france.signal.aborted).toBe(false);
    expect(currentState()).toStrictEqual({ status: 'loading', query: 'france' });

    // The abort rejected the first fetch Promise with the signal's own reason.
    expect(spain.rejection()).toStrictEqual({ reason: reasonOf(spain.signal) });

    // 4. The second request finishes first and publishes France.
    france.finish(okResponse([franceRaw]));
    await flush();
    expect(currentState()).toStrictEqual({
      status: 'results',
      query: 'france',
      countries: [franceView],
    });

    // 5. The first transport completes later (a separate event of the bench). It cannot resolve
    // the already rejected fetch Promise, and the state stays on France.
    spain.finish(okResponse([spainRaw]));
    await flush();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);

    expect(currentState()).toStrictEqual({
      status: 'results',
      query: 'france',
      countries: [franceView],
    });
    expectNoSpainAndNoError();
    expect(spain.signal.aborted).toBe(true);
    expect(france.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  // The transport below ignores the signal on purpose. The real searchCountries already stops
  // waiting when its signal aborts, so this test alone does not prove that the controller's own
  // "is this request still current" check is needed; it proves the end result stays correct
  // even for a transport that completes long after it was cancelled.
  it('keeps France when a transport that ignores cancellation answers late', async () => {
    installFetch(false);
    const controller = start();

    controller.setQuery('spain');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const spain = transportAt(0);

    controller.setQuery('france');
    expect(spain.signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const france = transportAt(1);
    france.finish(okResponse([franceRaw]));
    await flush();
    expect(currentState()).toStrictEqual({
      status: 'results',
      query: 'france',
      countries: [franceView],
    });

    spain.finish(okResponse([spainRaw]));
    await flush();

    expect(currentState()).toStrictEqual({
      status: 'results',
      query: 'france',
      countries: [franceView],
    });
    expectNoSpainAndNoError();
  });

  it('shows no error when a transport that ignores cancellation fails late', async () => {
    installFetch(false);
    const controller = start();

    controller.setQuery('spain');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const spain = transportAt(0);

    controller.setQuery('france');
    expect(spain.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    transportAt(1).finish(okResponse([franceRaw]));
    await flush();

    spain.fail(new TypeError('Failed to fetch'));
    await flush();

    expect(currentState()).toStrictEqual({
      status: 'results',
      query: 'france',
      countries: [franceView],
    });
    expectNoSpainAndNoError();
  });
});
