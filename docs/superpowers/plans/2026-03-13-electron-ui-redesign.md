# Electron UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the Electron app's visual design to a Linear/Zenflow/VS Code-inspired aesthetic — warmer palette, Inter + JetBrains Mono fonts, ghost buttons, Lucide icons, editor footer bar, and inline sync status.

**Architecture:** CSS-first visual refresh with targeted component changes. No new features — Edit/Preview tab is a disabled placeholder. Sync status moves from floating badge to inline toolbar indicator, requiring new props threaded through Home.tsx.

**Tech Stack:** React, CSS variables, lucide-react, Inter font, JetBrains Mono font (bundled locally as woff2)

**Spec:** `docs/superpowers/specs/2026-03-13-electron-ui-redesign-design.md`

---

## Chunk 1: Dependencies & Fonts

### Task 1: Install lucide-react

**Files:**
- Modify: `packages/electron/package.json`

- [ ] **Step 1: Install lucide-react**

Run from the electron package directory:

```bash
cd packages/electron && npm install lucide-react
```

- [ ] **Step 2: Verify installation**

Run: `cd packages/electron && node -e "require('lucide-react')"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/electron/package.json packages/electron/package-lock.json
git commit -m "chore: add lucide-react dependency for sidebar icons"
```

### Task 2: Bundle Inter and JetBrains Mono fonts

**Files:**
- Create: `packages/electron/src/assets/fonts/Inter-Regular.woff2`
- Create: `packages/electron/src/assets/fonts/Inter-Medium.woff2`
- Create: `packages/electron/src/assets/fonts/Inter-SemiBold.woff2`
- Create: `packages/electron/src/assets/fonts/JetBrainsMono-Regular.woff2`
- Create: `packages/electron/src/assets/fonts/JetBrainsMono-Medium.woff2`
- Modify: `packages/electron/src/index.css` (add `@font-face` declarations at top)

- [ ] **Step 1: Download font files**

Download Inter woff2 files (Regular 400, Medium 500, SemiBold 600) from Google Fonts or the Inter GitHub repo. Download JetBrains Mono woff2 files (Regular 400, Medium 500) from the JetBrains Mono GitHub repo.

Place all 5 files in `packages/electron/src/assets/fonts/`.

- [ ] **Step 2: Add @font-face declarations to index.css**

Add these at the very top of `packages/electron/src/index.css`, before the `:root` block:

```css
/* Bundled fonts for offline-first support */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./assets/fonts/Inter-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('./assets/fonts/Inter-Medium.woff2') format('woff2');
}

@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('./assets/fonts/Inter-SemiBold.woff2') format('woff2');
}

@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./assets/fonts/JetBrainsMono-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('./assets/fonts/JetBrainsMono-Medium.woff2') format('woff2');
}
```

- [ ] **Step 3: Update body font-family**

In `packages/electron/src/index.css`, change the `body` rule (around line 40 after the @font-face additions):

```css
/* Before */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;

/* After */
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

- [ ] **Step 4: Add CSS custom property for monospace font**

Add to the `:root` block in `packages/electron/src/index.css`:

```css
--font-mono: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
```

- [ ] **Step 5: Verify the dev server starts without errors**

Run: `cd packages/electron && npm run dev`
Expected: Vite starts, no build errors about missing fonts

- [ ] **Step 6: Commit**

```bash
git add packages/electron/src/assets/fonts/ packages/electron/src/index.css
git commit -m "chore: bundle Inter and JetBrains Mono fonts for offline use"
```

---

## Chunk 2: CSS Palette & Global Button Reset

### Task 3: Update dark theme CSS variables

**Files:**
- Modify: `packages/electron/src/index.css`

- [ ] **Step 1: Update :root CSS variables**

In `packages/electron/src/index.css`, update the `:root` block. Change these values:

```css
:root {
  --bg-primary: #141414;       /* was #121212 */
  --bg-secondary: #191919;     /* was #1a1a1a */
  --bg-tertiary: #1c1c1c;     /* was #242424 */
  --bg-hover: #1f1f1f;        /* was #2d2d2d */
  --bg-active: #252525;       /* was #333333 */
  --text-primary: #d8d8d8;    /* was #e0e0e0 */
  --text-secondary: #b0b0b0;  /* was #999999 */
  --text-muted: #505050;      /* was #666666 */
  --border-color: #232323;    /* was #333333 */
  --accent-color: #6366f1;    /* unchanged */
  --accent-hover: #5558e3;    /* unchanged */
  --danger-color: #ef4444;    /* unchanged */
  --success-color: #22c55e;   /* unchanged */
  --font-mono: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
}
```

Do NOT change the `[data-theme="light"]` block.

- [ ] **Step 2: Verify the app renders with new colors**

Run: `cd packages/electron && npm run dev`
Expected: App loads with slightly warmer dark palette, subtler borders

- [ ] **Step 3: Commit**

```bash
git add packages/electron/src/index.css
git commit -m "style: update dark theme palette to warmer near-black tones"
```

### Task 4: Reset global button styles

**Files:**
- Modify: `packages/electron/src/index.css`
- Modify: `packages/electron/src/pages/Login.tsx` (add `btn-primary` class to submit button)
- Modify: `packages/electron/src/pages/Register.tsx` (add `btn-primary` class to submit button)

- [ ] **Step 1: Replace global button selector with neutral defaults + .btn-primary class**

In `packages/electron/src/index.css`, find the global `button` rules (lines ~94-114) and replace:

```css
/* Before */
button {
  width: 100%;
  padding: 12px;
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  font-weight: 500;
}

