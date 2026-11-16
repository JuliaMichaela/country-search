import type { SearchState } from './types.js';

export interface SearchController {
  setQuery(query: string): void;
  retry(): void;
  dispose(): void;
}

export const createSearchController: (
  onState: (state: SearchState) => void,
) => SearchController = () => {
  throw new Error('Not implemented');
};
