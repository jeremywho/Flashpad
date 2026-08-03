import {
  parseCategoryViewModes,
  withCategoryViewMode,
  categoryPrefersPreview,
  categoryViewModeKey,
  CATEGORY_VIEW_MODE_STORAGE_KEY,
} from '@shared/categoryViewMode';

describe('categoryViewMode', () => {
  it('has a stable storage key', () => {
    expect(CATEGORY_VIEW_MODE_STORAGE_KEY).toBe('flashpad-category-view-modes');
  });

  it('buckets uncategorized notes under a shared key', () => {
    expect(categoryViewModeKey(undefined)).toBe('__uncategorized__');
    expect(categoryViewModeKey('')).toBe('__uncategorized__');
    expect(categoryViewModeKey('cat_123')).toBe('cat_123');
  });

  describe('parseCategoryViewModes', () => {
    it('returns empty for missing/blank input', () => {
      expect(parseCategoryViewModes(null)).toEqual({});
      expect(parseCategoryViewModes(undefined)).toEqual({});
      expect(parseCategoryViewModes('')).toEqual({});
    });

    it('returns empty for corrupt JSON instead of throwing', () => {
      expect(parseCategoryViewModes('{not json')).toEqual({});
    });

    it('drops unknown values, keeps valid ones', () => {
      const raw = JSON.stringify({ cat_a: 'preview', cat_b: 'edit', cat_c: 'bogus', cat_d: 5 });
      expect(parseCategoryViewModes(raw)).toEqual({ cat_a: 'preview', cat_b: 'edit' });
    });
  });

  describe('withCategoryViewMode', () => {
    it('adds/updates a category without mutating the input', () => {
      const before = { cat_a: 'edit' as const };
      const after = withCategoryViewMode(before, 'cat_a', 'preview');
      expect(after).toEqual({ cat_a: 'preview' });
      expect(before).toEqual({ cat_a: 'edit' });
    });

    it('routes undefined category to the uncategorized bucket', () => {
      expect(withCategoryViewMode({}, undefined, 'preview')).toEqual({ __uncategorized__: 'preview' });
    });
  });

  describe('categoryPrefersPreview', () => {
    it('is true only when the stored mode is preview', () => {
      const modes = { cat_a: 'preview' as const, cat_b: 'edit' as const };
      expect(categoryPrefersPreview(modes, 'cat_a')).toBe(true);
      expect(categoryPrefersPreview(modes, 'cat_b')).toBe(false);
    });

    it('defaults to false (edit) for an unknown category', () => {
      expect(categoryPrefersPreview({}, 'cat_unknown')).toBe(false);
      expect(categoryPrefersPreview({}, undefined)).toBe(false);
    });
  });
});