button:hover {
  background-color: var(--accent-hover);
}

button:disabled {
  background-color: var(--bg-active);
  color: var(--text-muted);
  cursor: not-allowed;
}

/* After */
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

- [ ] **Step 2: Add btn-primary class to Login page submit button**

In `packages/electron/src/pages/Login.tsx`, find the submit `<button>` and add `className="btn-primary"`. It currently has no className.

- [ ] **Step 3: Add btn-primary class to Register page submit button**

In `packages/electron/src/pages/Register.tsx`, find the submit `<button>` and add `className="btn-primary"`. It currently has no className.

- [ ] **Step 4: Add btn-primary class to all buttons that need filled style**

These buttons currently rely on the global `button` rule for their filled indigo appearance. Add `className="btn-primary"` to each:

- `packages/electron/src/pages/Account.tsx` line 113: `<button type="submit" disabled={loading}>` → add `className="btn-primary"`
- `packages/electron/src/pages/Settings.tsx` line 298: `<button type="submit" disabled={loading}>` → add `className="btn-primary"`

These buttons use inline `style={{ width: 'auto', padding: '8px 16px' }}` and will look fine as ghost buttons (they are nav-bar action buttons, not primary CTAs):
- `packages/electron/src/pages/Account.tsx` line 62: Logout button — keep as ghost, no change needed
- `packages/electron/src/pages/Settings.tsx` line 149: Logout button — keep as ghost, no change needed
- `packages/electron/src/pages/Settings.tsx` line 197: Browse button — keep as ghost, no change needed
- `packages/electron/src/pages/Settings.tsx` line 329: Check for Updates button — keep as ghost, no change needed

These already have their own CSS classes and are unaffected:
- `.category-manager-submit` — has explicit styles
- `.notes-list-empty-btn` — has explicit styles
- `.settings-theme-btn` — has explicit styles
- `.settings-reset-btn` — has explicit styles

- [ ] **Step 5: Verify login/register pages still look correct**

Run: `cd packages/electron && npm run dev`
Navigate to login and register pages. Buttons should still be indigo and full-width.

- [ ] **Step 6: Commit**

```bash
git add packages/electron/src/index.css packages/electron/src/pages/Login.tsx packages/electron/src/pages/Register.tsx
git commit -m "style: reset global button to ghost style, add .btn-primary class"
```

---

## Chunk 3: Sidebar Redesign

### Task 5: Update sidebar CSS

**Files:**
- Modify: `packages/electron/src/index.css`

- [ ] **Step 1: Update sidebar CSS rules**

In `packages/electron/src/index.css`, update these existing rules:

