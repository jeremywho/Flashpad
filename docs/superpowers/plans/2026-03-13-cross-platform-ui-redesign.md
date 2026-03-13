# Cross-Platform UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Electron app's warmer palette, Inter/JetBrains Mono fonts, Lucide icons, ghost buttons, editor footer, and inline sync indicators to the web and mobile apps for visual parity across all platforms.

**Architecture:** Two independent workstreams — web (CSS + React component changes, mirrors Electron 1:1) and mobile (React Native StyleSheet + font linking + lucide-react-native). No new features, no backend changes.

**Tech Stack:** React, CSS variables, lucide-react (web), lucide-react-native + react-native-svg (mobile), Inter font, JetBrains Mono font

**Spec:** `docs/superpowers/specs/2026-03-13-cross-platform-ui-redesign-design.md`

---

## Chunk 1: Web — Dependencies, Fonts & Palette

### Task 1: Install lucide-react for web

**Files:**
- Modify: `packages/web/package.json`

- [ ] **Step 1: Install lucide-react**

```bash
cd packages/web && npm install lucide-react
```

- [ ] **Step 2: Verify installation**

```bash
cd packages/web && node -e "require('lucide-react')"
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/package.json packages/web/package-lock.json
git commit -m "chore(web): add lucide-react dependency"
```

### Task 2: Add Google Fonts and update typography

**Files:**
- Modify: `packages/web/index.html`
- Modify: `packages/web/src/index.css`

- [ ] **Step 1: Add Google Fonts link tags to index.html**

In `packages/web/index.html`, add before the closing `</head>` tag (after line 34):

```html
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Update body font-family in index.css**

In `packages/web/src/index.css`, replace lines 40-42:

```css
/* Before */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;

/* After */
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/index.html packages/web/src/index.css
git commit -m "style(web): add Inter and JetBrains Mono fonts via Google Fonts CDN"
```

### Task 3: Update dark theme CSS variables

**Files:**
- Modify: `packages/web/src/index.css`

- [ ] **Step 1: Update :root block (lines 1-15)**

Replace the `:root` block with:

```css
:root {
  --bg-primary: #141414;
  --bg-secondary: #191919;
  --bg-tertiary: #1c1c1c;
  --bg-hover: #1f1f1f;
  --bg-active: #252525;
  --text-primary: #d8d8d8;
  --text-secondary: #b0b0b0;
  --text-muted: #505050;
  --border-color: #232323;
  --accent-color: #6366f1;
  --accent-hover: #5558e3;
  --danger-color: #ef4444;
  --success-color: #22c55e;
  --font-mono: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
}
```

Do NOT change the `[data-theme="light"]` block.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/index.css
git commit -m "style(web): update dark theme palette to warmer tones, add --font-mono"
```

### Task 4: Reset global button styles

**Files:**
- Modify: `packages/web/src/index.css`
- Modify: `packages/web/src/pages/Login.tsx`
- Modify: `packages/web/src/pages/Register.tsx`

- [ ] **Step 1: Replace global button rules (lines 123-144) in index.css**

```css
/* Before — lines 123-144 */
button {
  width: 100%;
  padding: 12px;
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.15s;
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
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
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

- [ ] **Step 2: Add `color: white` to `.category-manager-submit` (line 863)**

In `packages/web/src/index.css`, add `color: white;` to `.category-manager-submit`:

```css
.category-manager-submit {
  width: auto;
  padding: 10px 16px;
  background: var(--accent-color);
  color: white;
  border-radius: 6px;
  font-size: 14px;
}
```

- [ ] **Step 3: Add btn-primary class to Login submit button**

In `packages/web/src/pages/Login.tsx` line 56, change:
```tsx
<button type="submit" disabled={loading}>
```
to:
```tsx
<button type="submit" disabled={loading} className="btn-primary">
```

- [ ] **Step 4: Add btn-primary class to Register submit button**

In `packages/web/src/pages/Register.tsx`, find the submit `<button>` and add `className="btn-primary"`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/index.css packages/web/src/pages/Login.tsx packages/web/src/pages/Register.tsx
git commit -m "style(web): reset global button to ghost style, add .btn-primary class"
```

