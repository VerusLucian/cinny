import { MouseEventHandler, createContext, useCallback, useContext } from 'react';
import { useAtom } from 'jotai';
import { ClosedNavCategoriesAtom } from '../closedNavCategories';
import { useCategoryHandler } from '../../hooks/useCategoryHandler';

const ClosedNavCategoriesAtomContext = createContext<ClosedNavCategoriesAtom | null>(null);
export const ClosedNavCategoriesProvider = ClosedNavCategoriesAtomContext.Provider;

export const useClosedNavCategoriesAtom = (): ClosedNavCategoriesAtom => {
  const anAtom = useContext(ClosedNavCategoriesAtomContext);

  if (!anAtom) {
    throw new Error('ClosedNavCategoriesAtom is not provided!');
  }

  return anAtom;
};

export type NavCategories = {
  /**
   * Whether a category is collapsed. Categories are expanded unless `defaultClosed` is set
   * (e.g. Archived), in which case they stay collapsed until the user opens them.
   */
  isClosed: (categoryId: string, defaultClosed?: boolean) => boolean;
  /** Click handler for category headers carrying a `data-category-id` attribute. */
  handleCategoryClick: MouseEventHandler<HTMLButtonElement>;
};

/**
 * Collapse state of nav categories. The stored set holds every category whose state differs
 * from its default, so a click always toggles membership regardless of the default.
 */
export const useNavCategories = (): NavCategories => {
  const [toggled, setToggled] = useAtom(useClosedNavCategoriesAtom());

  const isClosed = useCallback(
    (categoryId: string, defaultClosed = false) => toggled.has(categoryId) !== defaultClosed,
    [toggled]
  );
  const handleCategoryClick = useCategoryHandler(setToggled, (categoryId) =>
    toggled.has(categoryId)
  );

  return { isClosed, handleCategoryClick };
};