```css
/* .sidebar-section-header — update color and letter-spacing */
.sidebar-section-header {
  padding: 14px 14px 4px;       /* was 8px 20px */
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #454545;               /* was var(--text-muted) */
  letter-spacing: 1px;          /* was 0.5px */
}

/* .sidebar-item — add border-radius and adjust spacing */
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;                     /* was 10px */
  width: auto;                  /* was 100% */
  padding: 6px 14px;            /* was 10px 20px */
  margin: 1px 6px;              /* new — adds indent + rounded hit area */
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;              /* was 14px — note: keeping 13px for sidebar nav items specifically */
  cursor: pointer;
  text-align: left;
  border-radius: 6px;           /* new */
  transition: background-color 0.15s, color 0.15s;
}

/* .sidebar-icon — update for Lucide icon sizing */
.sidebar-icon {
  width: 16px;                  /* was 20px */
  height: 16px;                 /* new */
  display: flex;                /* new — for Lucide SVG alignment */
  align-items: center;          /* new */
  justify-content: center;      /* new */
  opacity: 0.5;                 /* new — inactive state */
  flex-shrink: 0;               /* new */
}

/* Active sidebar item shows full opacity icons */
.sidebar-item.active .sidebar-icon {
  opacity: 1;
}

/* .sidebar-count — use monospace font */
.sidebar-count {
  font-family: var(--font-mono);  /* new */
  font-size: 11px;                /* was 12px */
  color: var(--text-muted);
  background: none;               /* was var(--bg-tertiary) */
  padding: 0;                     /* was 2px 8px */
  border-radius: 0;               /* was 10px */
}

/* .sidebar-color-dot — smaller */
.sidebar-color-dot {
  width: 6px;    /* was 10px */
  height: 6px;   /* was 10px */
  border-radius: 50%;
  flex-shrink: 0;
}

/* .sidebar-logo — lowercase, muted */
.sidebar-logo {
  font-size: 15px;                /* was 20px */
  font-weight: 600;               /* was 700 */
  color: var(--text-secondary);    /* was var(--accent-color) */
  margin: 0;
  text-transform: lowercase;      /* new */
  letter-spacing: 0.5px;          /* new */
}
```

- [ ] **Step 2: Verify sidebar looks correct**

Run: `cd packages/electron && npm run dev`
Expected: Sidebar has tighter spacing, muted section labels, lowercase logo, smaller category dots

- [ ] **Step 3: Commit**

```bash
git add packages/electron/src/index.css
git commit -m "style: update sidebar CSS for compact spacing, lowercase logo, monospace counts"
```

### Task 6: Swap sidebar icons to Lucide

**Files:**
- Modify: `packages/electron/src/components/Sidebar.tsx`

- [ ] **Step 1: Add Lucide imports and replace emoji icons**

In `packages/electron/src/components/Sidebar.tsx`:

Add import at top:
```tsx
import { Inbox, Archive, Trash2, Settings, User } from 'lucide-react';
```

Replace the emoji `<span>` icons in the JSX:

For Inbox button (line ~84):
```tsx
{/* Before */}
<span className="sidebar-icon">&#128229;</span>

{/* After */}
<span className="sidebar-icon"><Inbox size={15} strokeWidth={1.75} /></span>
```

For Archive button (line ~93):
```tsx
{/* Before */}
<span className="sidebar-icon">&#128451;</span>

{/* After */}
<span className="sidebar-icon"><Archive size={15} strokeWidth={1.75} /></span>
```

For Trash button (line ~102):
```tsx
{/* Before */}
<span className="sidebar-icon">&#128465;</span>

{/* After */}
<span className="sidebar-icon"><Trash2 size={15} strokeWidth={1.75} /></span>
```

For Settings button (line ~136):
```tsx
{/* Before */}
<span className="sidebar-icon">&#9881;</span>

{/* After */}
<span className="sidebar-icon"><Settings size={15} strokeWidth={1.75} /></span>
```

For Account button (line ~140):
```tsx
{/* Before */}
<span className="sidebar-icon">&#128100;</span>

{/* After */}
<span className="sidebar-icon"><User size={15} strokeWidth={1.75} /></span>
```

- [ ] **Step 2: Verify icons render correctly**

Run: `cd packages/electron && npm run dev`
Expected: Lucide outline icons for all sidebar nav items. Active item icon is full opacity, inactive is 0.5.

- [ ] **Step 3: Commit**

```bash
git add packages/electron/src/components/Sidebar.tsx
git commit -m "feat: replace emoji sidebar icons with Lucide outline icons"
```

---

## Chunk 4: Notes List Redesign

### Task 7: Update notes list CSS

**Files:**
- Modify: `packages/electron/src/index.css`

- [ ] **Step 1: Update notes list CSS rules**

In `packages/electron/src/index.css`, update these rules:

```css
/* .notes-list-new-btn — ghost style instead of filled indigo */
.notes-list-new-btn {
  width: 28px;                     /* was 32px */
  height: 28px;                    /* was 32px */
  padding: 0;
  background: transparent;          /* was var(--accent-color) */
  border: 1px solid #2a2a2a;       /* new */
  border-radius: 6px;
  color: var(--text-muted);         /* was white implicit */
  font-size: 18px;                  /* was 20px */
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notes-list-new-btn:hover {
  background: #1e1e1e;              /* was var(--accent-hover) */
  border-color: #444;               /* new */
  color: var(--text-secondary);     /* new */
}

/* .notes-list-item — update active state */
.notes-list-item.active {
  background: var(--bg-active);      /* was var(--bg-tertiary) */
  border-left: 2px solid var(--accent-color);  /* new — indigo left accent */
  padding-left: 18px;               /* adjust to compensate for 2px border */
}

/* .notes-list-item-date — use monospace */
.notes-list-item-date {
  font-family: var(--font-mono);    /* new */
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-left: 8px;
}

/* .notes-list-item-category-dot — smaller */
.notes-list-item-category-dot {
  width: 5px;      /* was 8px */
  height: 5px;     /* was 8px */
  border-radius: 50%;
}
```

