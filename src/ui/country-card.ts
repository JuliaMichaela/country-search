import type { CountryView } from '../types.js';
import { createElement } from './dom.js';

const populationFormat = new Intl.NumberFormat('en-US');

function createEmojiFlag(country: CountryView): HTMLElement | undefined {
  if (country.flagEmoji === '') {
    return undefined;
  }
  return createElement('span', {
    className: 'flag-emoji',
    text: country.flagEmoji,
    attributes: { role: 'img', 'aria-label': `Flag of ${country.name}` },
  });
}

// The flag image when there is a URL; if it is missing or fails to load, the emoji instead.
function createFlag(country: CountryView): HTMLElement {
  const flag = createElement('div', { className: 'flag' });
  const emoji = createEmojiFlag(country);

  if (country.flagUrl === '') {
    if (emoji !== undefined) {
      flag.append(emoji);
    }
    return flag;
  }

  const image = createElement('img', {
    className: 'flag-image',
    attributes: {
      src: country.flagUrl,
      alt: `Flag of ${country.name}`,
      width: '64',
      height: '48',
      loading: 'lazy',
    },
  });
  image.addEventListener(
    'error',
    () => {
      if (emoji === undefined) {
        image.remove();
      } else {
        image.replaceWith(emoji);
      }
    },
    { once: true },
  );
  flag.append(image);
  return flag;
}

function createFact(label: string, value: string): HTMLElement {
  return createElement('div', { className: 'fact' }, [
    createElement('dt', { text: label }),
    createElement('dd', { text: value }),
  ]);
}

export function createCountryCard(country: CountryView): HTMLLIElement {
  const facts = createElement('dl', { className: 'facts' }, [
    createFact('Capital', country.capital ?? 'Not available'),
    createFact('Region', country.region),
    createFact('Population', populationFormat.format(country.population)),
  ]);
  return createElement('li', { className: 'country-card' }, [
    createFlag(country),
    createElement('h2', { className: 'country-name', text: country.name }),
    facts,
  ]);
}
