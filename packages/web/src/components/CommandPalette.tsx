import { useEffect, useRef, useState } from 'react';
import { useAppearance, ENABLED_VARIANTS, type Theme, type Variant } from '../theme/AppearanceProvider';

interface Combo {
  variant: Variant;
  theme: Theme;
  digit: string;
  label: string;
}

const ALL_COMBOS: Combo[] = [
  { variant: 'paper',    theme: 'light', digit: '1', label: 'Paper · Light' },
  { variant: 'paper',    theme: 'dark',  digit: '2', label: 'Paper · Dark' },
  { variant: 'terminal', theme: 'light', digit: '3', label: 'Terminal · Light' },
  { variant: 'terminal', theme: 'dark',  digit: '4', label: 'Terminal · Dark' },
  { variant: 'atelier',  theme: 'light', digit: '5', label: 'Atelier · Light' },
  { variant: 'atelier',  theme: 'dark',  digit: '6', label: 'Atelier · Dark' },
  { variant: 'index',    theme: 'light', digit: '7', label: 'Index Card · Light' },
  { variant: 'index',    theme: 'dark',  digit: '8', label: 'Index Card · Dark' },
];
const COMBOS: Combo[] = ALL_COMBOS.filter(c => ENABLED_VARIANTS.includes(c.variant));

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);
const modLabel = isMac ? '⌘' : 'Ctrl+';

export function CommandPalette() {
  const { appearance, setAppearance } = useAppearance();
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const setAppearanceRef = useRef(setAppearance);
  setAppearanceRef.current = setAppearance;

  // Global shortcuts: ⌘K toggle, ⌘1–8 direct switch.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey || e.shiftKey) return;

      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      if (e.key >= '1' && e.key <= '8') {
        const combo = COMBOS.find(c => c.digit === e.key);
        if (combo) {
          e.preventDefault();
          setAppearanceRef.current({ variant: combo.variant, theme: combo.theme });
          setOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Reset focus when opened; sync to current appearance.
  useEffect(() => {
    if (!open) return;
    const i = COMBOS.findIndex(c => c.variant === appearance.variant && c.theme === appearance.theme);
    setFocusIndex(i >= 0 ? i : 0);
  }, [open, appearance.variant, appearance.theme]);

  // Palette-only navigation (Esc / Arrow / Enter).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIndex(i => (i + 1) % COMBOS.length); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIndex(i => (i - 1 + COMBOS.length) % COMBOS.length); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const combo = COMBOS[focusIndex];
        setAppearanceRef.current({ variant: combo.variant, theme: combo.theme });
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, focusIndex]);

  if (!open) return null;

  return (
    <div className="command-palette-overlay" onClick={() => setOpen(false)}>
      <div className="command-palette" onClick={e => e.stopPropagation()} role="dialog" aria-label="Switch theme">
        <div className="command-palette-header">Switch theme…</div>
        <ul className="command-palette-list" role="listbox" aria-activedescendant={`combo-${focusIndex}`}>
          {COMBOS.map((combo, i) => {
            const isCurrent = appearance.variant === combo.variant && appearance.theme === combo.theme;
            const isFocus = focusIndex === i;
            return (
              <li
                id={`combo-${i}`}
                key={combo.digit}
                role="option"
                aria-selected={isFocus}
                className={`command-palette-item${isFocus ? ' focus' : ''}${isCurrent ? ' active' : ''}`}
                onClick={() => {
                  setAppearance({ variant: combo.variant, theme: combo.theme });
                  setOpen(false);
                }}
                onMouseEnter={() => setFocusIndex(i)}
              >
                <span className="command-palette-item-label">{combo.label}</span>
                <span className="command-palette-item-shortcut">{modLabel}{combo.digit}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
