# Cross-Platform UI Redesign — Web & Mobile Visual Parity

**Date:** 2026-03-13
**Scope:** Web app (packages/web) + Mobile app (packages/mobile)
**Approach:** Port Electron's warmer palette, Inter/JetBrains Mono typography, Lucide icons, and component refinements to web and mobile. No new features — visual consistency only.

## Motivation

The Electron app was redesigned with a Linear/Zenflow-inspired aesthetic (commit 5727e73). The web and mobile apps still use the original colder palette, system fonts, emoji icons, and filled button defaults. This spec brings visual parity across all platforms.

## Reference

All design decisions originate from: `docs/superpowers/specs/2026-03-13-electron-ui-redesign-design.md`

---

# Part 1: Web App (packages/web)

The web app shares React + CSS architecture with Electron, making this largely a 1:1 port.

## 1.1 Color Palette

Update `:root` in `packages/web/src/index.css`:

| Token | Current | New |
|-------|---------|-----|
| `--bg-primary` | `#121212` | `#141414` |
| `--bg-secondary` | `#1a1a1a` | `#191919` |
| `--bg-tertiary` | `#242424` | `#1c1c1c` |
| `--bg-hover` | `#2d2d2d` | `#1f1f1f` |
| `--bg-active` | `#333333` | `#252525` |
| `--text-primary` | `#e0e0e0` | `#d8d8d8` |
| `--text-secondary` | `#999999` | `#b0b0b0` |
| `--text-muted` | `#666666` | `#505050` |
| `--border-color` | `#333333` | `#232323` |

Add new variable: `--font-mono: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;`

No changes to light theme or accent/danger/success colors.

## 1.2 Typography

Web is online-only, so load fonts via Google Fonts CDN (no need to bundle like Electron):

Add to `packages/web/index.html` `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Update `body` font-family in `index.css`:
```css
/* Before */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;

/* After */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Where JetBrains Mono Applies

Same as Electron:
- Note list timestamps (`.notes-list-item-date`)
- Sidebar badge counts (`.sidebar-count`)
- Editor footer metadata
- Keyboard shortcut hint pills

## 1.3 Buttons

Replace global `button` selector with ghost defaults + `.btn-primary` class. Identical to Electron spec section 3.1:

```css
/* Ghost default */
button {
  background: transparent;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  color: #606060;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
  padding: 4px 10px;
}

button:hover {
  border-color: #444;
  color: var(--text-secondary);
  background: #1e1e1e;
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Primary CTA */
.btn-primary {
  width: 100%;
  padding: 12px;
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 500;
}

.btn-primary:hover {
  background-color: var(--accent-hover);
}

.btn-primary:disabled {
  background-color: var(--bg-active);
  color: var(--text-muted);
  opacity: 1;
}
```

Add `className="btn-primary"` to:
- `packages/web/src/pages/Login.tsx` submit button
- `packages/web/src/pages/Register.tsx` submit button

### Button Audit — Styles That Need `color: white` Added

The global button change removes `color: white` from the default. These classes set their own `background` but inherit `color` from the global rule, so they need `color: white` added explicitly:

- `.category-manager-submit` — currently relies on global for white text
- `.note-editor-save-btn` — has its own explicit styles, already sets color — no change needed

These button classes are fully self-contained (set their own `color`, `background`, `width`, `padding`) and need no changes:
- `.landing-nav-btn`, `.landing-nav-btn.primary` — explicit `color`
- `.landing-cta-btn`, `.landing-cta-btn.primary` — explicit `color`
- `.category-manager-cancel` — ghost style already
- `.notes-list-new-btn` — restyled in section 1.6
- `.note-editor-action-btn` — restyled in section 1.7

## 1.4 Icons

Add `lucide-react` dependency to `packages/web/package.json`.

### Sidebar Icons (`Sidebar.tsx`)