- [ ] **Step 2: Add CSS for note sync status dot**

Add new CSS rule in `packages/electron/src/index.css` after the `.notes-list-item-category` rules:

```css
/* Note sync status dot */
.notes-list-item-sync-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #f59e0b;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Verify notes list styling**

Run: `cd packages/electron && npm run dev`
Expected: Ghost "+" button, active note has indigo left border, monospace dates

- [ ] **Step 4: Commit**

```bash
git add packages/electron/src/index.css
git commit -m "style: update notes list with ghost button, active left border, monospace dates"
```

### Task 8: Add pending sync dots to NotesList component

**Files:**
- Modify: `packages/electron/src/components/NotesList.tsx`

- [ ] **Step 1: Add pendingNoteIds prop to NotesList**

In `packages/electron/src/components/NotesList.tsx`, update the interface:

```tsx
interface NotesListProps {
  notes: Note[];
  selectedNoteId: string | null;
  onNoteSelect: (note: Note) => void;
  onNewNote: () => void;
  isLoading: boolean;
  viewTitle: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showCategory?: boolean;
  style?: React.CSSProperties;
  pendingNoteIds?: Set<string>;  // NEW
}
```

Update the function signature to destructure the new prop:

```tsx
export default function NotesList({
  notes,
  selectedNoteId,
  onNoteSelect,
  onNewNote,
  isLoading,
  viewTitle,
  searchQuery,
  onSearchChange,
  showCategory = true,
  style,
  pendingNoteIds,  // NEW
}: NotesListProps) {
```

- [ ] **Step 2: Add sync dot to note item header**

In the `notes.map()` JSX, update the header div to show a sync dot when the note is pending:

```tsx
<div className="notes-list-item-header">
  <span className="notes-list-item-title">
    {pendingNoteIds?.has(note.id) && (
      <span className="notes-list-item-sync-dot" title="Pending sync" />
    )}
    {getTitle(note.content)}
  </span>
  <span className="notes-list-item-date">{formatDate(note.updatedAt)}</span>
</div>
```

Also add CSS for the title to accommodate the dot inline. Update `.notes-list-item-title` to include flex layout:

In `packages/electron/src/index.css`:
```css
.notes-list-item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;          /* new */
  align-items: center;    /* new */
  gap: 6px;               /* new */
}
```

- [ ] **Step 3: Verify sync dot renders (pass an empty Set for now)**

The prop is optional, so it defaults to undefined. The sync dot won't show yet — that's wired up in a later task.

- [ ] **Step 4: Commit**

```bash
git add packages/electron/src/components/NotesList.tsx packages/electron/src/index.css
git commit -m "feat: add pending sync dot indicator to notes list items"
```

---

## Chunk 5: Editor Toolbar & Footer

### Task 9: Update editor toolbar CSS and add new CSS rules

**Files:**
- Modify: `packages/electron/src/index.css`

- [ ] **Step 1: Add new CSS rules for editor toolbar and footer**

In `packages/electron/src/index.css`, add after the existing `.note-editor-saving` animation:

```css
/* Editor toolbar tab buttons */
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

/* Toolbar divider */
.note-editor-toolbar-divider {
  width: 1px;
  height: 16px;
  background: #2a2a2a;
  margin: 0 4px;
  flex-shrink: 0;
}

/* Toolbar sync indicator */
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

.note-editor-sync-dot.connected {
  background: var(--success-color);
}

.note-editor-sync-dot.pending {
  background: #f59e0b;
}

.note-editor-sync-dot.syncing {
  background: var(--accent-color);
  animation: pulse 1s ease-in-out infinite;
}

.note-editor-sync-dot.disconnected {
  background: var(--danger-color);
}

.note-editor-sync-dot.connecting,
.note-editor-sync-dot.reconnecting {
  background: #f59e0b;
  animation: pulse 1.5s ease-in-out infinite;
}

/* Editor footer bar */
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

