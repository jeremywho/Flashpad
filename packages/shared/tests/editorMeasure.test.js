const test = require('node:test');
const assert = require('node:assert/strict');
const {
  measureCssValue,
  measureFromDrag,
  normalizeMeasure,
  MIN_MEASURE_CH,
  MAX_MEASURE_CH,
} = require('../dist/editorMeasure');

test('normalizeMeasure keeps full, rounds and clamps numbers, and drops anything else', () => {
  assert.equal(normalizeMeasure('full'), 'full');
  assert.equal(normalizeMeasure(120.4), 120);
  assert.equal(normalizeMeasure(5), MIN_MEASURE_CH);
  assert.equal(normalizeMeasure(1e9), MAX_MEASURE_CH);
  assert.equal(normalizeMeasure(null), null);
  assert.equal(normalizeMeasure(undefined), null);
  assert.equal(normalizeMeasure('120'), null);
  assert.equal(normalizeMeasure(Number.NaN), null);
});

test('measureCssValue maps the default to no override', () => {
  assert.equal(measureCssValue(null), null);
  assert.equal(measureCssValue('full'), '100%');
  assert.equal(measureCssValue(120), '120ch');
});

test('measureFromDrag uses twice the distance from the centre, on either side', () => {
  assert.equal(measureFromDrag(500, 10, 1600), 100);
  assert.equal(measureFromDrag(-500, 10, 1600), 100);
});

test('measureFromDrag never goes narrower than the minimum', () => {
  assert.equal(measureFromDrag(20, 10, 1600), MIN_MEASURE_CH);
  assert.equal(measureFromDrag(0, 10, 1600), MIN_MEASURE_CH);
});

test('measureFromDrag snaps to full width near the pane edge', () => {
  assert.equal(measureFromDrag(776, 10, 1600), 'full');
  assert.equal(measureFromDrag(900, 10, 1600), 'full');
  assert.equal(measureFromDrag(700, 10, 1600), 140);
});

test('measureFromDrag ignores unmeasured layouts', () => {
  assert.equal(measureFromDrag(500, 0, 1600), null);
  assert.equal(measureFromDrag(500, 10, 0), null);
});
