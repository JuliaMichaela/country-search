import { describe, expect, it } from 'vitest';
import { mapCountryResponse } from '../src/map-country.js';
import type { ApiCountry, CountryView } from '../src/types.js';

function deepFreeze<T extends object>(value: T): T {
  const children: unknown[] = Object.values(value);
  for (const child of children) {
    if (typeof child === 'object' && child !== null) {
      deepFreeze(child);
    }
  }
  return Object.freeze(value);
}

// Required fields only: capital, area, currencies and borders are absent.
const minimalCountry: ApiCountry = {
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

const fullCountry: ApiCountry = {
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
  capital: 'Madrid',
  area: 505992,
  currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }],
  borders: ['AND', 'FRA', 'GIB', 'PRT', 'MAR'],
};

describe('mapCountryResponse', () => {
  it('maps a full country to the expected view', () => {
    const expected: CountryView = {
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

    expect(mapCountryResponse(fullCountry)).toStrictEqual(expected);
  });

  it('takes flagUrl from png when svg is an empty string', () => {
    const country: ApiCountry = {
      ...fullCountry,
      flags: { svg: '', png: 'https://flagcdn.com/w320/es.png' },
    };

    expect(mapCountryResponse(country).flagUrl).toBe('https://flagcdn.com/w320/es.png');
  });

  it('keeps an empty flagUrl and the emoji when both image URLs are empty', () => {
    const country: ApiCountry = { ...fullCountry, flags: { svg: '', png: '' } };

    const view = mapCountryResponse(country);

    expect(view.flagUrl).toBe('');
    expect(view.flagEmoji).toBe('🇪🇸');
  });

  it('leaves a missing capital missing', () => {
    const view = mapCountryResponse(minimalCountry);

    expect(view.capital).toBeUndefined();
    expect(view.name).toBe('Bouvet Island');
  });

  it('leaves a missing area missing', () => {
    const view = mapCountryResponse(minimalCountry);

    expect(view.area).toBeUndefined();
    expect(view.name).toBe('Bouvet Island');
  });

  it('leaves missing currencies and borders missing', () => {
    const view = mapCountryResponse(minimalCountry);

    expect(view.currencies).toBeUndefined();
    expect(view.borders).toBeUndefined();
    expect(view.name).toBe('Bouvet Island');
  });

  it('does not add optional fields as own properties set to undefined', () => {
    const view = mapCountryResponse(minimalCountry);

    expect(Object.hasOwn(view, 'capital')).toBe(false);
    expect(Object.hasOwn(view, 'area')).toBe(false);
    expect(Object.hasOwn(view, 'currencies')).toBe(false);
    expect(Object.hasOwn(view, 'borders')).toBe(false);
    expect(Object.hasOwn(view, 'id')).toBe(true);
  });

  it('keeps population 0, area 0 and independent false', () => {
    const country: ApiCountry = {
      ...minimalCountry,
      population: 0,
      area: 0,
      independent: false,
    };

    const view = mapCountryResponse(country);

    expect(view.population).toBe(0);
    expect(view.area).toBe(0);
    expect(view.independent).toBe(false);
    expect(Object.hasOwn(view, 'area')).toBe(true);
  });

  it('handles empty languages, currencies and borders arrays', () => {
    const country: ApiCountry = {
      ...fullCountry,
      languages: [],
      currencies: [],
      borders: [],
    };

    const view = mapCountryResponse(country);

    expect(view.languages).toStrictEqual([]);
    expect(view.currencies).toStrictEqual([]);
    expect(view.borders).toStrictEqual([]);
  });

  it('preserves the order of several languages, currencies and borders', () => {
    const country: ApiCountry = {
      ...fullCountry,
      name: 'Switzerland',
      alpha3Code: 'CHE',
      languages: [{ name: 'German' }, { name: 'French' }, { name: 'Italian' }],
      currencies: [
        { code: 'CHF', name: 'Swiss franc', symbol: 'Fr.' },
        { code: 'EUR', name: 'Euro', symbol: '€' },
      ],
      borders: ['AUT', 'FRA', 'ITA', 'LIE', 'DEU'],
    };

    const view = mapCountryResponse(country);

    expect(view.languages).toStrictEqual(['German', 'French', 'Italian']);
    expect(view.currencies).toStrictEqual([
      { code: 'CHF', name: 'Swiss franc', symbol: 'Fr.' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
    ]);
    expect(view.borders).toStrictEqual(['AUT', 'FRA', 'ITA', 'LIE', 'DEU']);
  });

  it('keeps special characters and HTML-like text as plain data', () => {
    const country: ApiCountry = {
      ...fullCountry,
      name: '<b>Côte d\'Ivoire</b> & "Co"',
      nativeName: '<img src=x onerror=alert(1)>',
      capital: '<script>alert(1)</script>',
      languages: [{ name: '<i>French</i> &amp; more' }],
      currencies: [{ code: 'XOF', name: '"CFA" <franc>', symbol: '<$>' }],
    };

    const view = mapCountryResponse(country);

    expect(view.name).toBe('<b>Côte d\'Ivoire</b> & "Co"');
    expect(view.nativeName).toBe('<img src=x onerror=alert(1)>');
    expect(view.capital).toBe('<script>alert(1)</script>');
    expect(view.languages).toStrictEqual(['<i>French</i> &amp; more']);
    expect(view.currencies).toStrictEqual([{ code: 'XOF', name: '"CFA" <franc>', symbol: '<$>' }]);
  });

  it('returns a new object', () => {
    const view = mapCountryResponse(fullCountry);

    expect(view).not.toBe(fullCountry);
  });

  it('does not share mutable references with the source data', () => {
    const view = mapCountryResponse(fullCountry);

    expect(view.languages).not.toBe(fullCountry.languages);
    expect(view.currencies).not.toBe(fullCountry.currencies);
    expect(view.borders).not.toBe(fullCountry.borders);
    expect(view.currencies?.[0]).not.toBe(fullCountry.currencies?.[0]);
  });

  it('does not modify its input and accepts a deeply frozen fixture', () => {
    const snapshot = structuredClone(fullCountry);
    const frozen = deepFreeze(structuredClone(fullCountry));

    const view = mapCountryResponse(frozen);

    expect(frozen).toStrictEqual(snapshot);
    expect(view.name).toBe('Spain');
  });

  it('gives equal values but independent objects on repeated calls', () => {
    const first = mapCountryResponse(fullCountry);
    const second = mapCountryResponse(fullCountry);

    expect(second).toStrictEqual(first);
    expect(second).not.toBe(first);
    expect(second.languages).not.toBe(first.languages);
    expect(second.currencies).not.toBe(first.currencies);
    expect(second.borders).not.toBe(first.borders);
  });
});
