const test = require('node:test');
const assert = require('node:assert/strict');
const { CATEGORY_PRESET_COLORS, nextCategoryColor } = require('../dist/categoryColors');

test('nextCategoryColor starts at the first preset', () => {
  assert.equal(nextCategoryColor([]), CATEGORY_PRESET_COLORS[0]);
});

test('nextCategoryColor picks the first preset not yet used', () => {
  const used = CATEGORY_PRESET_COLORS.slice(0, 3).map((color) => ({ color }));
  assert.equal(nextCategoryColor(used), CATEGORY_PRESET_COLORS[3]);
});

test('nextCategoryColor fills gaps before repeating, and ignores case', () => {
  const used = [{ color: CATEGORY_PRESET_COLORS[0].toUpperCase() }, { color: CATEGORY_PRESET_COLORS[2] }];
  assert.equal(nextCategoryColor(used), CATEGORY_PRESET_COLORS[1]);
});

test('nextCategoryColor cycles once every preset is used, ignoring custom colors', () => {
  const used = [...CATEGORY_PRESET_COLORS, CATEGORY_PRESET_COLORS[0], '#123456'].map((color) => ({ color }));
  assert.equal(nextCategoryColor(used), CATEGORY_PRESET_COLORS[1]);
});
