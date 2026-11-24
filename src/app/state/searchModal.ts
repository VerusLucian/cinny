import { atom } from 'jotai';

export type SearchModalState = {
  open: boolean;
  /** Space the search is limited to (quick switcher opened from a space); undefined searches all. */
  scopeSpaceId?: string;
};

export const searchModalAtom = atom<SearchModalState>({ open: false });