- [ ] **Step 2: Update existing editor action button style**

Update `.note-editor-action-btn` to be more ghost-like:

```css
.note-editor-action-btn {
  width: 28px;                      /* was 32px */
  height: 28px;                     /* was 32px */
  padding: 0;
  background: transparent;           /* was var(--bg-tertiary) */
  border: 1px solid #2a2a2a;        /* was 1px solid var(--border-color) */
  border-radius: 6px;
  color: var(--text-muted);          /* was var(--text-secondary) */
  font-size: 14px;                   /* was 16px */
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.note-editor-action-btn:hover {
  background: #1e1e1e;               /* was var(--bg-hover) */
  border-color: #444;                /* new */
  color: var(--text-secondary);      /* was var(--text-primary) */
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/electron/src/index.css
git commit -m "style: add editor toolbar tabs, sync indicator, footer bar CSS"
```

### Task 10: Update NoteEditor component with toolbar tabs, sync indicator, and footer

**Files:**
- Modify: `packages/electron/src/components/NoteEditor.tsx`

- [ ] **Step 1: Add new props to NoteEditorProps**

In `packages/electron/src/components/NoteEditor.tsx`, update the interface:

```tsx
interface NoteEditorProps {
  note: Note | null;
  categories: Category[];
  onSave: (content: string, categoryId?: string) => void;
  onArchive: () => void;
  onRestore: () => void;
  onTrash: () => void;
  onDelete: () => void;
  isNew: boolean;
  isSaving: boolean;
  onCategoryChanged?: (categoryName: string) => void;
  initialCategoryId?: string;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  syncStatus?: string;           // NEW: 'idle' | 'syncing' | 'error'
  connectionState?: string;      // NEW: 'connected' | 'connecting' | 'reconnecting' | 'disconnected'
  pendingCount?: number;         // NEW
}
```

Update the function signature to destructure the new props:

```tsx
export default function NoteEditor({
  note,
  categories,
  onSave,
  onArchive,
  onRestore,
  onTrash,
  onDelete,
  isNew,
  isSaving,
  onCategoryChanged,
  initialCategoryId,
  isFocusMode,
  onToggleFocusMode,
  syncStatus,
  connectionState,
  pendingCount,
}: NoteEditorProps) {
```

- [ ] **Step 2: Add helper function for sync label**

Add this helper inside the component, before the return:

```tsx
const getSyncInfo = () => {
  if (syncStatus === 'syncing') {
    return { dotClass: 'syncing', label: 'syncing' };
  }
  if (pendingCount && pendingCount > 0) {
    return { dotClass: 'pending', label: `${pendingCount} pending` };
  }
  if (connectionState === 'disconnected') {
    return { dotClass: 'disconnected', label: 'offline' };
  }
  if (connectionState === 'connecting' || connectionState === 'reconnecting') {
    return { dotClass: connectionState, label: connectionState === 'connecting' ? 'connecting' : 'reconnecting' };
  }
  return { dotClass: 'connected', label: 'synced' };
};
```

- [ ] **Step 3: Add helper for platform-aware keyboard shortcuts**

Add this helper at the top of the file (outside the component):

```tsx
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';
```

- [ ] **Step 4: Add helper for note metadata (character count, line count)**

Add this inside the component, before the return:

```tsx
const charCount = content.length;
const lineCount = content.split('\n').length;
const noteVersion = note?.version || 1;
```

- [ ] **Step 5: Update the toolbar JSX**

Replace the entire `.note-editor-toolbar` div in the return JSX with:

