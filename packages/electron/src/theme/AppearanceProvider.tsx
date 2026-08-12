import * as React from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type Variant = 'ledger' | 'paper' | 'terminal' | 'atelier' | 'index';

export interface Appearance {
  theme: Theme;
  variant: Variant;
  editorFontSize: number;
}

// Single source of truth for the editor size bounds — FontSizeControl and the
// FOUC bootstrap in index.html both key off these.
export const MIN_FONT = 13;
export const MAX_FONT = 32;
export const DEFAULT_FONT = 22;

const DEFAULT: Appearance = { theme: 'dark', variant: 'ledger', editorFontSize: DEFAULT_FONT };
const STORAGE_KEY = 'flashpad.appearance';

// Bumped when the shipped default changes. Relying on validVariant() alone to
// retire a variant only works in production, where the old variant is disabled;
// in dev every variant stays enabled, so a stored 'paper' would validate and
// pin the old theme forever.
const APPEARANCE_VERSION = 2;

// Feature flag: gate the non-shipping variants behind VITE_MULTI_THEME.
// Default: enabled in dev, disabled in production. Override with VITE_MULTI_THEME=true|false.
// A stored variant that is not enabled fails validVariant() and falls back to
// DEFAULT, so anyone carrying 'paper' in localStorage lands on Ledger.
const MULTI_THEME_ENABLED: boolean = (() => {
  const v = import.meta.env.VITE_MULTI_THEME;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return Boolean(import.meta.env.DEV);
})();

export const ENABLED_VARIANTS: readonly Variant[] = MULTI_THEME_ENABLED
  ? ['ledger', 'paper', 'terminal', 'atelier', 'index']
  : ['ledger'];

function validVariant(v: unknown): v is Variant {
  return typeof v === 'string' && (ENABLED_VARIANTS as readonly string[]).includes(v);
}

interface ContextValue {
  appearance: Appearance;
  effectiveTheme: 'light' | 'dark';
  setAppearance: (patch: Partial<Appearance>) => void;
}

const AppearanceContext = React.createContext<ContextValue | null>(null);

function clampFont(n: unknown): number {
  const num = typeof n === 'number' && Number.isFinite(n) ? n : DEFAULT.editorFontSize;
  return Math.max(MIN_FONT, Math.min(MAX_FONT, Math.round(num)));
}

function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t === 'system' && typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t === 'light' ? 'light' : 'dark';
}

function loadInitial(): Appearance {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const stale = parsed.v !== APPEARANCE_VERSION;
      let variant = validVariant(parsed.variant) ? parsed.variant : DEFAULT.variant;
      let fontSize = clampFont(parsed.editorFontSize);
      // One-way move off the previous defaults. Choosing Paper or a smaller
      // size again afterwards sticks, because setAppearance() stamps the
      // current version on save. Anyone already reading larger keeps their size.
      if (stale && variant === 'paper') variant = DEFAULT.variant;
      if (stale) fontSize = Math.max(fontSize, DEFAULT_FONT);
      return {
        theme: parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : DEFAULT.theme,
        variant,
        editorFontSize: fontSize,
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setState] = React.useState<Appearance>(loadInitial);
  const effectiveTheme = resolveTheme(appearance.theme);

  React.useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = effectiveTheme;
    r.dataset.variant = appearance.variant;
    r.style.setProperty('--editor-size', appearance.editorFontSize + 'px');
  }, [appearance, effectiveTheme]);

  React.useEffect(() => {
    if (appearance.theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [appearance.theme]);

  const setAppearance = React.useCallback((patch: Partial<Appearance>) => {
    setState(prev => {
      const next: Appearance = { ...prev, ...patch };
      if (typeof patch.editorFontSize === 'number') {
        next.editorFontSize = clampFont(patch.editorFontSize);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, v: APPEARANCE_VERSION }));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  // One-time migration from electron-store settings on first mount.
  // Runs only if no localStorage entry exists yet.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    const w = window as unknown as { electron?: { settings?: { get?: () => Promise<{ theme?: string }> } } };
    const get = w.electron?.settings?.get;
    if (!get) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await get();
        if (cancelled) return;
        const t = settings?.theme;
        if (t === 'light' || t === 'dark' || t === 'system') {
          setAppearance({ theme: t });
        }
      } catch { /* ignore */ }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAppearance]);

  return (
    <AppearanceContext.Provider value={{ appearance, effectiveTheme, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const ctx = React.useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within AppearanceProvider');
  return ctx;
}
