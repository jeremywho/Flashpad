import { useRef, useState } from 'react';
import { measureCssValue, measureFromDrag, EditorMeasure } from '@shared/index';
import { useAppearance } from '../theme/AppearanceProvider';

export function EditorColumn({ children }: { children: React.ReactNode }) {
  const { setAppearance } = useAppearance();
  const columnRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const draggedRef = useRef<EditorMeasure | undefined>(undefined);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const applyLive = (measure: EditorMeasure) => {
    const css = measureCssValue(measure);
    if (css) document.documentElement.style.setProperty('--measure', css);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggedRef.current = undefined;
    draggingRef.current = true;
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !columnRef.current || !probeRef.current) return;
    const rect = columnRef.current.getBoundingClientRect();
    const measure = measureFromDrag(
      e.clientX - (rect.left + rect.width / 2),
      probeRef.current.getBoundingClientRect().width,
      rect.width
    );
    if (measure === null) return;
    draggedRef.current = measure;
    applyLive(measure);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    if (draggedRef.current !== undefined) {
      setAppearance({ editorMeasure: draggedRef.current });
    }
  };

  const handleProps = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp,
    onDoubleClick: () => setAppearance({ editorMeasure: null }),
    role: 'separator' as const,
    'aria-orientation': 'vertical' as const,
    title: 'Drag to resize the text column. Double-click to reset.',
  };

  return (
    <div ref={columnRef} className={`note-editor-column${dragging ? ' resizing' : ''}`}>
      {children}
      <div {...handleProps} className="note-editor-measure-handle left" aria-label="Resize text column from the left" />
      <div {...handleProps} className="note-editor-measure-handle right" aria-label="Resize text column from the right" />
      <span ref={probeRef} className="note-editor-measure-probe" aria-hidden="true" />
    </div>
  );
}
