import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { searchCountries } from '../src/api.js';
import { TIMEOUT_MS } from '../src/config.js';
import { HttpError } from '../src/http-error.js';
import type { CountryView } from '../src/types.js';

// --- Fixtures: raw API payloads (unknown JSON) and the views they must become. ---

const spainRaw = {
  name: 'Spain',
  nativeName: 'España',
  alpha2Code: 'ES',
  alpha3Code: 'ESP',
  flag: '🇪🇸',
  flags: { svg: 'https://flagcdn.com/es.svg', png: 'https://flagcdn.com/w320/es.png' },
  region: 'Europe',
  subregion: 'Southern Europe',
  population: 47351567,
  demonym: 'Spanish',
  independent: true,
  languages: [{ name: 'Spanish', iso639_1: 'es', iso639_2: 'spa', nativeName: 'Español' }],
  capital: 'Madrid',
  area: 505992,
  currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }],
  borders: ['AND', 'FRA', 'GIB', 'PRT', 'MAR'],
  gini: 34.7,
};

const spainView: CountryView = {
  id: 'ESP',
  name: 'Spain',
  nativeName: 'España',
  flagEmoji: '🇪🇸',
  flagUrl: 'https://flagcdn.com/es.svg',
  region: 'Europe',
  subregion: 'Southern Europe',
  population: 47351567,
  demonym: 'Spanish',
  independent: true,
  languages: ['Spanish'],
  capital: 'Madrid',
  area: 505992,
  currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }],
  borders: ['AND', 'FRA', 'GIB', 'PRT', 'MAR'],
};

// Only required fields: capital, area, currencies and borders are absent.
const bouvetRaw = {
  name: 'Bouvet Island',
  nativeName: 'Bouvetøya',
  alpha3Code: 'BVT',
  flag: '🇧🇻',
  flags: { svg: 'https://flagcdn.com/bv.svg', png: 'https://flagcdn.com/w320/bv.png' },
  region: 'Antarctic Ocean',
  subregion: 'Southern Hemisphere',
  population: 0,
  demonym: 'Bouvet Islander',
  independent: false,
  languages: [{ name: 'Norwegian' }],
};

const bouvetView: CountryView = {
  id: 'BVT',
  name: 'Bouvet Island',
  nativeName: 'Bouvetøya',
  flagEmoji: '🇧🇻',
  flagUrl: 'https://flagcdn.com/bv.svg',
  region: 'Antarctic Ocean',
  subregion: 'Southern Hemisphere',
  population: 0,
  demonym: 'Bouvet Islander',
  independent: false,
  languages: ['Norwegian'],
};

function withFields(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...spainRaw, ...overrides };
}

function withoutField(key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(spainRaw).filter(([name]) => name !== key));
}

// --- Test doubles ---

let fetchMock: Mock<typeof fetch>;

// A real Response whose json() is a spy, so tests can see whether the body was read.
// json() is stubbed because real body streams are not reliable under fake timers.
function respond(status: number, body?: unknown) {
  const response = new Response(null, { status });
  const json = vi.spyOn(response, 'json');
  if (body !== undefined) {
    json.mockResolvedValue(body);
  }
  return { response, json };
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

// A fetch that never answers on its own and rejects with signal.reason once aborted.
function pendingFetch(): void {
  fetchMock.mockImplementation(async (_input, init) => {
    const signal = init?.signal;
    if (signal === undefined || signal === null) {
      throw new Error('fetch was called without a signal');
    }
    await waitForAbort(signal);
    signal.throwIfAborted();
    return new Response(null, { status: 500 });
  });
}

function lastFetchCall(): { url: string; signal: AbortSignal } {
  const call = fetchMock.mock.calls.at(-1);
  if (call === undefined) {
    throw new Error('fetch was not called');
  }
  const [input, init] = call;
  const signal = init?.signal;
  if (typeof input !== 'string' || signal === undefined || signal === null) {
    throw new Error('fetch must be called with a string URL and an init object with a signal');
  }
  return { url: input, signal };
}

// Attaches a rejection handler immediately, so no rejection is ever unhandled.
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}

