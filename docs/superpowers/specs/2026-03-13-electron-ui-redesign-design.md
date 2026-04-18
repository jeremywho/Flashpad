# Electron UI Redesign — Linear/Zenflow-Inspired Visual Refresh

**Date:** 2026-03-13
**Scope:** Electron app only (packages/electron)
**Approach:** CSS refresh + component tweaks — no new features

## Motivation

Refine the Electron app's dark theme to feel more like Linear, VS Code, and Zenflow — calmer, more cohesive, developer-focused. The current UI is solid but can benefit from warmer colors, subtler borders, better typography, and more polished component patterns. This is a visual-only change: same layout, same functionality, same data flow.

## Design Principles

- Dense dark productivity aesthetic — Linear meets VS Code
- Flat surfaces with 1px low-contrast borders, no shadows or gradients
- Typography as the primary UI element
- Accent color used sparingly — only for active/selected states
- Monospace for technical content (timestamps, counts, shortcuts)
- Ghost-style buttons except for primary CTAs
- Restrained color: mostly monochrome, color only for status/state

## 1. Color Palette

### Dark Theme (default)

| Token | Current | New | Notes |
|-------|---------|-----|-------|
| `--bg-primary` | `#121212` | `#141414` | Slightly warmer base |
| `--bg-secondary` | `#1a1a1a` | `#191919` | Panel backgrounds |
| `--bg-tertiary` | `#242424` | `#1c1c1c` | Inputs, hover targets |
| `--bg-hover` | `#2d2d2d` | `#1f1f1f` | Interactive hover |
| `--bg-active` | `#333333` | `#252525` | Active/selected state |
| `--border-color` | `#333333` | `#232323` | 1px panel borders |
| `--text-primary` | `#e0e0e0` | `#d8d8d8` | Warmer main text |
| `--text-secondary` | `#999999` | `#b0b0b0` | Secondary labels |
| `--text-muted` | `#666666` | `#505050` | Muted/disabled |
| `--accent-color` | `#6366f1` | `#6366f1` | No change (indigo) |
| `--accent-hover` | `#5558e3` | `#5558e3` | No change — used by primary CTA hover |
| `--danger-color` | `#ef4444` | `#ef4444` | No change |
| `--success-color` | `#22c55e` | `#22c55e` | No change |

### Light Theme

No changes. Stays as-is.

## 2. Typography

### Font Families

- **UI text:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Technical/metadata:** `'JetBrains Mono', 'Consolas', 'Monaco', monospace`
- **Editor content:** Same as UI text (Inter)

### Loading

Bundle fonts locally for offline-first compatibility (do not use Google Fonts CDN):
1. Download Inter (weights 400, 500, 600) and JetBrains Mono (weights 400, 500) as woff2 files
2. Place in `packages/electron/src/assets/fonts/`
3. Add `@font-face` declarations in `index.css`

### Font Sizes

**No changes to existing sizes.** Keeping 13-14px for UI elements, 17px for editor content.

### Where JetBrains Mono Applies

- Note list timestamps (`14:34`, `Yesterday`, `Mar 10`)
- Sidebar category/inbox badge counts (`12`, `5`, `3`)
- Editor footer metadata (`v3 · 847 chars · 4 lines`)
- Toolbar sync status text (`synced`)
- Keyboard shortcut hint pills (`Ctrl+S`, `Ctrl+Shift+F` — render platform-appropriate modifier keys)

## 3. Component Changes

### 3.1 Buttons

- **Global `button` reset:** Remove the existing global `button` selector in `index.css` that sets `width: 100%`, `background: var(--accent-color)`, `color: white`, `border: none`. Move those styles to a `.btn-primary` class instead. This prevents every new button from defaulting to full-width indigo filled.
- **Primary CTA (`.btn-primary`):** Indigo filled (`--accent-color` background, white text, hover uses `--accent-hover`)
- **All other buttons:** Ghost style — `transparent` background, `1px solid #2a2a2a` border, `#606060` text, `border-radius: 6px`
- **Ghost hover:** border `#444`, text `#b0b0b0`, background `#1e1e1e`
- **New note `+` button:** Changes from filled indigo to ghost style

### 3.2 Sidebar Icons

- **Add dependency:** `lucide-react`
- **Replace** emoji/unicode icons with Lucide components:
  - Inbox → `<Inbox />` (Lucide)
  - Archive → `<Archive />` (Lucide)
  - Trash → `<Trash2 />` (Lucide)
  - Settings → `<Settings />` (Lucide)
  - Account → `<User />` (Lucide)
- **Icon sizing:** 15px, stroke-width 1.75
- **Active state:** full opacity; inactive: 0.5 opacity

