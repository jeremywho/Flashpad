import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CATEGORY_VIEW_MODE_STORAGE_KEY,
  parseCategoryViewModes,
  withCategoryViewMode,
  categoryPrefersPreview,
} from '@flashpad/shared';

/** Whether the given category should open notes in Preview by default. */
export async function categoryDefaultsToPreview(categoryId?: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORY_VIEW_MODE_STORAGE_KEY);
    return categoryPrefersPreview(parseCategoryViewModes(raw), categoryId);
  } catch {
    return false;
  }
}

/** Remember the view mode the user just chose for this category. */
export async function rememberCategoryViewMode(
  categoryId: string | undefined,
  previewMode: boolean
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORY_VIEW_MODE_STORAGE_KEY);
    const next = withCategoryViewMode(parseCategoryViewModes(raw), categoryId, previewMode ? 'preview' : 'edit');
    await AsyncStorage.setItem(CATEGORY_VIEW_MODE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — preference just won't persist.
  }
}