```tsx
<div className="note-editor-toolbar">
  <div className="note-editor-toolbar-left">
    {/* Edit/Preview tabs */}
    <button className="note-editor-tab active">Edit</button>
    <button className="note-editor-tab disabled" title="Preview (coming soon)">Preview</button>
    <span className="note-editor-toolbar-divider" />

    {/* Category selector (existing — "Move to:" label intentionally removed for compact toolbar) */}
    <div className="note-editor-category-selector">
      <button
        className="note-editor-category-btn"
        onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
      >
        {selectedCategory ? (
          <>
            <span
              className="note-editor-category-dot"
              style={{ backgroundColor: selectedCategory.color }}
            />
            {selectedCategory.name}
          </>
        ) : (
          'Inbox'
        )}
        <span className="note-editor-category-arrow">&#9662;</span>
      </button>
      {showCategoryDropdown && (
        <div className="note-editor-category-dropdown">
          <button
            className={`note-editor-category-option ${!selectedCategoryId ? 'selected' : ''}`}
            onClick={() => handleCategoryChange(undefined)}
          >
            Inbox
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              className={`note-editor-category-option ${selectedCategoryId === category.id ? 'selected' : ''}`}
              onClick={() => handleCategoryChange(category.id)}
            >
              <span
                className="note-editor-category-dot"
                style={{ backgroundColor: category.color }}
              />
              {category.name}
            </button>
          ))}
        </div>
      )}
    </div>

    {/* Code block button (existing) */}
    <div className="note-editor-code-block-selector">
      <button
        className="note-editor-action-btn"
        onClick={() => setShowCodeLangDropdown(!showCodeLangDropdown)}
        title="Insert Code Block (Ctrl+Shift+K)"
      >
        &lt;/&gt;
      </button>
      {showCodeLangDropdown && (
        <div className="note-editor-code-lang-dropdown">
          {CODE_LANGUAGES.map((lang) => (
            <button
              key={lang || '_plain'}
              className="note-editor-code-lang-option"
              onClick={() => handleCodeBlockInsert(lang)}
            >
              {lang || 'Plain text'}
            </button>
          ))}
        </div>
      )}
    </div>

    {showSavingIndicator && <span className="note-editor-saving">Saving...</span>}
  </div>

  <div className="note-editor-toolbar-right">
    {/* Sync indicator */}
    {(() => {
      const sync = getSyncInfo();
      return (
        <span className="note-editor-sync-indicator">
          <span className={`note-editor-sync-dot ${sync.dotClass}`} />
          {sync.label}
        </span>
      );
    })()}
    <span className="note-editor-toolbar-divider" />

    {onToggleFocusMode && (
      <button
        className="note-editor-action-btn focus-mode-toolbar-btn"
        onClick={onToggleFocusMode}
        title={isFocusMode ? 'Exit Focus Mode (Ctrl+Shift+F)' : 'Focus Mode (Ctrl+Shift+F)'}
      >
        {isFocusMode ? '\u2715' : '\u2922'}
      </button>
    )}
    {note?.status === NoteStatus.Inbox && (
      <button className="note-editor-action-btn" onClick={onArchive} title="Archive">
        &#128451;
      </button>
    )}
    {note?.status === NoteStatus.Archived && (
      <button className="note-editor-action-btn" onClick={onRestore} title="Move to Inbox">
        &#128229;
      </button>
    )}
    {note?.status === NoteStatus.Trash ? (
      <>
        <button className="note-editor-action-btn" onClick={onRestore} title="Restore">
          &#8634;
        </button>
        <button className="note-editor-action-btn danger" onClick={onDelete} title="Delete Permanently">
          &#128465;
        </button>
      </>
    ) : (
      <button className="note-editor-action-btn" onClick={onTrash} title="Move to Trash">
        &#128465;
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 6: Add the footer bar after the textarea**

After the `<textarea>` element (the `.note-editor-content` element), add the footer:

```tsx
<textarea
  ref={textareaRef}
  className="note-editor-content"
  value={content}
  onChange={handleContentChange}
  onKeyDown={handleKeyDown}
  placeholder="Start typing your note..."
  autoFocus={isNew}
/>