Replace emoji/unicode icons:
- `&#128229;` → `<Inbox size={15} strokeWidth={1.75} />`
- `&#128451;` → `<Archive size={15} strokeWidth={1.75} />`
- `&#128465;` → `<Trash2 size={15} strokeWidth={1.75} />`
- `&#9881;` → `<Settings size={15} strokeWidth={1.75} />`
- `&#128100;` → `<User size={15} strokeWidth={1.75} />`

### NoteEditor Icons (`NoteEditor.tsx`)

Replace emoji/unicode action button icons:
- Archive: `&#128451;` → `<Archive size={14} strokeWidth={1.75} />`
- Restore (to inbox): `&#128229;` → `<Inbox size={14} strokeWidth={1.75} />`
- Restore (from trash): `&#8634;` → `<RotateCcw size={14} strokeWidth={1.75} />`
- Trash/Delete: `&#128465;` → `<Trash2 size={14} strokeWidth={1.75} />`
- Focus mode enter: `\u2922` → `<Maximize2 size={14} strokeWidth={1.75} />`
- Focus mode exit: `\u2715` → `<X size={14} strokeWidth={1.75} />`
- Code block: `&lt;/&gt;` → `<Code size={14} strokeWidth={1.75} />`
- Empty state: `&#128221;` → `<FileText size={48} strokeWidth={1.5} />`

## 1.5 Sidebar CSS

Mirror Electron's sidebar changes:

```css
.sidebar-section-header {
  padding: 14px 14px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #454545;
  letter-spacing: 1px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: auto;
  padding: 6px 14px;
  margin: 1px 6px;
  border-radius: 6px;
  /* ... rest unchanged ... */
}

.sidebar-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  flex-shrink: 0;
}

.sidebar-item.active .sidebar-icon {
  opacity: 1;
}

.sidebar-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  background: none;
  padding: 0;
  border-radius: 0;
}

.sidebar-color-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sidebar-logo {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: lowercase;
  letter-spacing: 0.5px;
}
```

## 1.6 Notes List

Mirror Electron's notes list changes:

```css
.notes-list-new-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid #2a2a2a;
  color: var(--text-muted);
  font-size: 18px;
}

.notes-list-new-btn:hover {
  background: #1e1e1e;
  border-color: #444;
  color: var(--text-secondary);
}

.notes-list-item.active {
  background: var(--bg-active);
  border-left: 2px solid var(--accent-color);
  padding-left: 18px;
}

.notes-list-item-date {
  font-family: var(--font-mono);
  font-size: 11px;
}

.notes-list-item-category-dot {
  width: 5px;
  height: 5px;
}
```

## 1.7 Editor Toolbar & Footer

### Toolbar Layout

```
[Edit*] [Preview] | [Category] [Code] ... [● synced] | [Focus] [Archive] [Delete]
```

- **Edit/Preview tabs:** Ghost tab buttons. Edit always active. Preview disabled (`opacity: 0.4`, `cursor: not-allowed`), clicking does nothing.
- **Dividers:** 1px vertical lines (`#2a2a2a`, 16px tall) between button groups.
- **Sync indicator:** 5px dot + label in JetBrains Mono (see section 1.8).
- **Action buttons:** Ghost icon-only (28px, transparent bg, 1px border `#2a2a2a`).

### New CSS Classes

```css
.note-editor-tab {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  color: #606060;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}

.note-editor-tab.active {
  background: #1e1e1e;
  border-color: #444;
  color: var(--text-secondary);
}

.note-editor-tab.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.note-editor-toolbar-divider {
  width: 1px;
  height: 16px;
  background: #2a2a2a;
  margin: 0 4px;
  flex-shrink: 0;
}

.note-editor-sync-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #454545;
}

.note-editor-sync-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.note-editor-sync-dot.connected { background: var(--success-color); }
.note-editor-sync-dot.connecting,
.note-editor-sync-dot.reconnecting { background: #f59e0b; animation: pulse 1.5s ease-in-out infinite; }
.note-editor-sync-dot.disconnected { background: var(--danger-color); }

.note-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  border-top: 1px solid var(--border-color);
  font-family: var(--font-mono);
  font-size: 11px;
  color: #404040;
}

.note-editor-footer-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.note-editor-footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.note-editor-kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  background: #1e1e1e;
  border: 1px solid #2a2a2a;
  padding: 1px 5px;
  border-radius: 4px;
  color: #555;
}
```

