/**
 * Ledger palette, mobile edition.
 *
 * These are the same values the desktop and web apps resolve from
 * styles/themes.css, mapped onto the key names mobile already uses. The dark
 * surfaces come from the same OKLCH ramp (ground L 0.195, C 0.005, H 250), so
 * the steps between them are perceptually even rather than evenly spaced in
 * hex; what is written here is the plain sRGB result.
 *
 * Two deliberate departures from the desktop token set:
 *  - `border` uses the desktop `--rule-2` rather than `--rule`. A hairline at
 *    `--rule` all but disappears on a phone at arm's length.
 *  - `textMuted` maps to `--ink-3`, not `--ink-4`. It carries placeholder and
 *    timestamp text here, which has to stay legible outdoors.
 */

export const darkTheme = {
  background: '#131517',
  surface: '#181A1C',
  surfaceVariant: '#1B1D1F',
  surfaceElevated: '#292B2D',
  surfaceHover: '#1F2123',
  surfaceActive: '#242629',
  text: '#F0F2F4',
  textSecondary: '#BEBFC1',
  textMuted: '#8C8E8F',
  border: '#242629',
  accent: '#76B6F7',
  accentHover: '#5C9EE1',
  danger: '#E5686B',
  success: '#5FBF88',
  warning: '#E0A458',
};

export const lightTheme = {
  background: '#F7F7F5',
  surface: '#EFEFEE',
  surfaceVariant: '#E9EAEC',
  surfaceElevated: '#FFFFFF',
  surfaceHover: '#E3E5E8',
  surfaceActive: '#D6D9DE',
  text: '#16181C',
  textSecondary: '#3F444C',
  textMuted: '#767C86',
  border: '#E2E3E6',
  accent: '#1E4D7B',
  accentHover: '#163C61',
  danger: '#C0393B',
  success: '#2E7D4F',
  warning: '#B26B00',
};

export type Theme = typeof darkTheme;

/**
 * Static alias for screens whose styles are built at module scope with
 * StyleSheet.create and therefore cannot read the theme context.
 *
 * NOTE: this is dark-mode only. Home, Notes, NoteEditor, QuickCapture and
 * CategoryManager all import it, which is why those screens stay dark whatever
 * the theme setting says. Moving them onto useTheme() means rebuilding their
 * stylesheets as a function of the theme; until then, this is the honest
 * description of what they render.
 */
export const colors = darkTheme;
