import { useAppearance, ENABLED_VARIANTS, type Theme, type Variant } from '../theme/AppearanceProvider';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

const ALL_VARIANTS: { id: Variant; label: string; blurb: string }[] = [
  { id: 'paper', label: 'Paper', blurb: 'Warm, editorial, serif body.' },
  { id: 'terminal', label: 'Terminal', blurb: 'Mono, dense, phosphor.' },
  { id: 'atelier', label: 'Atelier', blurb: 'Architectural, hairline.' },
  { id: 'index', label: 'Index Card', blurb: 'Playful, soft cards.' },
];
const VARIANTS = ALL_VARIANTS.filter(v => ENABLED_VARIANTS.includes(v.id));
const SHOW_VARIANTS = VARIANTS.length > 1;

export function AppearancePane() {
  const { appearance, effectiveTheme, setAppearance } = useAppearance();
  const setFont = (n: number) => setAppearance({ editorFontSize: n });

  return (
    <div className="appearance-pane">
      <section className="appearance-section">
        <span className="appearance-label">Theme</span>
        <div className="appearance-segment" role="radiogroup" aria-label="Theme">
          {THEMES.map(t => (
            <button
              type="button"
              key={t.id}
              role="radio"
              aria-checked={appearance.theme === t.id}
              className={`appearance-segment-btn${appearance.theme === t.id ? ' active' : ''}`}
              onClick={() => setAppearance({ theme: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {SHOW_VARIANTS && (
      <section className="appearance-section">
        <span className="appearance-label">Style</span>
        <div className="appearance-tiles" role="radiogroup" aria-label="Style">
          {VARIANTS.map(v => (
            <button
              type="button"
              key={v.id}
              role="radio"
              aria-checked={appearance.variant === v.id}
              className={`appearance-tile${appearance.variant === v.id ? ' active' : ''}`}
              onClick={() => setAppearance({ variant: v.id })}
              data-variant={v.id}
              data-theme={effectiveTheme}
            >
              <span className="appearance-tile-heading">{v.label}</span>
              <span className="appearance-tile-body">{v.blurb}</span>
              <span className="appearance-tile-accent" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
      )}

      <section className="appearance-section">
        <label className="appearance-label" htmlFor="appearance-font-size">Editor font size</label>
        <div className="appearance-slider-row">
          <button
            type="button"
            className="appearance-slider-btn"
            onClick={() => setFont(appearance.editorFontSize - 1)}
            aria-label="Decrease font size"
            disabled={appearance.editorFontSize <= 13}
          >−</button>
          <input
            id="appearance-font-size"
            type="range"
            min={13}
            max={22}
            step={1}
            value={appearance.editorFontSize}
            onChange={e => setFont(Number(e.target.value))}
            className="appearance-slider"
          />
          <button
            type="button"
            className="appearance-slider-btn"
            onClick={() => setFont(appearance.editorFontSize + 1)}
            aria-label="Increase font size"
            disabled={appearance.editorFontSize >= 22}
          >+</button>
          <span className="appearance-slider-value">{appearance.editorFontSize}px</span>
        </div>
        <p className="appearance-sample" style={{ fontSize: appearance.editorFontSize + 'px' }}>
          The quick brown fox jumps over the lazy dog. Editor body text renders at this size.
        </p>
      </section>
    </div>
  );
}