### Updated Action Button CSS

```css
.note-editor-action-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.note-editor-action-btn:hover {
  background: #1e1e1e;
  border-color: #444;
  color: var(--text-secondary);
}
```

### Footer Bar

Added below textarea:
```
v{version} · {chars} chars · {lines} lines    [Ctrl+S] save  [Ctrl+Shift+F] focus
```

## 1.8 Connection Status Migration

- **Remove** the floating `<ConnectionStatus>` component from `Home.tsx`
- **Add** inline sync indicator in editor toolbar (green dot + "connected" / orange "reconnecting" / red "offline")
- **Add** sync status fallback in sidebar footer (same dot + label pattern)
- **Delete** old `.connection-status*` CSS rules (preserve `@keyframes pulse`)

Web sync indicator is simpler than Electron — only shows connection state (`connected`, `connecting`, `reconnecting`, `disconnected`). No pending count since web has no offline queue.

### Sidebar Sync Status CSS

```css
.sidebar-sync-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 20px 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #454545;
}

.sidebar-sync-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sidebar-sync-dot.connected { background: var(--success-color); }
.sidebar-sync-dot.connecting,
.sidebar-sync-dot.reconnecting { background: #f59e0b; animation: pulse 1.5s ease-in-out infinite; }
.sidebar-sync-dot.disconnected { background: var(--danger-color); }
```

### New Props

**Sidebar.tsx** — add `connectionState?: string` prop. Render sync dot + label in sidebar footer.

**NoteEditor.tsx** — add `connectionState?: string` prop. Render sync indicator in toolbar.

**Home.tsx** — pass `connectionState` to both Sidebar and NoteEditor.

## 1.9 Web Files Changed

| File | Change |
|------|--------|
| `packages/web/package.json` | Add `lucide-react` |
| `packages/web/index.html` | Add Google Fonts link tags |
| `packages/web/src/index.css` | Palette, typography, buttons, sidebar, notes list, editor, footer |
| `packages/web/src/components/Sidebar.tsx` | Lucide icons, spacing, sync status footer |
| `packages/web/src/components/NotesList.tsx` | Active left-border, monospace dates |
| `packages/web/src/components/NoteEditor.tsx` | Toolbar tabs, sync indicator, footer bar, ghost buttons |
| `packages/web/src/pages/Home.tsx` | Remove ConnectionStatus, pass sync props to Sidebar/NoteEditor |
| `packages/web/src/pages/Login.tsx` | Add `className="btn-primary"` to submit |
| `packages/web/src/pages/Register.tsx` | Add `className="btn-primary"` to submit |
| `packages/web/src/components/ConnectionStatus.tsx` | Delete or keep as dead code |

---

# Part 2: Mobile App (packages/mobile)

React Native uses StyleSheet, not CSS. The visual changes are adapted to native patterns while maintaining the same aesthetic.

## 2.1 Color Palette

Update `packages/mobile/src/theme/colors.ts` dark theme:

| Key | Current | New |
|-----|---------|-----|
| `background` | `#121212` | `#141414` |
| `surface` | `#1a1a1a` | `#191919` |
| `surfaceVariant` | `#242424` | `#1c1c1c` |
| `surfaceHover` | `#2d2d2d` | `#1f1f1f` |
| `surfaceActive` | `#333333` | `#252525` |
| `text` | `#e0e0e0` | `#d8d8d8` |
| `textSecondary` | `#999999` | `#b0b0b0` |
| `textMuted` | `#666666` | `#505050` |
| `border` | `#333333` | `#232323` |

