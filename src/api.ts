import type { CountryView } from './types.js';

export const searchCountries: (
  query: string,
  signal: AbortSignal,
) => Promise<readonly CountryView[]> = () => {
  throw new Error('Not implemented');
};
