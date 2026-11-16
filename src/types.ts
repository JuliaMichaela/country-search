// Shape of a country as returned by GET /name/{name} on countries.dev (verified against the
// live API). Only fields the app uses are described. These are compile-time types, not runtime
// validation: a response body must still be checked as `unknown` at the API boundary.

export interface ApiFlags {
  readonly svg: string;
  readonly png: string;
}

export interface ApiLanguage {
  readonly name: string;
}

export interface ApiCurrency {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
}

export interface ApiCountry {
  readonly name: string;
  readonly nativeName: string;
  /** ISO 3166-1 alpha-3 code; also the format used by `borders`. */
  readonly alpha3Code: string;
  /** Flag emoji, not a URL. */
  readonly flag: string;
  readonly flags: ApiFlags;
  readonly region: string;
  readonly subregion: string;
  readonly population: number;
  readonly demonym: string;
  readonly independent: boolean;
  readonly languages: readonly ApiLanguage[];
  /** A single string; absent for a few territories such as Antarctica. */
  readonly capital?: string;
  /** Absent for some territories. */
  readonly area?: number;
  /** Absent for Antarctica. */
  readonly currencies?: readonly ApiCurrency[];
  /** Alpha-3 codes of neighbours; absent for countries without land borders. */
  readonly borders?: readonly string[];
}

export interface CurrencyView {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
}

/** Data for a country card and its detailed view. */
export interface CountryView {
  readonly id: string;
  readonly name: string;
  readonly nativeName: string;
  readonly flagEmoji: string;
  readonly flagUrl: string;
  readonly region: string;
  readonly subregion: string;
  readonly population: number;
  readonly demonym: string;
  readonly independent: boolean;
  readonly languages: readonly string[];
  readonly capital?: string;
  readonly area?: number;
  readonly currencies?: readonly CurrencyView[];
  /** Alpha-3 codes of neighbouring countries. */
  readonly borders?: readonly string[];
}

/** Why a search failed, in terms the UI can describe to the user. */
export type SearchError =
  | { readonly kind: 'timeout' }
  | { readonly kind: 'http'; readonly status: number }
  | { readonly kind: 'network' };

export type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly query: string }
  | { readonly status: 'empty'; readonly query: string }
  | {
      readonly status: 'results';
      readonly query: string;
      readonly countries: readonly CountryView[];
    }
  | { readonly status: 'error'; readonly query: string; readonly error: SearchError };
