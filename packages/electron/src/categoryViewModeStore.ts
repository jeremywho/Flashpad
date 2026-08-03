import {
  CATEGORY_VIEW_MODE_STORAGE_KEY,
  parseCategoryViewModes,
  withCategoryViewMode,
  categoryPrefersPreview,
} from '@shared/categoryViewMode';

function load(): Record<string, 'edit' | 'preview'> {
  try {
    return parseCategoryViewModes(localStorage.getItem(CATEGORY_VIEW_MODE_STORAGE_KEY));
  } catch {
    return {};
  }
}

/** Whether the given category should open notes in Preview by default. */
export function categoryDefaultsToPreview(categoryId?: string): boolean {
  return categoryPrefersPreview(load(), categoryId);
}

/** Remember the view mode the user just chose for this category. */
export function rememberCategoryViewMode(categoryId: string | undefined, previewMode: boolean): void {
  try {
    const next = withCategoryViewMode(load(), categoryId, previewMode ? 'preview' : 'edit');
    localStorage.setItem(CATEGORY_VIEW_MODE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, quota) — preference just won't persist.
  }
}
