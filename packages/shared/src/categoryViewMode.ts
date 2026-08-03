// Per-category default view mode (Edit vs Preview) for the note editor.
//
// The preference is "sticky": the last mode a user toggles to while viewing a
// note in a given category becomes that category's default the next time they
// open a note there. Storage is platform-specific (localStorage on desktop/web,
// AsyncStorage on mobile) — this module only holds the pure, storage-agnostic
// logic so every platform derives the same behavior from the same serialized map.

export type NoteViewMode = 'edit' | 'preview';

/** Storage key holding the serialized categoryId -> NoteViewMode map. */
export const CATEGORY_VIEW_MODE_STORAGE_KEY = 'flashpad-category-view-modes';

/** Bucket for notes with no category (inbox / uncategorized). */
const UNCATEGORIZED_KEY = '__uncategorized__';

export function categoryViewModeKey(categoryId?: string | null): string {
  return categoryId || UNCATEGORIZED_KEY;
}

/** Parse a stored map, tolerating missing/corrupt data and unknown values. */
export function parseCategoryViewModes(
  raw: string | null | undefined
): Record<string, NoteViewMode> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, NoteViewMode> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === 'edit' || value === 'preview') {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Return a new map with the category's remembered mode updated. */
export function withCategoryViewMode(
  modes: Record<string, NoteViewMode>,
  categoryId: string | undefined | null,
  mode: NoteViewMode
): Record<string, NoteViewMode> {
  return { ...modes, [categoryViewModeKey(categoryId)]: mode };
}

/**
 * True when the category's remembered mode is Preview. Defaults to false
 * (Edit) when the category has no stored preference.
 */
export function categoryPrefersPreview(
  modes: Record<string, NoteViewMode>,
  categoryId?: string | null
): boolean {
  return modes[categoryViewModeKey(categoryId)] === 'preview';
}
