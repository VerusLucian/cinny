import { atom } from 'jotai';

export const searchModalAtom = atom<boolean>(false);

/** Space the search is limited to (quick switcher opened from a space); undefined searches all. */
export const searchScopeAtom = atom<string | undefined>(undefined);