function reasonOf(signal: AbortSignal): unknown {
  const reason: unknown = signal.reason;
  return reason;
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('searchCountries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('request', () => {
    it.each([
      ['spain', 'https://countries.dev/name/spain'],
      ['united states', 'https://countries.dev/name/united%20states'],
      ['Åland', 'https://countries.dev/name/%C3%85land'],
      ['рос', 'https://countries.dev/name/%D1%80%D0%BE%D1%81'],
      ['a/b?c=d&e#f', 'https://countries.dev/name/a%2Fb%3Fc%3Dd%26e%23f'],
      ['100%', 'https://countries.dev/name/100%25'],
    ])('requests %j at %s', async (query, expectedUrl) => {
      fetchMock.mockResolvedValue(respond(200, []).response);

      await searchCountries(query, new AbortController().signal);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(lastFetchCall().url).toBe(expectedUrl);
    });

    it('trims the query before building the URL', async () => {
      fetchMock.mockResolvedValue(respond(200, []).response);

      await searchCountries('  spain \t', new AbortController().signal);

      expect(lastFetchCall().url).toBe('https://countries.dev/name/spain');
    });

    it('keeps spaces inside the query', async () => {
      fetchMock.mockResolvedValue(respond(200, []).response);

      await searchCountries(' united  states ', new AbortController().signal);

      expect(lastFetchCall().url).toBe('https://countries.dev/name/united%20%20states');
    });

    it.each([[''], ['   '], ['\t\n ']])(
      'returns [] for the blank query %j without fetch or timers',
      async (query) => {
        const result = await searchCountries(query, new AbortController().signal);

        expect(result).toStrictEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      },
    );
  });

  describe('responses', () => {
    it('maps one country from a successful response', async () => {
      fetchMock.mockResolvedValue(respond(200, [spainRaw]).response);

      const result = await searchCountries('spain', new AbortController().signal);

      expect(result).toStrictEqual([spainView]);
    });

    it('maps several countries in order', async () => {
      fetchMock.mockResolvedValue(respond(200, [spainRaw, bouvetRaw]).response);

      const result = await searchCountries('s', new AbortController().signal);

      expect(result).toStrictEqual([spainView, bouvetView]);
    });

    it('returns [] for an empty successful array', async () => {
      fetchMock.mockResolvedValue(respond(200, []).response);

      const result = await searchCountries('zzz', new AbortController().signal);

      expect(result).toStrictEqual([]);
    });

    it('returns [] for 404 without reading the body', async () => {
      const { response, json } = respond(404);
      fetchMock.mockResolvedValue(response);

      const result = await searchCountries('zzzz', new AbortController().signal);

      expect(result).toStrictEqual([]);
      expect(json).not.toHaveBeenCalled();
    });

    it.each([[429], [500]])(
      'rejects with HttpError(%i) without reading the body',
      async (status) => {
        const { response, json } = respond(status);
        fetchMock.mockResolvedValue(response);

        const error = await rejection(searchCountries('spain', new AbortController().signal));

        expect(error).toBeInstanceOf(HttpError);
        expect(error).toMatchObject({ status });
        expect(json).not.toHaveBeenCalled();
      },
    );
  });

  describe('failures', () => {
    it('rethrows a network error as the same object', async () => {
      const networkError = new TypeError('Failed to fetch');
      fetchMock.mockRejectedValue(networkError);

      const error = await rejection(searchCountries('spain', new AbortController().signal));

      expect(error).toBe(networkError);
      expect(error).not.toBeInstanceOf(HttpError);
    });

    it('rethrows a JSON reading error as the same object', async () => {
      const parseError = new SyntaxError('Unexpected end of JSON input');
      const { response, json } = respond(200);
      json.mockRejectedValue(parseError);
      fetchMock.mockResolvedValue(response);

      const error = await rejection(searchCountries('spain', new AbortController().signal));

      expect(error).toBe(parseError);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('cancellation and timeout', () => {
    it('aborts the fetch signal immediately when the parent aborts, keeping the reason', async () => {
      pendingFetch();
      const parent = new AbortController();
      const parentReason = new Error('user typed again');
      const outcome = rejection(searchCountries('spain', parent.signal));
      await flush();
      const fetchSignal = lastFetchCall().signal;
      expect(fetchSignal.aborted).toBe(false);

      parent.abort(parentReason);

      expect(fetchSignal.aborted).toBe(true);
      expect(reasonOf(fetchSignal)).toBe(parentReason);
      expect(await outcome).toBe(parentReason);
    });

    it('rejects with the parent reason without calling fetch for an aborted parent', async () => {
      const parent = new AbortController();
      const parentReason = new Error('already cancelled');
      parent.abort(parentReason);

      const error = await rejection(searchCountries('spain', parent.signal));

      expect(error).toBe(parentReason);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('rejects with a TimeoutError, not an AbortError, after TIMEOUT_MS', async () => {
      pendingFetch();
      const outcome = rejection(searchCountries('spain', new AbortController().signal));
      await flush();

      await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
      expect(lastFetchCall().signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const error = await outcome;
      expect(error).toBeInstanceOf(DOMException);
      expect(error).toMatchObject({ name: 'TimeoutError' });
      expect(error).not.toMatchObject({ name: 'AbortError' });
    });

    it('times out while response.json() is still pending', async () => {
      const { response, json } = respond(200);
      json.mockImplementation(async () => {
        const { signal } = lastFetchCall();
        await waitForAbort(signal);
        signal.throwIfAborted();
        return undefined;
      });
      fetchMock.mockResolvedValue(response);
      const outcome = rejection(searchCountries('spain', new AbortController().signal));
      await flush();
      expect(json).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

      expect(await outcome).toMatchObject({ name: 'TimeoutError' });
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('response structure', () => {
    it.each<[string, unknown]>([
      ['an object instead of an array', spainRaw],
      ['null', null],
      ['a string', 'spain'],
      ['a number', 1],
      ['an array containing null', [null]],
      ['an array containing a string', ['spain']],
      ['a country with a numeric name', withFields({ name: 42 })],
      ['a country without name', withoutField('name')],
      ['a country without nativeName', withoutField('nativeName')],
      ['a country without alpha3Code', withoutField('alpha3Code')],
      ['a country with a numeric flag', withFields({ flag: 1 })],
      ['a country without flags', withoutField('flags')],
      ['a country with string flags', withFields({ flags: 'https://flagcdn.com/es.svg' })],
      ['a country with a numeric flags.svg', withFields({ flags: { svg: 1, png: 'x' } })],
      ['a country without flags.png', withFields({ flags: { svg: 'x' } })],
      ['a country with a numeric region', withFields({ region: 1 })],
      ['a country without subregion', withoutField('subregion')],
      ['a country with a string population', withFields({ population: '47351567' })],
      ['a country without demonym', withoutField('demonym')],
      ['a country with a string independent', withFields({ independent: 'yes' })],
      ['a country with non-array languages', withFields({ languages: 'Spanish' })],
      ['a country with a null language', withFields({ languages: [null] })],
      ['a country with a nameless language', withFields({ languages: [{ iso639_1: 'es' }] })],
      ['a country with a numeric language name', withFields({ languages: [{ name: 1 }] })],
      ['a country with a numeric capital', withFields({ capital: 1 })],
      ['a country with a string area', withFields({ area: '505992' })],
      ['a country with non-array currencies', withFields({ currencies: { code: 'EUR' } })],
      [
        'a country with a currency without symbol',
        withFields({ currencies: [{ code: 'EUR', name: 'Euro' }] }),
      ],
      [
        'a country with a numeric currency code',
        withFields({ currencies: [{ code: 1, name: 'Euro', symbol: '€' }] }),
      ],
      ['a country with string borders', withFields({ borders: 'FRA' })],
      ['a country with a numeric border', withFields({ borders: ['FRA', 1] })],
    ])('rejects with a plain Error for %s', async (_label, payload) => {
      fetchMock.mockResolvedValue(respond(200, payload).response);

      const error = await rejection(searchCountries('spain', new AbortController().signal));

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(HttpError);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('accepts a country without optional fields', async () => {
      fetchMock.mockResolvedValue(respond(200, [bouvetRaw]).response);

      const result = await searchCountries('bouvet', new AbortController().signal);

      expect(result).toStrictEqual([bouvetView]);
    });

    it('accepts extra fields that the app does not use', async () => {
      const withExtras = withFields({ translations: { de: 'Spanien' }, regionalBlocs: [] });
      fetchMock.mockResolvedValue(respond(200, [withExtras]).response);

      const result = await searchCountries('spain', new AbortController().signal);

      expect(result).toStrictEqual([spainView]);
    });
  });

  describe('timers', () => {
    it('leaves no active timer after success', async () => {
      fetchMock.mockResolvedValue(respond(200, [spainRaw]).response);

      await searchCountries('spain', new AbortController().signal);

      expect(vi.getTimerCount()).toBe(0);
    });

    it('leaves no active timer after an HTTP error', async () => {
      fetchMock.mockResolvedValue(respond(500).response);

      await rejection(searchCountries('spain', new AbortController().signal));

      expect(vi.getTimerCount()).toBe(0);
    });

    it('leaves no active timer after a network error', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      await rejection(searchCountries('spain', new AbortController().signal));

      expect(vi.getTimerCount()).toBe(0);
    });

    it('leaves no active timer after a cancellation', async () => {
      pendingFetch();
      const parent = new AbortController();
      const outcome = rejection(searchCountries('spain', parent.signal));
      await flush();
      expect(vi.getTimerCount()).toBe(1);

      parent.abort(new Error('cancelled'));
      await outcome;

      expect(vi.getTimerCount()).toBe(0);
    });

    it('leaves no active timer after a timeout', async () => {
      pendingFetch();
      const outcome = rejection(searchCountries('spain', new AbortController().signal));
      await flush();

      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
      await outcome;

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
