import { createSearchController } from '../search-controller.js';
import type { CountryView, SearchError, SearchState } from '../types.js';
import { createCountryCard } from './country-card.js';
import { openCountryDetails } from './country-details.js';
import type { CountryDetails } from './country-details.js';
import { createElement } from './dom.js';

const INPUT_ID = 'country-query';
const HINT_ID = 'country-query-hint';

function describeError(error: SearchError): string {
  switch (error.kind) {
    case 'network':
      return 'Could not reach the server. Check your connection and try again.';
    case 'timeout':
      return 'The server took too long to respond. Try again.';
    case 'http':
      return `The server responded with an error (HTTP ${error.status}). Try again.`;
  }
}

function describeResults(count: number, query: string): string {
  return `Found ${count} ${count === 1 ? 'country' : 'countries'} for “${query}”.`;
}

// Builds the interface inside `root` and returns a function that tears it down again.
export function mountApp(root: HTMLElement): () => void {
  const input = createElement('input', {
    attributes: {
      id: INPUT_ID,
      type: 'search',
      name: 'query',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-describedby': HINT_ID,
    },
  });
  const form = createElement('form', { attributes: { role: 'search' } }, [
    createElement('label', { text: 'Country name', attributes: { for: INPUT_ID } }),
    input,
    createElement('p', {
      className: 'hint',
      text: 'Search by the English name of a country, for example “Spain”.',
      attributes: { id: HINT_ID },
    }),
  ]);
  const status = createElement('div', {
    className: 'status',
    attributes: { role: 'status', 'aria-live': 'polite' },
  });
  const results = createElement('ul', { className: 'results' });
  const app = createElement('main', {}, [
    createElement('h1', { text: 'Country Search' }),
    form,
    status,
    results,
  ]);

  // The Retry button lives in the status area and is replaced with every state.
  let detachRetry: (() => void) | undefined;

  // At most one details dialog exists; it is removed whenever the visible content changes.
  let details: CountryDetails | undefined;

  function closeDetails(): void {
    details?.dispose();
    details = undefined;
  }

  function openDetails(country: CountryView, opener: HTMLButtonElement): void {
    closeDetails();
    details = openCountryDetails(country, opener, app, () => {
      details = undefined;
    });
  }

  function clearStatus(): void {
    detachRetry?.();
    detachRetry = undefined;
    status.replaceChildren();
  }

  function showStatus(message: string): void {
    clearStatus();
    status.textContent = message;
  }

  function showError(error: SearchError): void {
    clearStatus();
    const retry = createElement('button', { text: 'Retry', attributes: { type: 'button' } });
    const onRetry = (): void => {
      controller.retry();
      input.focus();
    };
    retry.addEventListener('click', onRetry);
    detachRetry = () => {
      retry.removeEventListener('click', onRetry);
    };
    status.append(createElement('span', { text: describeError(error) }), ' ', retry);
  }

  function render(state: SearchState): void {
    closeDetails();
    status.dataset.state = state.status;
    switch (state.status) {
      case 'idle':
        results.replaceChildren();
        showStatus(
          input.value.trim() === ''
            ? 'Start typing a country name to search.'
            : 'Waiting for you to finish typing…',
        );
        break;
      case 'loading':
        results.replaceChildren();
        showStatus('Loading…');
        break;
      case 'empty':
        results.replaceChildren();
        showStatus(`Nothing found for “${state.query}”.`);
        break;
      case 'error':
        results.replaceChildren();
        showError(state.error);
        break;
      case 'results':
        showStatus(describeResults(state.countries.length, state.query));
        results.replaceChildren(
          ...state.countries.map((country) => createCountryCard(country, openDetails)),
        );
        break;
    }
  }

  const onInput = (): void => {
    controller.setQuery(input.value);
  };
  // Enter must not submit the form (and reload the page).
  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
  };

  // The DOM and every handler above are ready: the controller publishes `idle` synchronously.
  root.append(app);
  const controller = createSearchController(render);
  input.addEventListener('input', onInput);
  form.addEventListener('submit', onSubmit);

  return () => {
    input.removeEventListener('input', onInput);
    form.removeEventListener('submit', onSubmit);
    detachRetry?.();
    detachRetry = undefined;
    controller.dispose();
    closeDetails();
    app.remove();
  };
}