---

## Chunk 2: Web — Sidebar & Notes List Redesign

### Task 5: Update sidebar CSS

**Files:**
- Modify: `packages/web/src/index.css`

- [ ] **Step 1: Update sidebar CSS rules**

Update these rules in `packages/web/src/index.css`:

`.sidebar-logo` (line 222-227) — replace with:
```css
.sidebar-logo {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
  text-transform: lowercase;
  letter-spacing: 0.5px;
}
```

`.sidebar-section-header` (lines 239-245) — replace with:
```css
.sidebar-section-header {
  padding: 14px 14px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: #454545;
  letter-spacing: 1px;
}
```

`.sidebar-item` (lines 248-261) — replace with:
```css
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: auto;
  padding: 6px 14px;
  margin: 1px 6px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  border-radius: 6px;
  transition: background-color 0.15s, color 0.15s;
}
```

`.sidebar-icon` (lines 273-277) — replace with:
```css
.sidebar-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  flex-shrink: 0;
}
```

Add new rule after `.sidebar-item.active`:
```css
.sidebar-item.active .sidebar-icon {
  opacity: 1;
}
```

`.sidebar-count` (lines 283-289) — replace with:
```css
.sidebar-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  background: none;
  padding: 0;
  border-radius: 0;
}
```

`.sidebar-color-dot` (lines 291-296) — replace with:
```css
.sidebar-color-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Reduce context menu shadow**

Update `.sidebar-context-menu` (line 334):
```css
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/index.css
git commit -m "style(web): update sidebar CSS — compact spacing, lowercase logo, monospace counts"
```

### Task 6: Swap sidebar icons to Lucide

**Files:**
- Modify: `packages/web/src/components/Sidebar.tsx`

- [ ] **Step 1: Add Lucide imports and replace emoji icons**

In `packages/web/src/components/Sidebar.tsx`, add import at top:
```tsx
import { Inbox, Archive, Trash2, Settings, User } from 'lucide-react';
```

Replace all 5 emoji `<span>` icons:

Line 84: `<span className="sidebar-icon">&#128229;</span>` → `<span className="sidebar-icon"><Inbox size={15} strokeWidth={1.75} /></span>`

Line 93: `<span className="sidebar-icon">&#128451;</span>` → `<span className="sidebar-icon"><Archive size={15} strokeWidth={1.75} /></span>`

Line 102: `<span className="sidebar-icon">&#128465;</span>` → `<span className="sidebar-icon"><Trash2 size={15} strokeWidth={1.75} /></span>`

Line 136: `<span className="sidebar-icon">&#9881;</span>` → `<span className="sidebar-icon"><Settings size={15} strokeWidth={1.75} /></span>`

Line 140: `<span className="sidebar-icon">&#128100;</span>` → `<span className="sidebar-icon"><User size={15} strokeWidth={1.75} /></span>`

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/Sidebar.tsx
git commit -m "feat(web): replace emoji sidebar icons with Lucide outline icons"
```

### Task 7: Update notes list CSS

**Files:**
- Modify: `packages/web/src/index.css`

- [ ] **Step 1: Update notes list CSS rules**

`.notes-list-new-btn` (lines 388-399) — replace with:
```css
.notes-list-new-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

`.notes-list-new-btn:hover` (lines 401-403) — replace with:
```css
.notes-list-new-btn:hover {
  background: #1e1e1e;
  border-color: #444;
  color: var(--text-secondary);
}
```

`.notes-list-item.active` (lines 478-480) — replace with:
```css
.notes-list-item.active {
  background: var(--bg-active);
  border-left: 2px solid var(--accent-color);
  padding-left: 18px;
}
```

`.notes-list-item-date` (lines 499-504) — add `font-family`:
```css
.notes-list-item-date {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-left: 8px;
}
```

`.notes-list-item-category-dot` (lines 525-529) — replace with:
```css
.notes-list-item-category-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/index.css
git commit -m "style(web): update notes list — ghost button, active left border, monospace dates"
```

---

## Chunk 3: Web — Editor Toolbar, Footer & Sync Migration

### Task 8: Add editor toolbar/footer CSS and update action buttons