No changes to `surfaceElevated`, light theme, or accent/danger/success colors.

## 2.2 Typography

Bundle Inter and JetBrains Mono fonts for offline support.

### Font Files

Place `.ttf` files in `packages/mobile/src/assets/fonts/`:
- `Inter-Regular.ttf` (weight 400)
- `Inter-Medium.ttf` (weight 500)
- `Inter-SemiBold.ttf` (weight 600)
- `JetBrainsMono-Regular.ttf` (weight 400)
- `JetBrainsMono-Medium.ttf` (weight 500)

### React Native Font Linking

Add to `packages/mobile/react-native.config.js`:
```js
module.exports = {
  assets: ['./src/assets/fonts/'],
};
```

Run `npx react-native-asset` to link fonts into iOS/Android native projects.

### Theme Constants

Add font family constants to a new `packages/mobile/src/theme/fonts.ts`:
```typescript
export const fonts = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semiBold: 'Inter-SemiBold',
  mono: 'JetBrainsMono-Regular',
  monoMedium: 'JetBrainsMono-Medium',
};
```

Note: React Native uses the font file name (minus extension) on Android and the PostScript name on iOS. For Inter and JetBrains Mono, these match the file names above.

### Where JetBrains Mono Applies

- Note list item timestamps
- Sync status text
- Editor footer metadata (version, chars, lines)
- Category badge counts

### Where Inter Applies

- All body text, headers, labels, buttons (replace system default)

## 2.3 Icons

Add dependencies:
- `lucide-react-native`
- `react-native-svg` (peer dependency for lucide-react-native)

### Icon Replacements

**HomeScreen:**
- Filter tabs: `📥` → `<Inbox />`, `📦` → `<Archive />`, `🗑` → `<Trash2 />`
- Profile icon (custom circles) → `<User />`
- FAB `+` text → `<Plus />`
- Search clear `×` → `<X />`

**NoteEditorScreen:**
- Archive button text → `<Archive />`
- Restore button text → `<RotateCcw />`
- Trash button text → `<Trash2 />`
- Delete button text → `<Trash2 />` (with danger color)
- Category picker arrow → `<ChevronDown />`

**CategoryManagerScreen:**
- Add category → `<Plus />`
- Edit → `<Pencil />`
- Delete → `<Trash2 />`

**AccountScreen:**
- Settings gear → `<Settings />`
- Logout → `<LogOut />`

**Icon sizing:** 20px for navigation/action buttons, 16px for inline indicators, strokeWidth 1.75.

## 2.4 HomeScreen List Items

Update note list item styling in `HomeScreen.tsx`:

**Category dots:** Reduce from 8px (note list `categoryDot`) and 10px (header `headerCategoryDot`) to 5px diameter.

**Timestamps:** Apply JetBrains Mono font, reduce to 11px.

