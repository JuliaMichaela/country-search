import { API_BASE, TIMEOUT_MS } from './config.js';
import { HttpError } from './http-error.js';
import { mapCountryResponse } from './map-country.js';
import { createTimeoutSignal } from './timeout.js';
import type { ApiCountry, ApiCurrency, ApiFlags, ApiLanguage, CountryView } from './types.js';

// --- Runtime checks of the API boundary (the response body is `unknown`) ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function isArrayOf<T>(value: unknown, isItem: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(isItem);
}

function isApiFlags(value: unknown): value is ApiFlags {
  return isRecord(value) && isString(value.svg) && isString(value.png);
}

function isApiLanguage(value: unknown): value is ApiLanguage {
  return isRecord(value) && isString(value.name);
}

function isApiCurrency(value: unknown): value is ApiCurrency {
  return isRecord(value) && isString(value.code) && isString(value.name) && isString(value.symbol);
}

function isApiCountry(value: unknown): value is ApiCountry {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.nativeName) &&
    isString(value.alpha3Code) &&
    isString(value.flag) &&
    isApiFlags(value.flags) &&
    isString(value.region) &&
    isString(value.subregion) &&
    isNumber(value.population) &&
    isString(value.demonym) &&
    typeof value.independent === 'boolean' &&
    isArrayOf(value.languages, isApiLanguage) &&
    (value.capital === undefined || isString(value.capital)) &&
    (value.area === undefined || isNumber(value.area)) &&
    (value.currencies === undefined || isArrayOf(value.currencies, isApiCurrency)) &&
    (value.borders === undefined || isArrayOf(value.borders, isString))
  );
}

function parseCountries(data: unknown): readonly ApiCountry[] {
  if (!Array.isArray(data) || !data.every(isApiCountry)) {
    throw new Error('Unexpected response from the countries API');
  }
  return data;
}

// --- Waiting for a promise, but not past an abort ---

const ABORTED = Symbol('aborted');

// Settles with the promise, or rejects with signal.reason as soon as the signal aborts, even if
// the promise itself never reacts to the signal. The abort listener is always removed, and a
// late rejection of the abandoned promise stays handled because Promise.race subscribes to it.
async function waitUnlessAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let removeListener = (): void => {};
  const aborted = new Promise<typeof ABORTED>((resolve) => {
    if (signal.aborted) {
      resolve(ABORTED);
      return;
    }
    const onAbort = (): void => {
      resolve(ABORTED);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    removeListener = (): void => {
      signal.removeEventListener('abort', onAbort);
    };
  });

  try {
    const result = await Promise.race([promise, aborted]);
    if (result === ABORTED) {
      signal.throwIfAborted();
      throw new Error('Aborted');
    }
    return result;
  } finally {
    removeListener();
  }
}

// --- Public API ---

export async function searchCountries(
  query: string,
  signal: AbortSignal,
): Promise<readonly CountryView[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery === '') {
    return [];
  }

  // An already cancelled request rejects with its own reason, without fetch or a timer.
  signal.throwIfAborted();

  const timeout = createTimeoutSignal(signal, TIMEOUT_MS);
  try {
    const url = `${API_BASE}/name/${encodeURIComponent(trimmedQuery)}`;
    const response = await waitUnlessAborted(
      fetch(url, { signal: timeout.signal }),
      timeout.signal,
    );

    if (response.status === 404) {
      return [];
    }
    if (!response.ok) {
      throw new HttpError(response.status);
    }

    // The timeout also covers reading the body, not only receiving the headers.
    const data = await waitUnlessAborted<unknown>(response.json(), timeout.signal);
    return parseCountries(data).map((country) => mapCountryResponse(country));
  } finally {
    timeout.dispose();
  }
}