**Files:**
- Modify: `packages/web/src/index.css`

- [ ] **Step 1: Update `.note-editor-action-btn` (lines 680-698)**

Replace with:
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

.note-editor-action-btn.danger:hover {
  background: var(--danger-color);
  color: white;
  border-color: var(--danger-color);
}
```

- [ ] **Step 2: Add new CSS classes after `.note-editor-saving` animation (after line 678)**

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

.note-editor-sync-dot.connected { background: var(--success-color); }
.note-editor-sync-dot.connecting,
.note-editor-sync-dot.reconnecting { background: #f59e0b; animation: pulse 1.5s ease-in-out infinite; }
.note-editor-sync-dot.disconnected { background: var(--danger-color); }

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

/* Sidebar sync status */
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

- [ ] **Step 3: Reduce dropdown box shadows**

Update `.note-editor-category-dropdown` (line 642) and `.note-editor-code-lang-dropdown` (line 756):
```css
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
```

- [ ] **Step 4: Delete old ConnectionStatus CSS (lines 1207-1268)**

Delete from `.connection-status {` through `.connection-status.disconnected .connection-status-label {`. **Preserve** `@keyframes pulse` (lines 1252-1259) — move it near the other `@keyframes` definitions.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/index.css
git commit -m "style(web): add editor toolbar tabs, footer, sync indicator CSS; remove ConnectionStatus CSS"
```

### Task 9: Update NoteEditor component — Lucide icons, toolbar tabs, sync indicator, footer

**Files:**
- Modify: `packages/web/src/components/NoteEditor.tsx`

- [ ] **Step 1: Add imports**

At top of file:
```tsx
import { Archive, Inbox, RotateCcw, Trash2, Maximize2, X, Code, FileText } from 'lucide-react';
```

Add platform detection and metadata helpers (before the component function, after the `useDebouncedSavingIndicator` hook):
```tsx
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';
```

- [ ] **Step 2: Add `connectionState` prop to NoteEditorProps (line 78-92)**

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
  connectionState?: string;
}
```

Destructure in function signature (add `connectionState` after `onToggleFocusMode`).

- [ ] **Step 3: Add sync helper and metadata inside the component, before the return**

```tsx
const getSyncLabel = () => {
  if (connectionState === 'disconnected') return { dotClass: 'disconnected', label: 'offline' };
  if (connectionState === 'connecting') return { dotClass: 'connecting', label: 'connecting' };
  if (connectionState === 'reconnecting') return { dotClass: 'reconnecting', label: 'reconnecting' };
  return { dotClass: 'connected', label: 'synced' };
};

const charCount = content.length;
const lineCount = content.split('\n').length;
const noteVersion = note?.version || 1;
```

- [ ] **Step 4: Replace empty state icon (line 292)**

Replace `<span className="note-editor-empty-icon">&#128221;</span>` with:
```tsx
<span className="note-editor-empty-icon"><FileText size={48} strokeWidth={1.5} /></span>
```

Also replace focus mode toggle icons in empty state (line 301):
```tsx
{isFocusMode ? <X size={14} strokeWidth={1.75} /> : <Maximize2 size={14} strokeWidth={1.75} />}
```

- [ ] **Step 5: Update the toolbar JSX (lines 312-437)**

Replace the entire `.note-editor-toolbar` div:

```tsx
<div className="note-editor-toolbar">
  <div className="note-editor-toolbar-left">
    <button className="note-editor-tab active">Edit</button>
    <button className="note-editor-tab disabled" title="Preview (coming soon)">Preview</button>
    <span className="note-editor-toolbar-divider" />

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

    <div className="note-editor-code-block-selector">
      <button
        className="note-editor-action-btn"
        onClick={() => setShowCodeLangDropdown(!showCodeLangDropdown)}
        title="Insert Code Block (Ctrl+Shift+K)"
      >
        <Code size={14} strokeWidth={1.75} />
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
    {(() => {
      const sync = getSyncLabel();
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
        {isFocusMode ? <X size={14} strokeWidth={1.75} /> : <Maximize2 size={14} strokeWidth={1.75} />}
      </button>
    )}
    {note?.status === NoteStatus.Inbox && (
      <button className="note-editor-action-btn" onClick={onArchive} title="Archive">
        <Archive size={14} strokeWidth={1.75} />
      </button>
    )}
    {note?.status === NoteStatus.Archived && (
      <button className="note-editor-action-btn" onClick={onRestore} title="Move to Inbox">
        <Inbox size={14} strokeWidth={1.75} />
      </button>
    )}
    {note?.status === NoteStatus.Trash ? (
      <>
        <button className="note-editor-action-btn" onClick={onRestore} title="Restore">
          <RotateCcw size={14} strokeWidth={1.75} />
        </button>
        <button className="note-editor-action-btn danger" onClick={onDelete} title="Delete Permanently">
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      </>
    ) : (
      <button className="note-editor-action-btn" onClick={onTrash} title="Move to Trash">
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 6: Add footer bar after the textarea (after line 447)**

After the `<textarea>` and before the `{isNew && (` block:

```tsx
{/* Editor footer bar */}
{!isNew && (
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
)}
```

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/NoteEditor.tsx
git commit -m "feat(web): add editor toolbar tabs, Lucide icons, sync indicator, footer bar"
```

### Task 10: Add sync props to Sidebar and Home, remove ConnectionStatus

**Files:**
- Modify: `packages/web/src/components/Sidebar.tsx`
- Modify: `packages/web/src/pages/Home.tsx`

- [ ] **Step 1: Add connectionState prop to Sidebar**

In `packages/web/src/components/Sidebar.tsx`, update `SidebarProps` (line 5-15) — add:
```tsx
  connectionState?: string;
```

Add to destructuring (line 25-35):
```tsx
  connectionState,
```

- [ ] **Step 2: Add sync status indicator to sidebar footer**

In `Sidebar.tsx`, inside `<div className="sidebar-footer">` (after the Account button, before the closing `</div>` of sidebar-footer — after line 142):

```tsx
{/* Sync status */}
{(() => {
  let dotClass = 'connected';
  let label = 'synced';
  if (connectionState === 'disconnected') { dotClass = 'disconnected'; label = 'offline'; }
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

- [ ] **Step 3: Update Home.tsx — pass connectionState to Sidebar and NoteEditor, remove ConnectionStatus**

In `packages/web/src/pages/Home.tsx`:

Remove the import on line 8:
```tsx
import ConnectionStatus from '../components/ConnectionStatus';
```

Add `connectionState` prop to Sidebar JSX (around line 427-437):
```tsx
<Sidebar
  ...existing props...
  connectionState={connectionState}
/>
```

Add `connectionState` prop to NoteEditor JSX (around line 460-474):
```tsx
<NoteEditor
  ...existing props...
  connectionState={connectionState}
/>
```

Remove `<ConnectionStatus state={connectionState} />` on line 484.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/Sidebar.tsx packages/web/src/pages/Home.tsx
git commit -m "feat(web): migrate sync status to inline indicators, remove floating badge"
```

### Task 11: Verify web app builds

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check**

```bash
cd packages/web && npx tsc --noEmit
```
Expected: No type errors

- [ ] **Step 2: Run dev server and verify visually**

```bash
cd packages/web && npm run dev
```

Verify:
1. Login page — indigo submit button (btn-primary)
2. Sidebar — Lucide icons, compact spacing, lowercase "flashpad", monospace counts, sync status
3. Notes list — ghost "+" button, indigo left border on active, monospace dates
4. Editor — Edit/Preview tabs, Lucide action icons, sync indicator, footer bar
5. No floating ConnectionStatus badge

- [ ] **Step 3: Run production build**

```bash
cd packages/web && npm run build
```
Expected: Build succeeds

- [ ] **Step 4: Commit any fixes if needed**

---

## Chunk 4: Mobile — Dependencies, Fonts & Palette

### Task 12: Install mobile dependencies

**Files:**
- Modify: `packages/mobile/package.json`

- [ ] **Step 1: Install lucide-react-native and react-native-svg**

```bash
cd packages/mobile && npm install lucide-react-native react-native-svg
```

- [ ] **Step 2: Install iOS pods**

```bash
cd packages/mobile/ios && pod install
```

- [ ] **Step 3: Commit**

```bash
git add packages/mobile/package.json packages/mobile/package-lock.json packages/mobile/ios/Podfile.lock
git commit -m "chore(mobile): add lucide-react-native and react-native-svg dependencies"
```

### Task 13: Bundle fonts and create font constants

**Files:**
- Create: `packages/mobile/src/assets/fonts/` (5 .ttf files)
- Create: `packages/mobile/react-native.config.js`
- Create: `packages/mobile/src/theme/fonts.ts`

- [ ] **Step 1: Download font files**

Download and place in `packages/mobile/src/assets/fonts/`:
- `Inter-Regular.ttf` (weight 400)
- `Inter-Medium.ttf` (weight 500)
- `Inter-SemiBold.ttf` (weight 600)
- `JetBrainsMono-Regular.ttf` (weight 400)
- `JetBrainsMono-Medium.ttf` (weight 500)

These can be copied from `packages/electron/src/assets/fonts/` if woff2 files exist there — but mobile needs .ttf format. Download from Google Fonts or the respective GitHub repos.

- [ ] **Step 2: Create react-native.config.js**

Create `packages/mobile/react-native.config.js`:
```js
module.exports = {
  assets: ['./src/assets/fonts/'],
};
```

- [ ] **Step 3: Link fonts into native projects**

```bash
cd packages/mobile && npx react-native-asset
```

This modifies iOS `Info.plist` (adds `UIAppFonts` entries) and copies fonts to `android/app/src/main/assets/fonts/`.

- [ ] **Step 4: Create fonts.ts**

Create `packages/mobile/src/theme/fonts.ts`:
```typescript
export const fonts = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semiBold: 'Inter-SemiBold',
  mono: 'JetBrainsMono-Regular',
  monoMedium: 'JetBrainsMono-Medium',
};
```

- [ ] **Step 5: Commit**

```bash
git add packages/mobile/src/assets/fonts/ packages/mobile/react-native.config.js packages/mobile/src/theme/fonts.ts packages/mobile/ios/ packages/mobile/android/
git commit -m "chore(mobile): bundle Inter and JetBrains Mono fonts, create font constants"
```

### Task 14: Update mobile dark theme palette

**Files:**
- Modify: `packages/mobile/src/theme/colors.ts`

- [ ] **Step 1: Update darkTheme values**

In `packages/mobile/src/theme/colors.ts`, update the `darkTheme` object:

```typescript
export const darkTheme = {
  background: '#141414',
  surface: '#191919',
  surfaceVariant: '#1c1c1c',
  surfaceElevated: '#262626',
  surfaceHover: '#1f1f1f',
  surfaceActive: '#252525',
  text: '#d8d8d8',
  textSecondary: '#b0b0b0',
  textMuted: '#505050',
  border: '#232323',
  accent: '#6366f1',
  accentHover: '#5558e3',
  danger: '#ef4444',
  success: '#22c55e',
};
```

Do NOT change `lightTheme`.

- [ ] **Step 2: Commit**

```bash
git add packages/mobile/src/theme/colors.ts
git commit -m "style(mobile): update dark theme palette to warmer tones"
```

---

## Chunk 5: Mobile — Login/Register Theme Fix & Toast

### Task 15: Make Login and Register theme-aware

**Files:**
- Modify: `packages/mobile/src/screens/LoginScreen.tsx`
- Modify: `packages/mobile/src/screens/RegisterScreen.tsx`

- [ ] **Step 1: Update LoginScreen to use theme**

In `packages/mobile/src/screens/LoginScreen.tsx`:

Add import at top:
```tsx
import { useTheme } from '../contexts/ThemeContext';
import { fonts } from '../theme/fonts';
```

Inside the function, add:
```tsx
const { theme } = useTheme();
```

Replace the hardcoded `StyleSheet.create` with a function that takes theme colors. Change from `const styles = StyleSheet.create({...})` to using dynamic styles. Replace all hardcoded color values:
- `backgroundColor: '#f5f5f5'` → `backgroundColor: theme.background`
- `backgroundColor: '#fff'` → `backgroundColor: theme.surface`
- `color: '#333'` → `color: theme.text`
- `borderColor: '#ddd'` → `borderColor: theme.border`
- `backgroundColor: '#007bff'` → `backgroundColor: theme.accent`
- `backgroundColor: '#ccc'` → `backgroundColor: theme.surfaceActive`
- `color: '#dc3545'` → `color: theme.danger`
- `color: '#666'` → `color: theme.textSecondary`
- `color: '#007bff'` → `color: theme.accent`

Add `fontFamily: fonts.regular` to body text styles, `fontFamily: fonts.medium` to labels and buttons.

- [ ] **Step 2: Update RegisterScreen identically**

Apply the same theme-aware changes to `packages/mobile/src/screens/RegisterScreen.tsx`.

- [ ] **Step 3: Commit**

```bash
git add packages/mobile/src/screens/LoginScreen.tsx packages/mobile/src/screens/RegisterScreen.tsx
git commit -m "style(mobile): make Login and Register screens theme-aware"
```

### Task 16: Update Toast colors

**Files:**
- Modify: `packages/mobile/src/components/Toast.tsx`

- [ ] **Step 1: Replace hardcoded colors**

In `packages/mobile/src/components/Toast.tsx`, update:
- `backgroundColor: '#1a1a1a'` → use theme `surface` color (import `useTheme` or pass as prop)
- `color: '#e0e0e0'` → use theme `text` color

Keep the status border colors (`#22c55e`, `#ef4444`, `#f59e0b`, `#6366f1`) as-is.

- [ ] **Step 2: Commit**

```bash
git add packages/mobile/src/components/Toast.tsx
git commit -m "style(mobile): make Toast component theme-aware"
```

---

## Chunk 6: Mobile — HomeScreen Redesign

### Task 17: Update HomeScreen with Lucide icons, ghost FAB, and styling

**Files:**
- Modify: `packages/mobile/src/screens/HomeScreen.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { Inbox, Archive, Trash2, User, Plus, X } from 'lucide-react-native';
import { fonts } from '../theme/fonts';
```

- [ ] **Step 2: Replace emoji filter tab icons**

Replace emoji text in filter tabs:
- `📥` → `<Inbox size={16} strokeWidth={1.75} color={...} />`
- `📦` → `<Archive size={16} strokeWidth={1.75} color={...} />`
- `🗑` → `<Trash2 size={16} strokeWidth={1.75} color={...} />`

- [ ] **Step 3: Replace profile icon**

Replace custom circle-based profile icon with:
```tsx
<User size={20} strokeWidth={1.75} color={colors.accent} />
```

- [ ] **Step 4: Update FAB to ghost style**

Replace the `fab` style:
```typescript
fab: {
  position: 'absolute',
  right: 20,
  bottom: 30,
  width: 56,
  height: 56,
  borderRadius: 28,
  backgroundColor: 'transparent',
  borderWidth: 1,
  borderColor: '#2a2a2a',
  justifyContent: 'center',
  alignItems: 'center',
},
```

Replace `<Text style={styles.fabText}>+</Text>` with:
```tsx
<Plus size={24} strokeWidth={1.75} color={colors.textMuted} />
```

- [ ] **Step 5: Replace search clear button**

Replace `×` text with `<X size={14} strokeWidth={1.75} color={...} />`.

- [ ] **Step 6: Update list item styling**

Update `categoryDot` style: `width: 5, height: 5`
Update `headerCategoryDot` style: `width: 5, height: 5`
Update `syncDot` style: `width: 5, height: 5, borderRadius: 2.5`
Add `fontFamily: fonts.mono` to timestamp styles
Add `fontFamily: fonts.regular` to body text styles

- [ ] **Step 7: Commit**

```bash
git add packages/mobile/src/screens/HomeScreen.tsx
git commit -m "feat(mobile): Lucide icons, ghost FAB, compact styling on HomeScreen"
```

---

## Chunk 7: Mobile — NoteEditor, Account, CategoryManager

### Task 18: Update NoteEditorScreen with footer bar and Lucide icons

**Files:**
- Modify: `packages/mobile/src/screens/NoteEditorScreen.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { Archive, Inbox, RotateCcw, Trash2, ChevronDown } from 'lucide-react-native';
import { fonts } from '../theme/fonts';
```

- [ ] **Step 2: Add metadata computation inside the component**

```tsx
const charCount = content.length;
const lineCount = content.split('\n').length;
const noteVersion = note?.version || 1;
```

- [ ] **Step 3: Replace text-based action buttons with Lucide icons**

Replace "Archive", "Restore", "Trash", "Delete" text buttons with ghost-style icon buttons using:
- `<Archive size={20} strokeWidth={1.75} color={colors.textMuted} />`
- `<RotateCcw size={20} strokeWidth={1.75} color={colors.textMuted} />`
- `<Trash2 size={20} strokeWidth={1.75} color={colors.textMuted} />`
- `<Trash2 size={20} strokeWidth={1.75} color={colors.danger} />` (for permanent delete)

Update button styles to ghost: transparent background, 1px border `#2a2a2a`, borderRadius 6.

- [ ] **Step 4: Add footer bar below the TextInput**

```tsx
<View style={styles.editorFooter}>
  <Text style={styles.editorFooterText}>
    v{noteVersion} · {charCount} chars · {lineCount} {lineCount === 1 ? 'line' : 'lines'}
  </Text>
</View>
```

Add styles:
```typescript
editorFooter: {
  borderTopWidth: 1,
  borderTopColor: colors.border,
  paddingVertical: 6,
  paddingHorizontal: 14,
},
editorFooterText: {
  fontFamily: fonts.mono,
  fontSize: 11,
  color: '#404040',
},
```

- [ ] **Step 5: Update sync indicator styling**

Reduce sync dot to 5px, add `fontFamily: fonts.mono` to sync text.

- [ ] **Step 6: Add `fontFamily: fonts.regular` to editor content**

- [ ] **Step 7: Commit**

```bash
git add packages/mobile/src/screens/NoteEditorScreen.tsx
git commit -m "feat(mobile): add editor footer bar, Lucide icons, ghost action buttons"
```

### Task 19: Update AccountScreen and CategoryManagerScreen with Lucide icons

**Files:**
- Modify: `packages/mobile/src/screens/AccountScreen.tsx`
- Modify: `packages/mobile/src/screens/CategoryManagerScreen.tsx`

- [ ] **Step 1: Update AccountScreen**

Add imports:
```tsx
import { Settings, LogOut } from 'lucide-react-native';
import { fonts } from '../theme/fonts';
```

Replace text/emoji icons for settings and logout with Lucide components. Add `fontFamily: fonts.regular` to body text styles.

- [ ] **Step 2: Update CategoryManagerScreen**

Add imports:
```tsx
import { Plus, Pencil, Trash2 } from 'lucide-react-native';
import { fonts } from '../theme/fonts';
```

Replace text icons for add/edit/delete with Lucide components. Reduce category dots to 5px. Add `fontFamily: fonts.regular` to body text.

- [ ] **Step 3: Update NotesScreen and QuickCaptureScreen fonts**

Add `fontFamily: fonts.regular` where appropriate in both screens.

- [ ] **Step 4: Commit**

```bash
git add packages/mobile/src/screens/AccountScreen.tsx packages/mobile/src/screens/CategoryManagerScreen.tsx packages/mobile/src/screens/NotesScreen.tsx packages/mobile/src/screens/QuickCaptureScreen.tsx
git commit -m "feat(mobile): Lucide icons on Account and CategoryManager, font updates across screens"
```

---

## Chunk 8: Mobile — Build Verification

### Task 20: Verify mobile builds

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check**

```bash
cd packages/mobile && npx tsc --noEmit
```
Expected: No type errors

- [ ] **Step 2: Run tests**

```bash
cd packages/mobile && npm test
```
Expected: All tests pass

- [ ] **Step 3: Verify Android build**

```bash
cd packages/mobile && npm run build:mobile:android
```
Expected: APK builds successfully

- [ ] **Step 4: Verify iOS build**

Open in Xcode and build, or:
```bash
cd packages/mobile/ios && xcodebuild -workspace mobile.xcworkspace -scheme mobile -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 16' build
```

- [ ] **Step 5: Final commit with version bump if needed**
