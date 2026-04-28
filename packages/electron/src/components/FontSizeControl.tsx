import { useEffect, useRef, useState } from 'react';
import { useAppearance } from '../theme/AppearanceProvider';

const MIN = 13;
const MAX = 22;
const DEFAULT_SIZE = 16;

export function FontSizeControl() {
  const { appearance, setAppearance } = useAppearance();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setAppearanceRef = useRef(setAppearance);
  setAppearanceRef.current = setAppearance;

  const clamp = (n: number) => Math.max(MIN, Math.min(MAX, n));
  const set = (n: number) => setAppearance({ editorFontSize: clamp(n) });

  // Keep latest appearance in a ref so the keydown listener doesn't re-register.
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const id = window.setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setAppearanceRef.current({ editorFontSize: clamp(appearanceRef.current.editorFontSize + 1) });
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setAppearanceRef.current({ editorFontSize: clamp(appearanceRef.current.editorFontSize - 1) });
      } else if (e.key === '0') {
        e.preventDefault();
        setAppearanceRef.current({ editorFontSize: DEFAULT_SIZE });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="type-size" ref={ref}>
      <button
        type="button"
        className="type-size-btn"
        onClick={() => setOpen(o => !o)}
        title="Text size"
        aria-label="Text size"
        aria-expanded={open}
      >
        <span className="type-size-glyph small">A</span>
        <span className="type-size-glyph large">A</span>
        <span className="type-size-readout">{appearance.editorFontSize}</span>
      </button>
      {open && (
        <div className="type-size-pop" role="dialog" aria-label="Text size">
          <button
            type="button"
            className="type-size-step"
            onClick={() => set(appearance.editorFontSize - 1)}
            disabled={appearance.editorFontSize <= MIN}
            aria-label="Decrease"
          >−</button>
          <input
            type="range"
            min={MIN}
            max={MAX}
            step={1}
            value={appearance.editorFontSize}
            onChange={e => set(Number(e.target.value))}
            className="type-size-range"
            aria-label="Font size"
          />
          <button
            type="button"
            className="type-size-step"
            onClick={() => set(appearance.editorFontSize + 1)}
            disabled={appearance.editorFontSize >= MAX}
            aria-label="Increase"
          >+</button>
          <span className="type-size-readout">{appearance.editorFontSize}px</span>
        </div>
      )}
    </div>
  );
}
