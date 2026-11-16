import type { CountryView } from '../types.js';
import { createElement } from './dom.js';

const numberFormat = new Intl.NumberFormat('en-US');

export const NOT_AVAILABLE = 'Not available';

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

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
export function createFlag(country: CountryView): HTMLElement {
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

export type OpenDetails = (country: CountryView, opener: HTMLButtonElement) => void;

// The only interactive element is the "Details" button. A click anywhere on the card, the
// button included, reaches the single listener on the card, so it opens details exactly once.
export function createCountryCard(country: CountryView, onOpen: OpenDetails): HTMLLIElement {
  const facts = createElement('dl', { className: 'facts' }, [
    createFact('Capital', country.capital ?? NOT_AVAILABLE),
    createFact('Region', country.region),
    createFact('Population', formatNumber(country.population)),
  ]);
  const opener = createElement('button', {
    className: 'details-button',
    text: 'Details',
    attributes: {
      type: 'button',
      'aria-haspopup': 'dialog',
      'aria-label': `Show details for ${country.name}`,
    },
  });
  const card = createElement('li', { className: 'country-card' }, [
    createFlag(country),
    createElement('h2', { className: 'country-name', text: country.name }),
    facts,
    opener,
  ]);
  card.addEventListener('click', () => {
    onOpen(country, opener);
  });
  return card;
}
