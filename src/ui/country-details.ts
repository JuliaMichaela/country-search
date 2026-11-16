import type { CountryView, CurrencyView } from '../types.js';
import { NOT_AVAILABLE, createFlag, formatNumber } from './country-card.js';
import { createElement } from './dom.js';
import type { Child } from './dom.js';

const TITLE_ID = 'country-details-title';

export interface CountryDetails {
  // Removes the dialog without returning focus (used when the app moves on or unmounts).
  dispose(): void;
}

function textOrNotAvailable(value: string): string {
  return value.trim() === '' ? NOT_AVAILABLE : value;
}

// Built only from facts the API returned; nothing is inferred (e.g. from `independent`).
function describe(country: CountryView): string {
  const location = [country.subregion, country.region]
    .filter((part) => part.trim() !== '')
    .join(', ');
  const hasNativeName = country.nativeName.trim() !== '' && country.nativeName !== country.name;
  const name = hasNativeName ? `${country.name} (${country.nativeName})` : country.name;
  return location === ''
    ? `${name}: location is not available.`
    : `${name} is located in ${location}.`;
}

function listOrNotAvailable(items: readonly string[]): Child {
  if (items.length === 0) {
    return NOT_AVAILABLE;
  }
  return createElement(
    'ul',
    { className: 'detail-list' },
    items.map((item) => createElement('li', { text: item })),
  );
}

function formatCurrency(currency: CurrencyView): string {
  return `${textOrNotAvailable(currency.name)} (${textOrNotAvailable(currency.code)}), symbol: ${textOrNotAvailable(currency.symbol)}`;
}

function createRow(label: string, value: Child): HTMLElement {
  return createElement('div', { className: 'fact' }, [
    createElement('dt', { text: label }),
    createElement('dd', {}, [value]),
  ]);
}

export function openCountryDetails(
  country: CountryView,
  opener: HTMLElement,
  parent: HTMLElement,
  onClosed: () => void,
): CountryDetails {
  const closeButton = createElement('button', {
    className: 'close-button',
    text: 'Close',
    attributes: { type: 'button' },
  });
  const rows = createElement('dl', { className: 'facts' }, [
    createRow('Native name', textOrNotAvailable(country.nativeName)),
    createRow('Region', textOrNotAvailable(country.region)),
    createRow('Subregion', textOrNotAvailable(country.subregion)),
    createRow('Capital', country.capital ?? NOT_AVAILABLE),
    createRow('Population', formatNumber(country.population)),
    createRow(
      'Area',
      country.area === undefined ? NOT_AVAILABLE : `${formatNumber(country.area)} km²`,
    ),
    createRow('Independence', country.independent ? 'Independent' : 'Not independent'),
    createRow('Languages', listOrNotAvailable(country.languages)),
    createRow('Currencies', listOrNotAvailable((country.currencies ?? []).map(formatCurrency))),
    createRow('Borders (alpha-3 codes)', listOrNotAvailable(country.borders ?? [])),
  ]);
  const dialog = createElement(
    'dialog',
    { className: 'country-details', attributes: { 'aria-labelledby': TITLE_ID } },
    [
      createElement('div', { className: 'dialog-header' }, [
        createFlag(country),
        createElement('h2', { text: country.name, attributes: { id: TITLE_ID } }),
        closeButton,
      ]),
      createElement('div', { className: 'dialog-body' }, [
        createElement('p', { className: 'description', text: describe(country) }),
        rows,
      ]),
    ],
  );

  const onCloseClick = (): void => {
    dialog.close();
  };

  // Fires for Escape, the Close button and dialog.close(): the user is done with the dialog.
  const onClose = (): void => {
    release();
    if (opener.isConnected) {
      opener.focus();
    }
    onClosed();
  };

  function release(): void {
    closeButton.removeEventListener('click', onCloseClick);
    dialog.removeEventListener('close', onClose);
    dialog.remove();
  }

  closeButton.addEventListener('click', onCloseClick);
  dialog.addEventListener('close', onClose);
  parent.append(dialog);
  dialog.showModal();

  return {
    dispose(): void {
      release();
    },
  };
}
