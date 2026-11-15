import type { ApiCountry, CountryView } from './types.js';

export function mapCountryResponse(raw: ApiCountry): CountryView {
  const { capital, area, currencies, borders } = raw;

  return {
    id: raw.alpha3Code,
    name: raw.name,
    nativeName: raw.nativeName,
    flagEmoji: raw.flag,
    flagUrl: raw.flags.svg !== '' ? raw.flags.svg : raw.flags.png,
    region: raw.region,
    subregion: raw.subregion,
    population: raw.population,
    demonym: raw.demonym,
    independent: raw.independent,
    languages: raw.languages.map((language) => language.name),
    ...(capital === undefined ? {} : { capital }),
    ...(area === undefined ? {} : { area }),
    ...(currencies === undefined
      ? {}
      : {
          currencies: currencies.map(({ code, name, symbol }) => ({ code, name, symbol })),
        }),
    ...(borders === undefined ? {} : { borders: [...borders] }),
  };
}