### 3.3 Sidebar Spacing

- Nav items get `border-radius: 6px`, `margin: 1px 6px`
- Padding: `6px 14px` per nav item
- Section labels: `font-size: 11px`, `font-weight: 600`, `color: #454545`, uppercase, `letter-spacing: 1px`
- Category dots: 6px diameter (down from 10px)

### 3.4 Active Note Indicator

- Selected note in the list gets a `2px solid #6366f1` left border as the primary active signal
- Background still subtly highlighted (`#232323`)
- Replaces the current full-row `#333` background as the main visual cue

### 3.5 Status Dots

- Small 5px colored circles inline with note titles for pending sync (orange `#f59e0b`)
- Green 5px dot in editor toolbar for "synced" status (unified 5px size for all status dots)
- Only visible when relevant (pending = orange dot next to title; synced = green in toolbar)
- **Data plumbing for per-note sync status:** Pass a `pendingNoteIds: Set<string>` prop to `NotesList`, sourced from `SyncManager`'s pending changes queue in `Home.tsx`. The SyncManager already tracks pending changes — expose the note IDs from that queue.

### 3.6 Editor Toolbar

**Current layout:**
```
[Category selector] [Code block] ... [Focus] [Archive] [Delete]
```

**New layout:**
```
[Edit*] [Preview] | [Category] [Code] ... [● synced] | [Focus] [Archive] [Delete]
```

- **Edit/Preview tabs:** Ghost buttons, left side. Edit tab is always in active state (`background: #1e1e1e`, `border-color: #444`, `color: #b0b0b0`). Preview tab is visually present but disabled (`opacity: 0.4`, `cursor: not-allowed`). Clicking Preview does nothing.
- **Dividers:** 1px vertical lines (`#2a2a2a`, 16px tall) between button groups.
- **Sync indicator:** Small green dot + `synced` text in JetBrains Mono, positioned in toolbar right area before action buttons.
- **Action buttons:** Ghost icon-only buttons (focus, archive, delete).

### 3.7 Editor Footer Bar (new)

- New element below the editor textarea, above any existing bottom UI
- `border-top: 1px solid #232323`
- `padding: 6px 14px`
- **Left side:** Note version, character count, line count — JetBrains Mono, `#404040`
  - Format: `v{version} · {chars} chars · {lines} lines`
- **Right side:** Keyboard shortcut hints — JetBrains Mono in `kbd`-styled pills
  - `background: #1e1e1e`, `border: 1px solid #2a2a2a`, `border-radius: 4px`, `padding: 1px 5px`, `color: #555`
  - Show: `Ctrl+S save`, `Ctrl+Shift+F focus`

### 3.8 ConnectionStatus Component

- The floating bottom-right `ConnectionStatus` badge is **removed** from the main view
- Sync status is now shown inline in the editor toolbar (see 3.6)
- If no note is selected (empty editor state), sync status is shown in the sidebar footer: a 5px green/orange dot + status text in JetBrains Mono at 11px, placed to the right of the "Account" nav item. Same color semantics as the toolbar indicator (green = synced, orange = pending).

## 4. Files Changed

| File | Change |
|------|--------|
| `packages/electron/package.json` | Add `lucide-react` dependency |
| `packages/electron/index.html` | No changes needed (fonts loaded via CSS `@font-face`) |
| `packages/electron/src/assets/fonts/` | Add bundled Inter and JetBrains Mono woff2 files |
| `packages/electron/src/index.css` | Palette variables, typography, button styles, spacing, editor footer, toolbar styles |
| `packages/electron/src/components/Sidebar.tsx` | Swap icons to Lucide, adjust spacing/classes |
| `packages/electron/src/components/NotesList.tsx` | Active left-border style, status dot for pending sync. Add `pendingNoteIds: Set<string>` prop. |
| `packages/electron/src/components/NoteEditor.tsx` | Add footer bar, Edit/Preview tabs (placeholder), ghost buttons, sync indicator in toolbar. Add `syncStatus`/`connectionState` props to `NoteEditorProps`; pass from `Home.tsx`. |
| `packages/electron/src/pages/Home.tsx` | Thread `pendingNoteIds` to NotesList, `syncStatus`/`connectionState` to NoteEditor |
| `packages/electron/src/components/ConnectionStatus.tsx` | Simplify — may remove or repurpose for sidebar fallback |

## 5. Not In Scope

- Light theme updates
- Web app (packages/web) — electron only
- Quick capture window styling
- Backend or shared package changes
- Actual markdown preview functionality (Edit/Preview tab is placeholder only)
- Mobile app
- New features of any kind
