import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from './utils/atomWithLocalStorage';

/** Ids of spaces whose room list is sorted by recent activity instead of the space structure. */
export const activitySortedSpacesAtom = atomWithLocalStorage<Set<string>>(
  'activitySortedSpaces',
  (key) => new Set(getLocalStorageItem<string[]>(key, [])),
  (key, value) => setLocalStorageItem(key, Array.from(value))
);
