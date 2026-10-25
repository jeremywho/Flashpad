export const CATEGORY_PRESET_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
];

export const NEW_CATEGORY_NAME = 'New category';

export function nextCategoryColor(categories: Array<{ color: string }>): string {
  const uses = new Map(CATEGORY_PRESET_COLORS.map((color) => [color, 0]));
  for (const category of categories) {
    const key = category.color.toLowerCase();
    if (uses.has(key)) uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  let best = CATEGORY_PRESET_COLORS[0];
  for (const color of CATEGORY_PRESET_COLORS) {
    if ((uses.get(color) ?? 0) < (uses.get(best) ?? 0)) best = color;
  }
  return best;
}
