import { searchCountries } from './api.js';
import { DEBOUNCE_MS } from './config.js';
import { debounce } from './debounce.js';
import { classifyError } from './errors.js';
import type { SearchState } from './types.js';

export interface SearchController {
  setQuery(query: string): void;
  retry(): void;
  dispose(): void;
}

export function createSearchController(onState: (state: SearchState) => void): SearchController {
  let closed = false;
  let state: SearchState = { status: 'idle' };
  // The controller of the request that is allowed to publish. Replacing or clearing it makes
  // every older request stale, so a finishing old request can never touch a newer one.
  let active: AbortController | undefined;

  function publish(next: SearchState): void {
    if (closed) {
      return;
    }
    state = next;
    onState(next);
  }

  // First makes the running request stale, then really aborts it.
  function cancelActive(): void {
    const previous = active;
    active = undefined;
    previous?.abort();
  }

  // Resolves with the state to publish, or undefined for a cancellation. Never rejects.
  async function execute(query: string, signal: AbortSignal): Promise<SearchState | undefined> {
    try {
      const countries = await searchCountries(query, signal);
      return countries.length === 0
        ? { status: 'empty', query }
        : { status: 'results', query, countries };
    } catch (error: unknown) {
      const classified = classifyError(error);
      return classified.kind === 'cancelled'
        ? undefined
        : { status: 'error', query, error: classified };
    }
  }

  function run(query: string): void {
    cancelActive();
    const controller = new AbortController();
    active = controller;
    publish({ status: 'loading', query });

    void execute(query, controller.signal).then((outcome) => {
      // A newer request or a cancel/dispose has replaced this one: it must not publish or
      // clear the reference to the newer request.
      if (active !== controller) {
        return;
      }
      active = undefined;
      if (outcome !== undefined) {
        publish(outcome);
      }
    });
  }

  const scheduleRun = debounce((query: string): void => {
    run(query);
  }, DEBOUNCE_MS);

  publish(state);

  return {
    setQuery(rawQuery: string): void {
      if (closed) {
        return;
      }
      cancelActive();
      scheduleRun.cancel();
      // Previous results are dropped while the new query waits for the debounce.
      publish({ status: 'idle' });

      const query = rawQuery.trim();
      if (query !== '') {
        scheduleRun(query);
      }
    },

    retry(): void {
      const current = state;
      if (closed || current.status !== 'error') {
        return;
      }
      scheduleRun.cancel();
      run(current.query);
    },

    dispose(): void {
      closed = true;
      scheduleRun.cancel();
      cancelActive();
    },
  };
}
