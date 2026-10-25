export type EditorMeasure = number | 'full' | null;

export const MIN_MEASURE_CH = 40;
export const MAX_MEASURE_CH = 1000;
export const MIN_SIDE_PADDING_PX = 24;

export function normalizeMeasure(value: unknown): EditorMeasure {
  if (value === 'full') return 'full';
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(MIN_MEASURE_CH, Math.min(MAX_MEASURE_CH, Math.round(value)));
}

export function measureCssValue(measure: EditorMeasure): string | null {
  if (measure === null) return null;
  return measure === 'full' ? '100%' : `${measure}ch`;
}

// The column is centred, so dragging either edge sets the width to twice the
// pointer's distance from the centre. Within two characters of the pane's
// minimum padding the column snaps to full width.
export function measureFromDrag(pointerOffsetFromCenterPx: number, chPx: number, columnPx: number): EditorMeasure {
  if (!(chPx > 0) || !(columnPx > 0)) return null;
  const textPx = 2 * Math.abs(pointerOffsetFromCenterPx);
  const fullPx = columnPx - 2 * MIN_SIDE_PADDING_PX;
  if (textPx >= fullPx - 2 * chPx) return 'full';
  return normalizeMeasure(textPx / chPx);
}