{/* Editor footer bar */}
<div className="note-editor-footer">
  <div className="note-editor-footer-left">
    <span>v{noteVersion}</span>
    <span>&middot;</span>
    <span>{charCount} chars</span>
    <span>&middot;</span>
    <span>{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
  </div>
  <div className="note-editor-footer-right">
    <span><span className="note-editor-kbd">{modKey}+S</span> save</span>
    <span><span className="note-editor-kbd">{modKey}+Shift+F</span> focus</span>
  </div>
</div>
```

- [ ] **Step 7: Verify toolbar and footer render**

Run: `cd packages/electron && npm run dev`
Expected: Toolbar shows Edit (active) / Preview (disabled) tabs, divider, category selector, code button, sync indicator. Footer shows version, char count, line count, keyboard hints.

- [ ] **Step 8: Commit**

```bash
git add packages/electron/src/components/NoteEditor.tsx
git commit -m "feat: add editor toolbar tabs, sync indicator, and footer bar"
```

---

## Chunk 6: Data Plumbing & Connection Status Migration

### Task 11: Expose pending note IDs from SyncManager

**Files:**
- Modify: `packages/electron/src/services/syncManager.ts`

- [ ] **Step 1: Add getPendingNoteIds method to SyncManager**

In `packages/electron/src/services/syncManager.ts`, add a new public method:

```tsx
async getPendingNoteIds(): Promise<Set<string>> {
  const queue = await getSyncQueue();
  const noteIds = new Set<string>();
  for (const item of queue) {
    if (item.entityType === 'note') {
      noteIds.add(item.entityId);
    }
  }
  return noteIds;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/electron/src/services/syncManager.ts
git commit -m "feat: add getPendingNoteIds method to SyncManager"
```

### Task 12: Thread sync state through Home.tsx

**Files:**
- Modify: `packages/electron/src/pages/Home.tsx`

- [ ] **Step 1: Add pendingNoteIds state**

In `packages/electron/src/pages/Home.tsx`, add state:

```tsx
const [pendingNoteIds, setPendingNoteIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: Add fetchPendingNoteIds function**

Add a callback to fetch pending note IDs:

```tsx
const fetchPendingNoteIds = useCallback(async () => {
  if (!syncManagerRef.current) return;
  try {
    const ids = await syncManagerRef.current.getPendingNoteIds();
    setPendingNoteIds(ids);
  } catch (error) {
    console.error('Failed to fetch pending note IDs:', error);
  }
}, []);
```

- [ ] **Step 3: Call fetchPendingNoteIds when pending count changes**

Add a useEffect that refreshes pending IDs when pendingCount changes:

```tsx
useEffect(() => {
  fetchPendingNoteIds();
}, [pendingCount, fetchPendingNoteIds]);
```

- [ ] **Step 4: Pass pendingNoteIds to NotesList**

In the JSX, add the prop to NotesList:

```tsx
<NotesList
  notes={notes}
  selectedNoteId={selectedNote?.id || null}
  onNoteSelect={handleNoteSelect}
  onNewNote={handleNewNote}
  isLoading={isLoading}
  viewTitle={getViewTitle()}
  style={{ width: notesListWidth }}
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
  showCategory={selectedView === 'inbox' || selectedView === 'archive' || selectedView === 'trash'}
  pendingNoteIds={pendingNoteIds}
/>
```

- [ ] **Step 5: Pass sync props to NoteEditor**

In the JSX, add the new props to NoteEditor:

```tsx
<NoteEditor
  note={selectedNote}
  categories={categories}
  onSave={handleSave}
  onArchive={handleArchive}
  onRestore={handleRestore}
  onTrash={handleTrash}
  onDelete={handleDelete}
  isNew={isNewNote}
  isSaving={isSaving}
  onCategoryChanged={handleCategoryChanged}
  initialCategoryId={newNoteInitialCategoryId}
  isFocusMode={isFocusMode}
  onToggleFocusMode={toggleFocusMode}
  syncStatus={syncStatus}
  connectionState={connectionState}
  pendingCount={pendingCount}
/>
```

- [ ] **Step 6: Remove ConnectionStatus component from Home render**

Delete the `<ConnectionStatus>` JSX element from the return (currently at the bottom, before the closing `</div>`):

```tsx
{/* REMOVE THIS */}
<ConnectionStatus
  connectionState={connectionState}
  syncStatus={syncStatus}
  pendingCount={pendingCount}
  connectedDevices={connectedDevices}
/>
```

Keep the import for now (it will be removed or repurposed in a later task).

- [ ] **Step 7: Add sidebar footer sync fallback**

For when no note is selected, add a simple sync indicator in the sidebar footer. In `packages/electron/src/components/Sidebar.tsx`, add a new prop:

```tsx
interface SidebarProps {
  // ... existing props ...
  syncStatus?: string;
  connectionState?: string;
  pendingCount?: number;
}
```

Update the function signature to destructure the new props:

```tsx
export default function Sidebar({
  categories,
  selectedView,
  onViewChange,
  onManageCategories,
  onNewNoteInCategory,
  inboxCount,
  archiveCount,
  trashCount,
  style,
  syncStatus,
  connectionState,
  pendingCount,
}: SidebarProps) {
```

Inside the `<div className="sidebar-footer">`, after the Account `<button>` element but before the closing `</div>` of `sidebar-footer`, add:

```tsx
{/* Sync status fallback indicator */}
{(() => {
  let dotClass = 'connected';
  let label = 'synced';
  if (syncStatus === 'syncing') { dotClass = 'syncing'; label = 'syncing'; }
  else if (pendingCount && pendingCount > 0) { dotClass = 'pending'; label = `${pendingCount} pending`; }
  else if (connectionState === 'disconnected') { dotClass = 'disconnected'; label = 'offline'; }
  else if (connectionState === 'connecting') { dotClass = 'connecting'; label = 'connecting'; }
  else if (connectionState === 'reconnecting') { dotClass = 'reconnecting'; label = 'reconnecting'; }
  return (
    <div className="sidebar-sync-status">
      <span className={`sidebar-sync-dot ${dotClass}`} />
      <span>{label}</span>
    </div>
  );
})()}
```

Add CSS for sidebar sync status in `packages/electron/src/index.css`:

```css
/* Sidebar sync status fallback */
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
.sidebar-sync-dot.pending { background: #f59e0b; }
.sidebar-sync-dot.syncing { background: var(--accent-color); animation: pulse 1s ease-in-out infinite; }
.sidebar-sync-dot.disconnected { background: var(--danger-color); }
.sidebar-sync-dot.connecting,
.sidebar-sync-dot.reconnecting { background: #f59e0b; animation: pulse 1.5s ease-in-out infinite; }
```

Pass the sync props from Home.tsx to Sidebar:

```tsx
<Sidebar
  categories={categories}
  selectedView={selectedView}
  onViewChange={handleViewChange}
  onManageCategories={() => setShowCategoryManager(true)}
  onNewNoteInCategory={handleNewNoteInCategory}
  inboxCount={inboxCount}
  archiveCount={0}
  trashCount={0}
  style={{ width: sidebarWidth }}
  syncStatus={syncStatus}
  connectionState={connectionState}
  pendingCount={pendingCount}
/>
```

- [ ] **Step 8: Verify end-to-end**

Run: `cd packages/electron && npm run dev`
Expected:
- Notes list shows orange dots for pending sync notes
- Editor toolbar shows sync indicator (green dot + "synced" when connected)
- Sidebar footer shows sync status
- Bottom-right ConnectionStatus badge is gone

- [ ] **Step 9: Clean up unused ConnectionStatus import if fully removed**

If ConnectionStatus is no longer used anywhere, remove the import from Home.tsx and optionally delete the component file.

- [ ] **Step 10: Commit**

```bash
git add packages/electron/src/services/syncManager.ts packages/electron/src/pages/Home.tsx packages/electron/src/components/Sidebar.tsx packages/electron/src/components/NotesList.tsx packages/electron/src/components/NoteEditor.tsx packages/electron/src/index.css
git commit -m "feat: migrate sync status to inline indicators, remove floating badge"
```

---

## Chunk 7: Final Polish & Verification

### Task 13: Clean up remaining CSS inconsistencies

**Files:**
- Modify: `packages/electron/src/index.css`

- [ ] **Step 1: Remove old ConnectionStatus CSS (but preserve @keyframes pulse)**

Delete the `.connection-status` block and related rules (`.connection-status-dot`, `.connection-status-button`, `.connection-status-dropdown`, etc.) from `packages/electron/src/index.css` (currently around lines 1270-1420). **IMPORTANT:** Preserve the `@keyframes pulse` definition (currently around line 1316) — it is still used by the new sync dot CSS added in Task 9. Move it to a general location near the other `@keyframes` definitions (e.g., near `@keyframes saving-fade-in`).

- [ ] **Step 2: Update category dropdown box-shadow to be minimal**

In `.note-editor-category-dropdown` and `.note-editor-code-lang-dropdown`, reduce the box-shadow:

```css
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);  /* was 0 8px 24px rgba(0, 0, 0, 0.3) */
```

- [ ] **Step 3: Update sidebar context menu shadow**

In `.sidebar-context-menu`:
```css
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);  /* was 0 8px 24px rgba(0, 0, 0, 0.3) */
```

- [ ] **Step 4: Verify full app works end to end**

Run: `cd packages/electron && npm run dev`

Test these flows:
1. Login page renders with correct button styling
2. Sidebar shows Lucide icons, compact spacing, lowercase "flashpad" logo
3. Category dots are small (6px), counts are monospace
4. Notes list: ghost "+" button, indigo left border on active note, monospace dates
5. Editor: Edit (active) / Preview (disabled) tabs, sync indicator, footer bar with version/chars/lines/shortcuts
6. Creating a new note works
7. Switching categories works
8. Focus mode still works (Ctrl+Shift+F)
9. Sync status shows in sidebar footer

- [ ] **Step 5: Verify TypeScript compiles cleanly**

Run: `cd packages/electron && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add packages/electron/src/index.css
git commit -m "style: clean up old ConnectionStatus CSS, reduce dropdown shadows"
```

### Task 14: Build verification

**Files:** None (verification only)

- [ ] **Step 1: Run production build**

Run: `cd packages/electron && npm run build:ci`
Expected: Build succeeds with no errors

- [ ] **Step 2: Commit any build fixes if needed**

Only if the build revealed issues.