**Selected note indicator:** Add 2px left border in accent color (#6366f1) on the selected/active note item. Keep existing active background.

**Sync dots:** Reduce from 8px to 5px to match desktop. Keep existing color semantics.

**Section headers:** Apply 11px uppercase, 1px letter-spacing, `#454545` color (matching desktop `.sidebar-section-header`). Applies to filter tab labels and "Categories" header if present.

## 2.5 FAB (Floating Action Button)

Change from filled to ghost style:

```typescript
/* Before */
fab: {
  backgroundColor: colors.accent,
  // solid circle with shadow
}

/* After */
fab: {
  backgroundColor: 'transparent',
  borderWidth: 1,
  borderColor: '#2a2a2a',
  // no shadow
}
fabText: {
  color: colors.textMuted,
}
```

On press, the FAB still creates a new note (behavior unchanged).

Replace `+` text with Lucide `<Plus size={24} />`.

## 2.6 NoteEditorScreen

### Footer Bar (new)

Add below the textarea, above any existing bottom UI:

```
v{version} · {chars} chars · {lines} lines
```

- JetBrains Mono font, 11px, `#404040` color
- `borderTopWidth: 1, borderTopColor: colors.border`
- `paddingVertical: 6, paddingHorizontal: 14`

No keyboard shortcuts section (mobile doesn't have keyboard shortcuts).

### Action Buttons

Replace text-based toolbar buttons ("Archive", "Trash", etc.) with Lucide icon buttons in ghost style:
- Transparent background, 1px border `#2a2a2a`, border-radius 6
- Icon color: `colors.textMuted`
- Press: border `#444`, icon `colors.textSecondary`

### Sync Indicator

The editor header area already has sync status. Update to match desktop:
- 5px colored dot + label in JetBrains Mono at 11px
- Same color semantics: green=synced, orange=pending, blue=syncing, red=offline

## 2.7 Login & Register Screens

Replace all hardcoded colors with theme-aware values:

| Current | New |
|---------|-----|
| `backgroundColor: '#f5f5f5'` | `colors.background` |
| `backgroundColor: '#fff'` | `colors.surface` |
| `color: '#333'` | `colors.text` |
| `borderColor: '#ddd'` | `colors.border` |
| `backgroundColor: '#007bff'` | `colors.accent` |
| `backgroundColor: '#ccc'` | `colors.surfaceActive` |
| `color: '#dc3545'` | `colors.danger` |
| `color: '#666'` | `colors.textSecondary` |
| `color: '#007bff'` | `colors.accent` |

Import and use the theme context (`useTheme()` hook) to get current colors, so Login/Register respect dark/light mode.

## 2.8 Toast

Update hardcoded colors in `Toast.tsx`:

| Current | New |
|---------|-----|
| `backgroundColor: '#1a1a1a'` | `colors.surface` |
| `color: '#e0e0e0'` | `colors.text` |

The border-left color indicators (`#22c55e`, `#ef4444`, `#f59e0b`, `#6366f1`) are semantic status colors — keep as-is since they match the accent/danger/success values.

## 2.9 Mobile Files Changed

| File | Change |
|------|--------|
| `packages/mobile/package.json` | Add `lucide-react-native`, `react-native-svg` |
| `packages/mobile/react-native.config.js` | Create new file with font assets path |
| `packages/mobile/src/assets/fonts/` | Add Inter + JetBrains Mono .ttf files |
| `packages/mobile/src/theme/colors.ts` | Update dark palette values |
| `packages/mobile/src/theme/fonts.ts` | New file with font family constants |
| `packages/mobile/src/screens/NotesScreen.tsx` | Update colors import to use theme, font updates |
| `packages/mobile/src/screens/HomeScreen.tsx` | Lucide icons, ghost FAB, list item styling, font updates |
| `packages/mobile/src/screens/NoteEditorScreen.tsx` | Footer bar, ghost action buttons, Lucide icons, sync indicator |
| `packages/mobile/src/screens/LoginScreen.tsx` | Theme-aware colors |
| `packages/mobile/src/screens/RegisterScreen.tsx` | Theme-aware colors |
| `packages/mobile/src/screens/AccountScreen.tsx` | Lucide icons |
| `packages/mobile/src/screens/CategoryManagerScreen.tsx` | Lucide icons |
| `packages/mobile/src/screens/QuickCaptureScreen.tsx` | Font updates if applicable |
| `packages/mobile/src/components/Toast.tsx` | Theme-aware background/text colors |
| iOS `Info.plist` | `UIAppFonts` entries added by react-native-asset |
| Android `app/src/main/assets/fonts/` | Font files copied by react-native-asset |
| iOS `Podfile` / `pod install` | Required for `react-native-svg` native module |

---

# Not In Scope

- Light theme updates (dark only)
- New features on any platform
- Actual markdown preview functionality
- Structural navigation changes on mobile
- Backend or shared package changes
- Quick capture window styling (electron)
